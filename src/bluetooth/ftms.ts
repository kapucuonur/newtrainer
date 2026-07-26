import type {
  BikeTrainer,
  ConnectionListener,
  ConnectionState,
  IndoorBikeData,
  TrainerCapabilities,
  TrainerDataListener,
} from './types';
import { isWebBluetoothSupported } from './webBluetooth';

/** Bluetooth SIG Fitness Machine Service */
export const FTMS_SERVICE = 0x1826;
export const INDOOR_BIKE_DATA = 0x2ad2;
export const FITNESS_MACHINE_CONTROL_POINT = 0x2ad9;
export const FITNESS_MACHINE_FEATURE = 0x2acc;
export const FITNESS_MACHINE_STATUS = 0x2ada;

const OP = {
  requestControl: 0x00,
  reset: 0x01,
  setTargetResistance: 0x04,
  startOrResume: 0x07,
  stopOrPause: 0x08,
  setIndoorBikeSimulation: 0x11,
} as const;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function parseIndoorBikeData(view: DataView): IndoorBikeData {
  const flags = view.getUint16(0, true);
  let offset = 2;

  let speedKmh: number | null = null;
  let cadenceRpm: number | null = null;
  let distanceMeters: number | null = null;
  let resistanceLevel: number | null = null;
  let powerWatts: number | null = null;
  let heartRateBpm: number | null = null;

  const moreData = (flags & 0x0001) !== 0;
  if (!moreData) {
    speedKmh = view.getUint16(offset, true) / 100;
    offset += 2;
  }

  if (flags & 0x0002) offset += 2; // average speed
  if (flags & 0x0004) {
    cadenceRpm = view.getUint16(offset, true) / 2;
    offset += 2;
  }
  if (flags & 0x0008) offset += 2; // average cadence
  if (flags & 0x0010) {
    distanceMeters =
      view.getUint8(offset) |
      (view.getUint8(offset + 1) << 8) |
      (view.getUint8(offset + 2) << 16);
    offset += 3;
  }
  if (flags & 0x0020) {
    resistanceLevel = view.getInt16(offset, true);
    offset += 2;
  }
  if (flags & 0x0040) {
    powerWatts = view.getInt16(offset, true);
    offset += 2;
  }
  if (flags & 0x0080) offset += 2; // average power
  if (flags & 0x0100) offset += 5; // expended energy
  if (flags & 0x0200) {
    heartRateBpm = view.getUint8(offset);
    offset += 1;
  }

  return {
    speedKmh,
    cadenceRpm,
    powerWatts,
    distanceMeters,
    resistanceLevel,
    heartRateBpm,
    timestamp: Date.now(),
  };
}

function parseFeatureBits(view: DataView): TrainerCapabilities {
  // Fitness Machine Features (first 4 bytes) + Target Setting Features (next 4)
  const features = view.byteLength >= 4 ? view.getUint32(0, true) : 0;
  const target = view.byteLength >= 8 ? view.getUint32(4, true) : 0;

  return {
    supportsPowerMeasurement: (features & (1 << 14)) !== 0 || true,
    supportsTargetResistance: (target & (1 << 3)) !== 0,
    supportsIndoorBikeSimulation: (target & (1 << 13)) !== 0,
  };
}

export class FtmsTrainer implements BikeTrainer {
  readonly kind = 'ftms' as const;
  name = 'FTMS Trainer';

  private device: BluetoothDevice | null = null;
  private server: BluetoothRemoteGATTServer | null = null;
  private controlPoint: BluetoothRemoteGATTCharacteristic | null = null;
  private bikeDataChar: BluetoothRemoteGATTCharacteristic | null = null;
  private state: ConnectionState = isWebBluetoothSupported()
    ? 'disconnected'
    : 'unsupported';
  private capabilities: TrainerCapabilities = {
    supportsTargetResistance: true,
    supportsIndoorBikeSimulation: true,
    supportsPowerMeasurement: true,
  };
  private dataListeners = new Set<TrainerDataListener>();
  private connectionListeners = new Set<ConnectionListener>();
  private boundOnDisconnected = () => {
    this.handleDisconnect('Trainer disconnected');
  };
  private boundOnBikeData = (event: Event) => {
    const char = event.target as BluetoothRemoteGATTCharacteristic;
    if (!char.value) return;
    const data = parseIndoorBikeData(char.value);
    for (const listener of this.dataListeners) listener(data);
  };

  getState(): ConnectionState {
    return this.state;
  }

