import type { BikeTrainer, IndoorBikeData } from '../bluetooth/types';
import type { RideExport, TrackPoint } from '../export/types';
import { gradeAtDistance } from '../elevation/service';
import type { EnrichedRoute } from '../routing/types';

export type RidePhase = 'idle' | 'ready' | 'riding' | 'paused' | 'finished';

/** How grade/power is pushed to the trainer. */
export type TrainerControlMode = 'sim' | 'resistance' | 'erg';

/** Rider-selected control: map SIM vs target-power (hardware ERG or HUD effort). */
export type RidePowerMode = 'free' | 'erg';

export interface RideTelemetry {
  phase: RidePhase;
  distanceMeters: number;
  routeDistanceMeters: number;
  progress: number;
  speedKmh: number;
  powerWatts: number;
  cadenceRpm: number;
  heartRateBpm: number | null;
  gradePercent: number;
  elevationMeters: number;
  elapsedSeconds: number;
  position: { lat: number; lng: number } | null;
  /** Resistance level (0–100) used when SIM is unavailable: 20 + grade×4. */
  trainerResistanceHint: number;
  /** Last grade % written via setSimulation (null before first send). */
  trainerGradeSent: number | null;
  /** Active FTMS control path; null when no trainer is attached. */
  trainerControlMode: TrainerControlMode | null;
  /** Free (map SIM) vs ERG / effort-target mode. */
  powerMode: RidePowerMode;
  /** HUD / ERG target watts (null when free and no effort overlay). */
  targetPowerWatts: number | null;
  /** True when watts were written to the trainer (real ERG lock). */
  ergHardwareActive: boolean;
  /** Trainer advertises FTMS target power; null when disconnected. */
  supportsTargetPower: boolean | null;
  /** True when a completed (or mid-finish) track is available for FIT/GPX download. */
  hasExport: boolean;
}

export type RideTelemetryListener = (telemetry: RideTelemetry) => void;

const SAMPLE_INTERVAL_MS = 1000;

/** Keep last-known fields — trainers often alternate speed-only / power-only packets. */
function mergeBikeData(
  prev: IndoorBikeData | null,
  next: IndoorBikeData,
): IndoorBikeData {
  return {
    speedKmh: next.speedKmh ?? prev?.speedKmh ?? null,
    cadenceRpm: next.cadenceRpm ?? prev?.cadenceRpm ?? null,
    powerWatts: next.powerWatts ?? prev?.powerWatts ?? null,
    distanceMeters: next.distanceMeters ?? prev?.distanceMeters ?? null,
    resistanceLevel: next.resistanceLevel ?? prev?.resistanceLevel ?? null,
    heartRateBpm: next.heartRateBpm ?? prev?.heartRateBpm ?? null,
    timestamp: next.timestamp,
  };
}

/**
 * Advances a virtual bike along a polyline using trainer speed/power,
 * and pushes elevation grade to the trainer (SIM / resistance) — unless ERG is active.
 */
export class RideEngine {
  private route: EnrichedRoute | null = null;
  private trainer: BikeTrainer | null = null;
  private phase: RidePhase = 'idle';
  private distanceMeters = 0;
  private elapsedSeconds = 0;
  private lastTick = 0;
  private raf = 0;
  private gradeSendAt = 0;
  private lastGradeSent = Number.NaN;
  private heartRateBpm: number | null = null;
  private lastBike: IndoorBikeData | null = null;
  private listeners = new Set<RideTelemetryListener>();
  private unsubTrainer: (() => void) | null = null;

  private powerMode: RidePowerMode = 'free';
  private targetPowerWatts: number | null = null;
  private ergHardwareActive = false;
  private powerSendAt = 0;

  private track: TrackPoint[] = [];
  private rideStartedAtMs = 0;
  private rideFinishedAtMs = 0;
  private lastSampleElapsed = -1;

  setRoute(route: EnrichedRoute | null): void {
    this.route = route;
    this.distanceMeters = 0;
    this.elapsedSeconds = 0;
    this.track = [];
    this.rideStartedAtMs = 0;
    this.rideFinishedAtMs = 0;
    this.lastSampleElapsed = -1;
    this.phase = route ? 'ready' : 'idle';
    this.emit();
  }

