import type {
  BleCharacteristicProperties,
  BleClientInterface,
  BleService,
} from '@capacitor-community/bluetooth-le';
import { toBluetoothUuid } from './webBluetooth';

/**
 * Minimal `navigator.bluetooth` implementation backed by the native
 * @capacitor-community/bluetooth-le plugin. Android System WebView has no Web
 * Bluetooth, so the Capacitor app installs this shim and the existing
 * FtmsTrainer / HeartRateMonitor code runs unchanged on top of it.
 *
 * Only the subset of Web Bluetooth those classes use is implemented.
 */

export type NativeBleClient = Pick<
  BleClientInterface,
  | 'initialize'
  | 'isEnabled'
  | 'requestDevice'
  | 'connect'
  | 'disconnect'
  | 'getServices'
  | 'read'
  | 'write'
  | 'writeWithoutResponse'
  | 'startNotifications'
  | 'stopNotifications'
>;

const CONNECT_TIMEOUT_MS = 15000;

function sameUuid(a: string, b: BluetoothServiceUUID): boolean {
  return a.toLowerCase() === toBluetoothUuid(b);
}

function toDataView(value: BufferSource): DataView {
  if (value instanceof DataView) return value;
  if (ArrayBuffer.isView(value)) {
    return new DataView(value.buffer, value.byteOffset, value.byteLength);
  }
  return new DataView(value);
}

function notFound(kind: string, uuid: BluetoothServiceUUID): Error {
  const error = new Error(`${kind} ${toBluetoothUuid(uuid)} not found on device`);
  error.name = 'NotFoundError';
  return error;
}

class NativeCharacteristic extends EventTarget implements BluetoothRemoteGATTCharacteristic {
  value?: DataView;
  readonly properties: BluetoothCharacteristicProperties;
  /** FtmsTrainer also wires the on* handler for WebBLE bridges; honour it like a browser would. */
  oncharacteristicvaluechanged: ((event: Event) => void) | null = null;
  readonly uuid: string;
  private readonly client: NativeBleClient;
  private readonly deviceId: string;
  private readonly serviceUuid: string;

  constructor(
    client: NativeBleClient,
    deviceId: string,
    serviceUuid: string,
    uuid: string,
    properties: BleCharacteristicProperties,
  ) {
    super();
    this.client = client;
    this.deviceId = deviceId;
    this.serviceUuid = serviceUuid;
    this.uuid = uuid;
    this.properties = {
      broadcast: properties.broadcast,
      read: properties.read,
      writeWithoutResponse: properties.writeWithoutResponse,
      write: properties.write,
      notify: properties.notify,
      indicate: properties.indicate,
    };
  }

  async startNotifications(): Promise<BluetoothRemoteGATTCharacteristic> {
    // The plugin replaces any previous callback for the same characteristic, so re-arming is safe.
    await this.client.startNotifications(this.deviceId, this.serviceUuid, this.uuid, (value) => {
      this.value = value;
      const event = new Event('characteristicvaluechanged');
      this.dispatchEvent(event);
      this.oncharacteristicvaluechanged?.(event);
    });
    return this;
  }

  async stopNotifications(): Promise<BluetoothRemoteGATTCharacteristic> {
    await this.client.stopNotifications(this.deviceId, this.serviceUuid, this.uuid);
    return this;
  }

  async readValue(): Promise<DataView> {
    const value = await this.client.read(this.deviceId, this.serviceUuid, this.uuid);
    this.value = value;
    return value;
  }

  async writeValue(value: BufferSource): Promise<void> {
    await this.writeValueWithResponse(value);
  }

  async writeValueWithResponse(value: BufferSource): Promise<void> {
    await this.client.write(this.deviceId, this.serviceUuid, this.uuid, toDataView(value));
  }

  async writeValueWithoutResponse(value: BufferSource): Promise<void> {
    await this.client.writeWithoutResponse(
      this.deviceId,
      this.serviceUuid,
      this.uuid,
      toDataView(value),
    );
  }
}

class NativeService implements BluetoothRemoteGATTService {
  private characteristics = new Map<string, NativeCharacteristic>();
  private readonly client: NativeBleClient;
  private readonly deviceId: string;
  private readonly service: BleService;

