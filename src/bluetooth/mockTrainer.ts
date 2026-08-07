import type {
  BikeTrainer,
  ConnectionListener,
  ConnectionState,
  IndoorBikeData,
  TrainerCapabilities,
  TrainerDataListener,
} from './types';

/**
 * Software trainer for UI development and browsers without hardware.
 * Simulates cadence/power/speed and responds to grade/resistance/ERG changes.
 */
export class MockTrainer implements BikeTrainer {
  readonly kind = 'mock' as const;
  name = 'Demo Trainer (Mock)';

  private state: ConnectionState = 'disconnected';
  private dataListeners = new Set<TrainerDataListener>();
  private connectionListeners = new Set<ConnectionListener>();
  private timer: number | null = null;
  private gradePercent = 0;
  private resistanceLevel = 20;
  private targetPowerWatts: number | null = null;
  private riding = false;
  private distanceMeters = 0;
  private effort = 0.72; // 0–1 user effort knob

  getState(): ConnectionState {
    return this.state;
  }

  getCapabilities(): TrainerCapabilities {
    return {
      supportsTargetResistance: true,
      supportsIndoorBikeSimulation: true,
      supportsPowerMeasurement: true,
      supportsTargetPower: true,
    };
  }

  onData(listener: TrainerDataListener): () => void {
    this.dataListeners.add(listener);
    return () => this.dataListeners.delete(listener);
  }

  onConnection(listener: ConnectionListener): () => void {
    this.connectionListeners.add(listener);
    listener(this.state);
    return () => this.connectionListeners.delete(listener);
  }

  setEffort(effort: number): void {
    this.effort = Math.max(0.2, Math.min(1, effort));
  }

  async connect(): Promise<void> {
    this.setState('connecting');
    await new Promise((r) => setTimeout(r, 350));
    this.setState('connected');
    this.startLoop();
  }

  async disconnect(): Promise<void> {
    this.stopLoop();
    this.riding = false;
    this.targetPowerWatts = null;
    this.setState('disconnected');
  }

  async start(): Promise<void> {
    this.riding = true;
  }

  async stop(): Promise<void> {
    this.riding = false;
  }

  async setTargetResistance(level: number): Promise<void> {
    this.targetPowerWatts = null;
    this.resistanceLevel = Math.max(0, Math.min(100, level));
    this.gradePercent = (this.resistanceLevel - 20) / 4;
  }

  async setTargetPower(watts: number | null): Promise<void> {
    this.targetPowerWatts =
      watts == null ? null : Math.max(0, Math.min(4000, Math.round(watts)));
  }

  async setSimulation(params: {
    gradePercent: number;
    windSpeedMs?: number;
    crr?: number;
    cw?: number;
  }): Promise<void> {
    this.targetPowerWatts = null;
    this.gradePercent = params.gradePercent;
    this.resistanceLevel = Math.max(0, Math.min(100, 20 + params.gradePercent * 4));
  }

  private setState(state: ConnectionState, message?: string): void {
    this.state = state;
    for (const listener of this.connectionListeners) listener(state, message);
  }

  private startLoop(): void {
    this.stopLoop();
    let last = performance.now();
    this.timer = window.setInterval(() => {
      const now = performance.now();
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;

      let powerWatts: number;
      let cadenceRpm: number;
      let speedKmh: number;

      if (this.targetPowerWatts != null) {
        // ERG: hold near target regardless of grade.
        powerWatts = Math.round(
          this.targetPowerWatts + Math.sin(now / 900) * 4,
        );
        cadenceRpm = Math.round(85 + Math.sin(now / 700) * 2);
        const speedMs = Math.max(1.8, 2.4 + Math.sqrt(Math.max(powerWatts, 1)) * 0.32);
        speedKmh = speedMs * 3.6;
      } else {
        // Realistic Cycling Physics: Power increases on climbs, eases off on descents, speed driven by gravity & drag
        const grade = this.gradePercent;
        const m = 85; // kg (rider + bike)
        const g = 9.81;
        const sinTheta = grade / 100;
        const Crr = 0.004;
        const CdA_rho = 0.18;

        if (grade < -0.5) {
          // Downhill descent: power eases off (light spinning/coasting: 40W - 110W)
          powerWatts = Math.round(Math.max(30, (80 + this.effort * 60) + Math.sin(now / 800) * 8));
          cadenceRpm = Math.round(Math.max(45, 80 + Math.sin(now / 700) * 4));

          const gravityPull = m * g * (Math.abs(sinTheta) - Crr);
          const coastingSpeedMs = Math.sqrt(Math.max(0.1, gravityPull / CdA_rho));
          const extraSpeedMs = (powerWatts / 180) * 2.2;
          speedKmh = Math.min(85, (coastingSpeedMs + extraSpeedMs) * 3.6);
        } else {
          // Uphill / Flat: power increases with climb gradient effort
          const basePower = 150 + this.effort * 180;
          const climbExtra = Math.max(0, grade * 20);
          powerWatts = Math.round(Math.max(50, basePower + climbExtra + Math.sin(now / 800) * 10));

          cadenceRpm = Math.round(75 + (this.effort * 20) - (grade * 1.5) + Math.sin(now / 700) * 3);
          cadenceRpm = Math.max(55, Math.min(120, cadenceRpm));

          const gravityResistance = m * g * (sinTheta + Crr);
          let v = 5.0; // initial guess
          for (let iter = 0; iter < 5; iter++) {
            const fv = gravityResistance * v + CdA_rho * Math.pow(v, 3) - powerWatts;
            const dfv = gravityResistance + (CdA_rho * 3) * Math.pow(v, 2);
            v = Math.max(0.8, v - fv / dfv);
          }
          speedKmh = v * 3.6;
        }
      }

      if (this.riding) {
        this.distanceMeters += (speedKmh / 3.6) * dt;
      }

      const data: IndoorBikeData = {
        speedKmh: Number(speedKmh.toFixed(1)),
        cadenceRpm,
        powerWatts,
        distanceMeters: Math.round(this.distanceMeters),
        resistanceLevel: Number(this.resistanceLevel.toFixed(1)),
        heartRateBpm: null,
        timestamp: Date.now(),
      };

      for (const listener of this.dataListeners) listener(data);
    }, 200);
  }

  private stopLoop(): void {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
  }
}
