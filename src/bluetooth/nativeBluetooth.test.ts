import type { BleService } from '@capacitor-community/bluetooth-le';
import { FtmsTrainer } from './ftms';
import { HeartRateMonitor } from './heartRate';
import { createNativeBluetooth, type NativeBleClient } from './nativeBluetooth';
import { toBluetoothUuid } from './webBluetooth';

/**
 * Runs the real FtmsTrainer / HeartRateMonitor over the native shim with a fake plugin.
 * `npx tsx src/bluetooth/nativeBluetooth.test.ts`
 */

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const uuid = (n: number) => toBluetoothUuid(n);
const props = (p: { read?: boolean; write?: boolean; notify?: boolean; indicate?: boolean }) => ({
  broadcast: false,
  read: p.read ?? false,
  writeWithoutResponse: false,
  write: p.write ?? false,
  notify: p.notify ?? false,
  indicate: p.indicate ?? false,
  authenticatedSignedWrites: false,
});

function createFakeClient(services: BleService[]) {
  const calls = {
    init: [] as unknown[],
    requestDevice: [] as Array<{ services?: string[]; optionalServices?: string[] }>,
    writes: [] as Array<{ characteristic: string; bytes: number[] }>,
    stopNotifications: [] as string[],
    disconnects: 0,
  };
  const notify = new Map<string, (value: DataView) => void>();
  let onDisconnect: ((deviceId: string) => void) | undefined;

  const client: NativeBleClient = {
    initialize: async (options) => {
      calls.init.push(options);
    },
    isEnabled: async () => true,
    requestDevice: async (options) => {
      calls.requestDevice.push(options ?? {});
      return { deviceId: 'AA:BB:CC:DD:EE:FF', name: 'KICKR TEST' };
    },
    connect: async (_id, cb) => {
      onDisconnect = cb;
    },
    disconnect: async () => {
      calls.disconnects += 1;
    },
    getServices: async () => services,
    read: async () => {
      // Feature: power measurement; Target: resistance (2), power (3), simulation (13)
      const view = new DataView(new ArrayBuffer(8));
      view.setUint32(0, 1 << 14, true);
      view.setUint32(4, (1 << 2) | (1 << 3) | (1 << 13), true);
      return view;
    },
    write: async (_id, _service, characteristic, value) => {
      calls.writes.push({
        characteristic,
        bytes: [...new Uint8Array(value.buffer, value.byteOffset, value.byteLength)],
      });
    },
    writeWithoutResponse: async () => undefined,
    startNotifications: async (_id, _service, characteristic, callback) => {
      notify.set(characteristic, callback);
    },
    stopNotifications: async (_id, _service, characteristic) => {
      calls.stopNotifications.push(characteristic);
      notify.delete(characteristic);
    },
  };

  return {
    client,
    calls,
    emit(characteristic: number, bytes: number[]) {
      const cb = notify.get(uuid(characteristic));
      assert(cb != null, `no notification subscriber for ${uuid(characteristic)}`);
      cb!(new DataView(new Uint8Array(bytes).buffer));
    },
    dropLink() {
      onDisconnect?.('AA:BB:CC:DD:EE:FF');
    },
  };
}

// Node has navigator/EventTarget; FTMS code also checks window.isSecureContext.
(globalThis as { window?: unknown }).window = { isSecureContext: true };

function installShim(client: NativeBleClient): void {
  Object.defineProperty(navigator, 'bluetooth', {
    value: createNativeBluetooth(client),
    configurable: true,
  });
}