  constructor(client: NativeBleClient, deviceId: string, service: BleService) {
    this.client = client;
    this.deviceId = deviceId;
    this.service = service;
  }

  async getCharacteristic(
    characteristic: BluetoothCharacteristicUUID,
  ): Promise<BluetoothRemoteGATTCharacteristic> {
    const found = this.service.characteristics.find((c) => sameUuid(c.uuid, characteristic));
    if (!found) throw notFound('Characteristic', characteristic);
    const key = found.uuid.toLowerCase();
    // Same object per UUID, like Chrome — callers keep references and attach listeners.
    let instance = this.characteristics.get(key);
    if (!instance) {
      instance = new NativeCharacteristic(
        this.client,
        this.deviceId,
        this.service.uuid,
        found.uuid,
        found.properties,
      );
      this.characteristics.set(key, instance);
    }
    return instance;
  }
}

class NativeGattServer implements BluetoothRemoteGATTServer {
  connected = false;
  private services: BleService[] = [];
  private serviceCache = new Map<string, NativeService>();
  readonly device: NativeDevice;
  private readonly client: NativeBleClient;

  constructor(client: NativeBleClient, device: NativeDevice) {
    this.client = client;
    this.device = device;
  }

  async connect(): Promise<BluetoothRemoteGATTServer> {
    await this.client.connect(
      this.device.id,
      () => {
        this.connected = false;
        this.device.dispatchEvent(new Event('gattserverdisconnected'));
      },
      { timeout: CONNECT_TIMEOUT_MS },
    );
    this.services = await this.client.getServices(this.device.id);
    this.serviceCache.clear();
    this.connected = true;
    return this;
  }

  disconnect(): void {
    this.connected = false;
    // Web Bluetooth's disconnect() is synchronous; the native call finishes in the background.
    void this.client.disconnect(this.device.id).catch(() => undefined);
  }

  async getPrimaryService(service: BluetoothServiceUUID): Promise<BluetoothRemoteGATTService> {
    if (!this.connected) throw new Error('GATT server is disconnected');
    const found = this.services.find((s) => sameUuid(s.uuid, service));
    if (!found) throw notFound('Service', service);
    const key = found.uuid.toLowerCase();
    let instance = this.serviceCache.get(key);
    if (!instance) {
      instance = new NativeService(this.client, this.device.id, found);
      this.serviceCache.set(key, instance);
    }
    return instance;
  }
}

class NativeDevice extends EventTarget implements BluetoothDevice {
  readonly gatt: NativeGattServer;
  readonly id: string;
  readonly name?: string;

  constructor(client: NativeBleClient, id: string, name?: string) {
    super();
    this.id = id;
    this.name = name;
    this.gatt = new NativeGattServer(client, this);
  }
}

export function createNativeBluetooth(client: NativeBleClient): Bluetooth {
  let initPromise: Promise<void> | null = null;

  const ensureInitialized = (): Promise<void> => {
    // Prompts for BLUETOOTH_SCAN/CONNECT on first use; retry on the next tap if denied.
    initPromise ??= client.initialize({ androidNeverForLocation: true }).catch((error) => {
      initPromise = null;
      throw error;
    });
    return initPromise;
  };

  return {
    async requestDevice(options: RequestDeviceOptions): Promise<BluetoothDevice> {
      await ensureInitialized();
      // Android scan filters are OR-ed per service UUID, matching Web Bluetooth filter semantics.
      // Name-prefix-only filters cannot be combined that way, so they are dropped.
      const services = options.acceptAllDevices
        ? []
        : [
            ...new Set(
              (options.filters ?? []).flatMap((f) => f.services ?? []).map(toBluetoothUuid),
            ),
          ];
      const optionalServices = [...new Set((options.optionalServices ?? []).map(toBluetoothUuid))];
      const device = await client.requestDevice({ services, optionalServices });
      return new NativeDevice(client, device.deviceId, device.name);
    },

    async getAvailability(): Promise<boolean> {
      try {
        await ensureInitialized();
        return await client.isEnabled();
      } catch {
        return false;
      }
    },
  };
}
