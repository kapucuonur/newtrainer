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
        const gradeFactor = 1 - Math.max(-0.35, Math.min(0.55, this.gradePercent / 12));
        const basePower = 90 + this.effort * 220;
        powerWatts = Math.round(
          Math.max(40, basePower * gradeFactor + Math.sin(now / 900) * 8),
        );
        cadenceRpm = Math.round(70 + this.effort * 25 + Math.sin(now / 700) * 3);
        const flatSpeed = 8 + Math.sqrt(Math.max(powerWatts, 1)) * 1.15;
        const speedMs = Math.max(1.5, flatSpeed * gradeFactor);
        speedKmh = speedMs * 3.6;
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
