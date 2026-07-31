import type {
  ConnectionListener,
  ConnectionState,
  HeartRateListener,
  HeartRateSample,
} from './types';
import {
  describeBluetoothError,
  isWebBluetoothSupported,
  requestBluetoothDevice,
} from './webBluetooth';

/** Bluetooth SIG Heart Rate Service */
export const HEART_RATE_SERVICE = 0x180d;
export const HEART_RATE_MEASUREMENT = 0x2a37;

export function parseHeartRateMeasurement(view: DataView): HeartRateSample {
  const flags = view.getUint8(0);
  const isUint16 = (flags & 0x01) !== 0;
  const contactBits = (flags >> 1) & 0x03;
  const bpm = isUint16 ? view.getUint16(1, true) : view.getUint8(1);

  let contactDetected: boolean | null = null;
  if (contactBits === 2) contactDetected = false;
  if (contactBits === 3) contactDetected = true;

  return { bpm, contactDetected, timestamp: Date.now() };
}

export class HeartRateMonitor {
  name = 'Heart Rate';
  private device: BluetoothDevice | null = null;
  private characteristic: BluetoothRemoteGATTCharacteristic | null = null;
  private state: ConnectionState = isWebBluetoothSupported()
    ? 'disconnected'
    : 'unsupported';
  private listeners = new Set<HeartRateListener>();
  private connectionListeners = new Set<ConnectionListener>();
  private lastSample: HeartRateSample | null = null;

  private boundOnDisconnected = () => {
    void this.cleanup();
    this.setState('disconnected', 'Heart rate strap disconnected');
  };

  private boundOnValue = (event: Event) => {
    const char = event.target as BluetoothRemoteGATTCharacteristic;
    if (!char.value) return;
    const sample = parseHeartRateMeasurement(char.value);
    this.lastSample = sample;
    for (const listener of this.listeners) listener(sample);
  };

  getState(): ConnectionState {
    return this.state;
  }

  getLastSample(): HeartRateSample | null {
    return this.lastSample;
  }

  onSample(listener: HeartRateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
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
      // requestDevice must stay the first await (Bluefy requires a fresh user gesture).
      this.device = await requestBluetoothDevice({
        filters: [
          { services: [HEART_RATE_SERVICE] },
          { namePrefix: 'Garmin' },
          { namePrefix: 'Polar' },
          { namePrefix: 'Wahoo' },
          { namePrefix: 'Suunto' },
          { namePrefix: 'TICKR' },
          { namePrefix: 'HRM' },
          { namePrefix: 'Heart' },
          { namePrefix: 'H7' },
          { namePrefix: 'H9' },
          { namePrefix: 'H10' },
          { namePrefix: 'OH1' },
          { namePrefix: 'Magene' },
          { namePrefix: 'WHOOP' },
        ],
        optionalServices: [HEART_RATE_SERVICE, 0x180f, 0x180a],
      });
      this.name = this.device.name ?? 'Heart Rate';
      this.device.addEventListener('gattserverdisconnected', this.boundOnDisconnected);

      const server = await this.device.gatt!.connect();
      const service = await server.getPrimaryService(HEART_RATE_SERVICE);
      this.characteristic = await service.getCharacteristic(HEART_RATE_MEASUREMENT);
      this.characteristic.addEventListener('characteristicvaluechanged', this.boundOnValue);
      await this.characteristic.startNotifications();
      this.setState('connected');
    } catch (error) {
      const message = describeBluetoothError(error);
      await this.cleanup();
      this.setState('error', message);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    await this.cleanup();
    this.setState('disconnected');
  }

  private async cleanup(): Promise<void> {
    try {
      if (this.characteristic) {
        this.characteristic.removeEventListener(
          'characteristicvaluechanged',
          this.boundOnValue,
        );
        try {
          await this.characteristic.stopNotifications();
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
    this.characteristic = null;
    this.lastSample = null;
  }
}