  attachTrainer(trainer: BikeTrainer | null): void {
    this.unsubTrainer?.();
    this.unsubTrainer = null;
    this.trainer = trainer;
    this.lastBike = null;
    this.ergHardwareActive = false;
    if (trainer) {
      this.unsubTrainer = trainer.onData((data) => {
        this.lastBike = mergeBikeData(this.lastBike, data);
        // Emit immediately so HUD updates even before the RAF loop starts.
        this.emit();
      });
      // Re-apply mode against new trainer capabilities.
      void this.syncTrainerPowerControl(true);
    } else if (this.powerMode === 'erg') {
      // Keep HUD target; hardware lock is gone.
      this.ergHardwareActive = false;
    }
    this.emit();
  }

  setHeartRate(bpm: number | null): void {
    this.heartRateBpm = bpm;
    this.emit();
  }

  getPowerMode(): RidePowerMode {
    return this.powerMode;
  }

  getTargetPowerWatts(): number | null {
    return this.targetPowerWatts;
  }

  /**
   * Switch Free (map SIM) ↔ ERG. When trainer lacks target power, ERG degrades to
   * HUD effort-target only and SIM grade continues.
   */
  async setPowerMode(mode: RidePowerMode): Promise<void> {
    if (this.powerMode === mode) return;
    this.powerMode = mode;
    await this.syncTrainerPowerControl(true);
    this.emit();
  }

  /** Set absolute target watts (shown on HUD; written to trainer in hardware ERG). */
  async setTargetPowerWatts(watts: number | null): Promise<void> {
    this.targetPowerWatts =
      watts == null ? null : Math.max(0, Math.min(4000, Math.round(watts)));
    await this.syncTrainerPowerControl(true);
    this.emit();
  }

  getPhase(): RidePhase {
    return this.phase;
  }

