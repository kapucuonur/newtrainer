export type ConnectionState =
  | 'unsupported'
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error';

export interface IndoorBikeData {
  speedKmh: number | null;
  cadenceRpm: number | null;
  powerWatts: number | null;
  distanceMeters: number | null;
  resistanceLevel: number | null;
  heartRateBpm: number | null;
  timestamp: number;
}

export interface HeartRateSample {
  bpm: number;
  contactDetected: boolean | null;
  timestamp: number;
}

export interface TrainerCapabilities {
  supportsTargetResistance: boolean;
  supportsIndoorBikeSimulation: boolean;
  supportsPowerMeasurement: boolean;
  /** FTMS Target Setting Features bit 3 — Set Target Power (0x05). */
  supportsTargetPower: boolean;
}

export type TrainerDataListener = (data: IndoorBikeData) => void;
export type HeartRateListener = (sample: HeartRateSample) => void;
export type ConnectionListener = (state: ConnectionState, message?: string) => void;

export interface BikeTrainer {
  readonly kind: 'ftms' | 'mock' | 'wifi-bridge';
  readonly name: string;
  getState(): ConnectionState;
  getCapabilities(): TrainerCapabilities;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  setTargetResistance(level: number): Promise<void>;
  setSimulation(params: {
    gradePercent: number;
    windSpeedMs?: number;
    crr?: number;
    cw?: number;
  }): Promise<void>;
  /**
   * FTMS Set Target Power (0x05). Pass `null` to leave ERG (no 0 W write);
   * caller should restore SIM/resistance afterward.
   */
  setTargetPower(watts: number | null): Promise<void>;
  onData(listener: TrainerDataListener): () => void;
  onConnection(listener: ConnectionListener): () => void;
}

declare global {
  interface Navigator {
    bluetooth?: Bluetooth;
  }

  interface Bluetooth {
    requestDevice(options: RequestDeviceOptions): Promise<BluetoothDevice>;
    getAvailability(): Promise<boolean>;
  }

  interface RequestDeviceOptions {
    filters?: BluetoothLEScanFilter[];
    optionalServices?: BluetoothServiceUUID[];
    acceptAllDevices?: boolean;
  }

  interface BluetoothLEScanFilter {
    services?: BluetoothServiceUUID[];
    name?: string;
    namePrefix?: string;
  }

  type BluetoothServiceUUID = number | string;
  type BluetoothCharacteristicUUID = number | string;

  interface BluetoothDevice extends EventTarget {
    id: string;
    name?: string;
    gatt?: BluetoothRemoteGATTServer;
  }

  interface BluetoothRemoteGATTServer {
    connected: boolean;
    device: BluetoothDevice;
    connect(): Promise<BluetoothRemoteGATTServer>;
    disconnect(): void;
    getPrimaryService(
      service: BluetoothServiceUUID,
    ): Promise<BluetoothRemoteGATTService>;
  }

  interface BluetoothRemoteGATTService {
    getCharacteristic(
      characteristic: BluetoothCharacteristicUUID,
    ): Promise<BluetoothRemoteGATTCharacteristic>;
  }

  interface BluetoothRemoteGATTCharacteristic extends EventTarget {
    value?: DataView;
    properties: BluetoothCharacteristicProperties;
    startNotifications(): Promise<BluetoothRemoteGATTCharacteristic>;
    stopNotifications(): Promise<BluetoothRemoteGATTCharacteristic>;
    writeValue(value: BufferSource): Promise<void>;
    writeValueWithResponse(value: BufferSource): Promise<void>;
    writeValueWithoutResponse(value: BufferSource): Promise<void>;
    readValue(): Promise<DataView>;
  }

  interface BluetoothCharacteristicProperties {
    broadcast: boolean;
    read: boolean;
    writeWithoutResponse: boolean;
    write: boolean;
    notify: boolean;
    indicate: boolean;
  }
}