// FTMS trainer: connect, telemetry, SIM grade write, link drop
{
  const fake = createFakeClient([
    {
      uuid: uuid(0x1826),
      characteristics: [
        { uuid: uuid(0x2acc), properties: props({ read: true }), descriptors: [] },
        { uuid: uuid(0x2ad2), properties: props({ notify: true }), descriptors: [] },
        { uuid: uuid(0x2ad9), properties: props({ write: true, indicate: true }), descriptors: [] },
      ],
    },
  ]);
  installShim(fake.client);

  const trainer = new FtmsTrainer();
  assert(trainer.getState() === 'disconnected', `initial state ${trainer.getState()}`);

  let power: number | null = null;
  trainer.onData((data) => {
    power = data.powerWatts;
  });

  await trainer.connect();
  assert(trainer.getState() === 'connected', `state after connect ${trainer.getState()}`);
  assert(trainer.name === 'KICKR TEST', `name ${trainer.name}`);

  const init = fake.calls.init[0] as { androidNeverForLocation?: boolean } | undefined;
  assert(init?.androidNeverForLocation === true, 'initialize must not request location');

  const scan = fake.calls.requestDevice[0];
  assert(scan.services?.includes(uuid(0x1826)) === true, 'scan must filter on FTMS service');
  assert(scan.services?.every((s) => /^0000[0-9a-f]{4}-/.test(s)) === true, 'full 128-bit UUIDs');

  assert(trainer.getCapabilities().supportsIndoorBikeSimulation, 'SIM capability read');
  assert(
    fake.calls.writes[0]?.bytes.join(',') === '0',
    `first control write should be Request Control, got ${fake.calls.writes[0]?.bytes}`,
  );

  // Indoor Bike Data: flags cadence+power, 25.50 km/h, 90 rpm, 220 W
  fake.emit(0x2ad2, [0x44, 0x00, 0xf6, 0x09, 0xb4, 0x00, 0xdc, 0x00]);
  assert(power === 220, `power expected 220 got ${power}`);

  await trainer.setSimulation({ gradePercent: 5 });
  const sim = fake.calls.writes.at(-1)!;
  assert(sim.characteristic === uuid(0x2ad9), 'SIM goes to control point');
  // 0x11, wind 0, grade 500 (0.01 %), crr 40, cw 51
  assert(sim.bytes.join(',') === '17,0,0,244,1,40,51', `SIM bytes ${sim.bytes}`);

  fake.dropLink();
  assert(trainer.getState() === 'disconnected', `state after link drop ${trainer.getState()}`);
}

// Heart-rate strap: connect, sample, explicit disconnect
{
  const fake = createFakeClient([
    {
      uuid: uuid(0x180d),
      characteristics: [
        { uuid: uuid(0x2a37), properties: props({ notify: true }), descriptors: [] },
      ],
    },
  ]);
  installShim(fake.client);

  const hr = new HeartRateMonitor();
  let bpm = 0;
  hr.onSample((sample) => {
    bpm = sample.bpm;
  });
  await hr.connect();
  assert(hr.getState() === 'connected', `HR state ${hr.getState()}`);
  fake.emit(0x2a37, [0x00, 72]);
  assert(bpm === 72, `bpm expected 72 got ${bpm}`);

  await hr.disconnect();
  assert(fake.calls.stopNotifications.includes(uuid(0x2a37)), 'HR notifications stopped');
  assert(fake.calls.disconnects === 1, 'native disconnect called');
}

// Missing FTMS service → connect fails cleanly with an error state
{
  const fake = createFakeClient([{ uuid: uuid(0x180d), characteristics: [] }]);
  installShim(fake.client);
  const trainer = new FtmsTrainer();
  let failed = false;
  try {
    await trainer.connect();
  } catch (error) {
    failed = error instanceof Error && error.name === 'NotFoundError';
  }
  assert(failed, 'missing service should throw NotFoundError');
  assert(trainer.getState() === 'error', `state ${trainer.getState()}`);
}

// acceptAllDevices (debug picker) → unfiltered scan
{
  const fake = createFakeClient([]);
  const bluetooth = createNativeBluetooth(fake.client);
  await bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: [0x1826] });
  assert(fake.calls.requestDevice[0].services?.length === 0, 'acceptAllDevices scans unfiltered');
}

console.log('native Bluetooth shim checks passed');
