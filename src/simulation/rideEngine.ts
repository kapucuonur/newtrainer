import type { BikeTrainer, IndoorBikeData } from '../bluetooth/types';
import type { RideExport, TrackPoint } from '../export/types';
import { gradeAtDistance } from '../elevation/service';
import type { EnrichedRoute } from '../routing/types';

export type RidePhase = 'idle' | 'ready' | 'riding' | 'paused' | 'finished';

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
  trainerResistanceHint: number;
  /** True when a completed (or mid-finish) track is available for FIT/GPX download. */
  hasExport: boolean;
}

export type RideTelemetryListener = (telemetry: RideTelemetry) => void;

const SAMPLE_INTERVAL_MS = 1000;

/**
 * Advances a virtual bike along a polyline using trainer speed/power,
 * and pushes elevation grade to the trainer (SIM / resistance).
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
    if (trainer) {
      this.unsubTrainer = trainer.onData((data) => {
        this.lastBike = data;
      });
    }
  }

  setHeartRate(bpm: number | null): void {
    this.heartRateBpm = bpm;
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
    await this.trainer?.start();
    await this.applyGrade(true);
    this.loop();
    this.emit();
  }

  async pause(): Promise<void> {
    if (this.phase !== 'riding') return;
    this.recordSample(true);
    this.phase = 'paused';
    cancelAnimationFrame(this.raf);
    await this.trainer?.stop();
    this.emit();
  }

  async resume(): Promise<void> {
    if (this.phase !== 'paused') return;
    this.phase = 'riding';
    this.lastTick = performance.now();
    await this.trainer?.start();
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
      await this.trainer?.setSimulation({ gradePercent: 0 });
      this.emit();
      return;
    }

    this.phase = this.route ? 'ready' : 'idle';
    cancelAnimationFrame(this.raf);
    this.distanceMeters = 0;
    this.elapsedSeconds = 0;
    await this.trainer?.stop();
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
      void this.trainer?.setSimulation({ gradePercent: 0 });
      this.emit();
      return;
    }

    this.recordSample(false);
    void this.applyGrade(false);
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
      bike?.speedKmh && bike.speedKmh > 0.5
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
    if (bike?.speedKmh && bike.speedKmh > 0.5) return bike.speedKmh;

    // Power → speed estimate when trainer omits speed
    const power = bike?.powerWatts ?? 0;
    if (power > 0) {
      const at = this.route
        ? gradeAtDistance(this.route.samples, this.distanceMeters)
        : { gradePercent: 0 };
      const gradeFactor = 1 - Math.max(-0.3, Math.min(0.5, at.gradePercent / 14));
      const speedMs = Math.max(1.2, (2.2 + Math.sqrt(power) * 0.35) * gradeFactor);
      return speedMs * 3.6;
    }

    return 0;
  }

  private async applyGrade(force: boolean): Promise<void> {
    if (!this.route || !this.trainer) return;
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

  private snapshot(): RideTelemetry {
    const routeDistanceMeters = this.route?.distanceMeters ?? 0;
    const at = this.route
      ? gradeAtDistance(this.route.samples, this.distanceMeters)
      : null;
    const bike = this.lastBike;
    const gradePercent = at?.gradePercent ?? 0;

    return {
      phase: this.phase,
      distanceMeters: this.distanceMeters,
      routeDistanceMeters,
      progress:
        routeDistanceMeters > 0
          ? Math.min(1, this.distanceMeters / routeDistanceMeters)
          : 0,
      speedKmh: bike?.speedKmh ?? (this.phase === 'riding' ? this.resolveSpeedKmh() : 0),
      powerWatts: bike?.powerWatts ?? 0,
      cadenceRpm: bike?.cadenceRpm ?? 0,
      heartRateBpm: this.heartRateBpm ?? bike?.heartRateBpm ?? null,
      gradePercent,
      elevationMeters: at?.elevationMeters ?? 0,
      elapsedSeconds: this.elapsedSeconds,
      position: at ? { lat: at.lat, lng: at.lng } : null,
      trainerResistanceHint: Math.max(0, Math.min(100, 20 + gradePercent * 4)),
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