  getCapabilities(): TrainerCapabilities {
    return this.capabilities;
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

  private setState(state: ConnectionState, message?: string): void {
    this.state = state;
    for (const listener of this.connectionListeners) listener(state, message);
  }

  async connect(): Promise<void> {
    if (!isWebBluetoothSupported() || !navigator.bluetooth) {
      this.setState('unsupported', 'Web Bluetooth is not available');
      throw new Error('Web Bluetooth is not available');
    }

    this.setState('connecting');
    try {
      this.device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [FTMS_SERVICE] }],
        optionalServices: [FTMS_SERVICE],
      });
      this.name = this.device.name ?? 'FTMS Trainer';
      this.device.addEventListener('gattserverdisconnected', this.boundOnDisconnected);

      this.server = await this.device.gatt!.connect();
      const service = await this.server.getPrimaryService(FTMS_SERVICE);

      try {
        const featureChar = await service.getCharacteristic(FITNESS_MACHINE_FEATURE);
        const featureValue = await featureChar.readValue();
        this.capabilities = parseFeatureBits(featureValue);
      } catch {
        // Some trainers omit feature characteristic; keep optimistic defaults.
      }

      this.controlPoint = await service.getCharacteristic(FITNESS_MACHINE_CONTROL_POINT);
      this.bikeDataChar = await service.getCharacteristic(INDOOR_BIKE_DATA);
      this.bikeDataChar.addEventListener('characteristicvaluechanged', this.boundOnBikeData);
      await this.bikeDataChar.startNotifications();

      await this.writeControl([OP.requestControl]);
      await delay(80);

      this.setState('connected');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to connect';
      await this.cleanup();
      this.setState('error', message);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    await this.cleanup();
    this.setState('disconnected');
  }

  async start(): Promise<void> {
    await this.writeControl([OP.startOrResume]);
  }

  async stop(): Promise<void> {
    await this.writeControl([OP.stopOrPause, 0x01]);
  }

  async setTargetResistance(level: number): Promise<void> {
    const clamped = Math.max(0, Math.min(100, level));
    const raw = Math.round(clamped * 10);
    await this.writeControl([OP.setTargetResistance, raw & 0xff]);
  }

  async setSimulation(params: {
    gradePercent: number;
    windSpeedMs?: number;
    crr?: number;
    cw?: number;
  }): Promise<void> {
    if (!this.capabilities.supportsIndoorBikeSimulation) {
      // Fallback: map grade to resistance level (0–100).
      const resistance = Math.max(0, Math.min(100, 20 + params.gradePercent * 4));
      await this.setTargetResistance(resistance);
      return;
    }

    const wind = Math.round((params.windSpeedMs ?? 0) * 1000);
    const grade = Math.round(params.gradePercent * 100);
    const crr = Math.round((params.crr ?? 0.004) * 10000);
    const cw = Math.round((params.cw ?? 0.51) * 100);

    const buffer = new ArrayBuffer(7);
    const view = new DataView(buffer);
    view.setUint8(0, OP.setIndoorBikeSimulation);
    view.setInt16(1, wind, true);
    view.setInt16(3, grade, true);
    view.setUint8(5, Math.max(0, Math.min(255, crr)));
    view.setUint8(6, Math.max(0, Math.min(255, cw)));
    await this.writeControlBytes(new Uint8Array(buffer));
  }

  private async writeControl(bytes: number[]): Promise<void> {
    await this.writeControlBytes(new Uint8Array(bytes));
  }

  private async writeControlBytes(value: Uint8Array): Promise<void> {
    if (!this.controlPoint) throw new Error('Trainer control point not ready');
    const payload = value.buffer.slice(
      value.byteOffset,
      value.byteOffset + value.byteLength,
    ) as ArrayBuffer;
    try {
      if (this.controlPoint.properties.writeWithoutResponse) {
        await this.controlPoint.writeValueWithoutResponse(payload);
      } else {
        await this.controlPoint.writeValueWithResponse(payload);
      }
    } catch {
      await this.controlPoint.writeValue(payload);
    }
  }

  private handleDisconnect(message?: string): void {
    void this.cleanup();
    this.setState('disconnected', message);
  }

  private async cleanup(): Promise<void> {
    try {
      if (this.bikeDataChar) {
        this.bikeDataChar.removeEventListener(
          'characteristicvaluechanged',
          this.boundOnBikeData,
        );
        try {
          await this.bikeDataChar.stopNotifications();
        } catch {
          // ignore
        }
      }
    } catch {
      // ignore
    }

    if (this.device) {
      this.device.removeEventListener('gattserverdisconnected', this.boundOnDisconnected);
      try {
        this.device.gatt?.disconnect();
      } catch {
        // ignore
      }
    }

    this.device = null;
    this.server = null;
    this.controlPoint = null;
    this.bikeDataChar = null;
  }
}