  onTelemetry(listener: RideTelemetryListener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  getExport(): RideExport | null {
    if (this.track.length === 0 || this.rideStartedAtMs <= 0) return null;
    return {
      startedAtMs: this.rideStartedAtMs,
      finishedAtMs: this.rideFinishedAtMs || Date.now(),
      elapsedSeconds: this.elapsedSeconds,
      distanceMeters: this.distanceMeters,
      points: this.track.slice(),
    };
  }

  async start(): Promise<void> {
    if (!this.route || this.route.samples.length < 2) {
      throw new Error('Select a route before starting');
    }
    if (this.phase === 'riding') return;

    this.distanceMeters = 0;
    this.elapsedSeconds = 0;
    this.track = [];
    this.rideStartedAtMs = Date.now();
    this.rideFinishedAtMs = 0;
    this.lastSampleElapsed = -1;

    this.phase = 'riding';
    this.lastTick = performance.now();
    this.recordSample(true);
    // Always start the RAF loop — trainer opcodes must not block map/HUD progress.
    try {
      await this.trainer?.start();
    } catch {
      // StartOrResume may fail; Indoor Bike Data can still stream.
    }
    try {
      await this.syncTrainerPowerControl(true);
      if (!this.ergHardwareActive) {
        await this.applyGrade(true);
      }
    } catch {
      // SIM/ERG writes are best-effort.
    }
    this.loop();
    this.emit();
  }

  async pause(): Promise<void> {
    if (this.phase !== 'riding') return;
    this.recordSample(true);
    this.phase = 'paused';
    cancelAnimationFrame(this.raf);
    try {
      await this.trainer?.stop();
    } catch {
      // ignore
    }
    this.emit();
  }

  async resume(): Promise<void> {
    if (this.phase !== 'paused') return;
    this.phase = 'riding';
    this.lastTick = performance.now();
    try {
      await this.trainer?.start();
    } catch {
      // ignore
    }
    try {
      await this.syncTrainerPowerControl(true);
    } catch {
      // ignore
    }
    this.loop();
    this.emit();
  }

  /**
   * While riding/paused: end the ride → finished (keep track for download).
   * While finished: dismiss to ready/idle (track kept until next start/clear).
   */
  async stop(): Promise<void> {
    if (this.phase === 'riding' || this.phase === 'paused') {
      cancelAnimationFrame(this.raf);
      this.recordSample(true);
      this.phase = 'finished';
      this.rideFinishedAtMs = Date.now();
      await this.trainer?.stop();
      await this.exitHardwareErg();
      await this.trainer?.setSimulation({ gradePercent: 0 });
      this.emit();
      return;
    }

    this.phase = this.route ? 'ready' : 'idle';
    cancelAnimationFrame(this.raf);
    this.distanceMeters = 0;
    this.elapsedSeconds = 0;
    await this.trainer?.stop();
    await this.exitHardwareErg();
    await this.trainer?.setSimulation({ gradePercent: 0 });
    this.emit();
  }

  private loop = (): void => {
    if (this.phase !== 'riding') return;
    const now = performance.now();
    const dt = Math.min(0.25, (now - this.lastTick) / 1000);
    this.lastTick = now;
    this.elapsedSeconds += dt;

    const speedKmh = this.resolveSpeedKmh();
    const speedMs = speedKmh / 3.6;
    this.distanceMeters += speedMs * dt;

    const routeLen = this.route?.distanceMeters ?? 0;
    if (routeLen > 0 && this.distanceMeters >= routeLen) {
      this.distanceMeters = routeLen;
      this.recordSample(true);
      this.phase = 'finished';
      this.rideFinishedAtMs = Date.now();
      cancelAnimationFrame(this.raf);
      void this.trainer?.stop();
      void this.exitHardwareErg().then(() =>
        this.trainer?.setSimulation({ gradePercent: 0 }),
      );
      this.emit();
      return;
    }

    this.recordSample(false);
    if (this.ergHardwareActive) {
      void this.pushTargetPower(false);
    } else {
      void this.applyGrade(false);
    }
    this.emit();
    this.raf = requestAnimationFrame(this.loop);
  };

  private recordSample(force: boolean): void {
    if (this.rideStartedAtMs <= 0) return;
    if (!force && this.elapsedSeconds - this.lastSampleElapsed < SAMPLE_INTERVAL_MS / 1000) {
      return;
    }

    const at = this.route
      ? gradeAtDistance(this.route.samples, this.distanceMeters)
      : null;
    if (!at) return;

    const bike = this.lastBike;
    const speedKmh =
      bike?.speedKmh != null && bike.speedKmh > 0.5
        ? bike.speedKmh
        : this.phase === 'riding'
          ? this.resolveSpeedKmh()
          : (bike?.speedKmh ?? 0);

    const point: TrackPoint = {
      timestampMs: this.rideStartedAtMs + this.elapsedSeconds * 1000,
      lat: at.lat,
      lng: at.lng,
      elevationMeters: at.elevationMeters,
      distanceMeters: this.distanceMeters,
      speedKmh,
      powerWatts: bike?.powerWatts ?? 0,
      cadenceRpm: bike?.cadenceRpm ?? 0,
      heartRateBpm: this.heartRateBpm ?? bike?.heartRateBpm ?? null,
    };

    // Avoid duplicate timestamps when forcing multiple samples in one tick.
    const last = this.track.at(-1);
    if (last && Math.abs(last.timestampMs - point.timestampMs) < 1) {
      this.track[this.track.length - 1] = point;
    } else {
      this.track.push(point);
    }
    this.lastSampleElapsed = this.elapsedSeconds;
  }

  private resolveSpeedKmh(): number {
    const bike = this.lastBike;
    if (bike?.speedKmh != null && bike.speedKmh > 0.5) return bike.speedKmh;

    const power = bike?.powerWatts ?? 0;
    if (power > 0) {
      const at = this.route
        ? gradeAtDistance(this.route.samples, this.distanceMeters)
        : { gradePercent: 0 };
      
      const grade = at.gradePercent;
      const m = 85; // kg (rider + bike)
      const g = 9.81;
      const sinTheta = grade / 100;
      const Crr = 0.004;
      const gravityResistance = m * g * (sinTheta + Crr);

      // Solve v (m/s) from P = m*g*v*(sinTheta + Crr) + 0.18*v^3
      let v = 5.0;
      for (let iter = 0; iter < 5; iter++) {
        const fv = gravityResistance * v + 0.18 * Math.pow(v, 3) - power;
        const dfv = gravityResistance + 0.54 * Math.pow(v, 2);
        v = Math.max(0.8, v - fv / dfv);
      }
      return v * 3.6;
    }

    const cadence = bike?.cadenceRpm ?? 0;
    if (cadence > 40) {
      return Math.max(8, (cadence / 70) * 25);
    }

    return 0;
  }

  private async applyGrade(force: boolean): Promise<void> {
    if (!this.route || !this.trainer) return;
    if (this.ergHardwareActive) return;
    const now = performance.now();
    if (!force && now - this.gradeSendAt < 800) return;

    const at = gradeAtDistance(this.route.samples, this.distanceMeters);
    if (!force && Math.abs(at.gradePercent - this.lastGradeSent) < 0.15) return;

    this.gradeSendAt = now;
    this.lastGradeSent = at.gradePercent;
    try {
      await this.trainer.setSimulation({
        gradePercent: at.gradePercent,
        windSpeedMs: 0,
        crr: 0.004,
        cw: 0.51,
      });
    } catch {
      // Trainer may reject SIM opcodes mid-ride; keep UI moving.
    }
  }

  private canUseHardwareErg(): boolean {
    return Boolean(this.trainer?.getCapabilities().supportsTargetPower);
  }

  private async exitHardwareErg(): Promise<void> {
    if (!this.ergHardwareActive) return;
    this.ergHardwareActive = false;
    try {
      await this.trainer?.setTargetPower(null);
    } catch {
      // ignore
    }
  }

  private async pushTargetPower(force: boolean): Promise<void> {
    if (!this.trainer || this.targetPowerWatts == null) return;
    if (!this.canUseHardwareErg()) return;
    const now = performance.now();
    if (!force && now - this.powerSendAt < 1000) return;
    this.powerSendAt = now;
    try {
      await this.trainer.setTargetPower(this.targetPowerWatts);
      this.ergHardwareActive = true;
    } catch {
      this.ergHardwareActive = false;
    }
  }

  private async syncTrainerPowerControl(force: boolean): Promise<void> {
    if (this.powerMode === 'erg' && this.targetPowerWatts != null && this.canUseHardwareErg()) {
      await this.pushTargetPower(force);
      return;
    }

    const wasErg = this.ergHardwareActive;
    await this.exitHardwareErg();
    if (wasErg || force) {
      await this.applyGrade(true);
    }
  }

  private snapshot(): RideTelemetry {
    const routeDistanceMeters = this.route?.distanceMeters ?? 0;
    const at = this.route
      ? gradeAtDistance(this.route.samples, this.distanceMeters)
      : null;
    const bike = this.lastBike;
    const gradePercent = at?.gradePercent ?? 0;
    const gradeForTrainer = Number.isFinite(this.lastGradeSent)
      ? this.lastGradeSent
      : gradePercent;
    const caps = this.trainer?.getCapabilities();
    let trainerControlMode: TrainerControlMode | null = null;
    if (this.trainer) {
      if (this.ergHardwareActive) {
        trainerControlMode = 'erg';
      } else if (caps?.supportsIndoorBikeSimulation) {
        trainerControlMode = 'sim';
      } else {
        trainerControlMode = 'resistance';
      }
    }

    return {
      phase: this.phase,
      distanceMeters: this.distanceMeters,
      routeDistanceMeters,
      progress:
        routeDistanceMeters > 0
          ? Math.min(1, this.distanceMeters / routeDistanceMeters)
          : 0,
      speedKmh:
        this.phase === 'riding' || this.phase === 'paused'
          ? this.resolveSpeedKmh()
          : (bike?.speedKmh ?? 0),
      powerWatts: bike?.powerWatts ?? 0,
      cadenceRpm: bike?.cadenceRpm ?? 0,
      heartRateBpm: this.heartRateBpm ?? bike?.heartRateBpm ?? null,
      gradePercent,
      elevationMeters: at?.elevationMeters ?? 0,
      elapsedSeconds: this.elapsedSeconds,
      position: at ? { lat: at.lat, lng: at.lng } : null,
      trainerResistanceHint: Math.max(0, Math.min(100, 20 + gradeForTrainer * 4)),
      trainerGradeSent: Number.isFinite(this.lastGradeSent) ? this.lastGradeSent : null,
      trainerControlMode,
      powerMode: this.powerMode,
      targetPowerWatts: this.targetPowerWatts,
      ergHardwareActive: this.ergHardwareActive,
      supportsTargetPower: this.trainer ? Boolean(caps?.supportsTargetPower) : null,
      hasExport: this.track.length > 0,
    };
  }

  private emit(): void {
    const snap = this.snapshot();
    for (const listener of this.listeners) listener(snap);
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.unsubTrainer?.();
    this.listeners.clear();
  }
}
