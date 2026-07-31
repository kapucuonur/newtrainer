import { parseFeatureBits, parseIndoorBikeData } from './ftms';
import { parseHeartRateMeasurement } from './heartRate';

/** Lightweight self-check runnable via `npx tsx src/bluetooth/ftms.parse.test.ts` */

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

// Indoor Bike Data: flags + speed + cadence + power
// flags = 0x0044 (cadence + power), speed always present when moreData=0
{
  const buffer = new ArrayBuffer(10);
  const view = new DataView(buffer);
  view.setUint16(0, 0x0044, true); // cadence + power
  view.setUint16(2, 2550, true); // 25.50 km/h
  view.setUint16(4, 180, true); // 90 rpm
  view.setInt16(6, 220, true); // 220 W
  const parsed = parseIndoorBikeData(view);
  assert(parsed.speedKmh === 25.5, `speed expected 25.5 got ${parsed.speedKmh}`);
  assert(parsed.cadenceRpm === 90, `cadence expected 90 got ${parsed.cadenceRpm}`);
  assert(parsed.powerWatts === 220, `power expected 220 got ${parsed.powerWatts}`);
}

// moreData=1 → Instantaneous Speed omitted; cadence + power only
{
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  view.setUint16(0, 0x0045, true); // moreData + cadence + power
  view.setUint16(2, 180, true); // 90 rpm
  view.setInt16(4, 210, true); // 210 W
  const parsed = parseIndoorBikeData(view);
  assert(parsed.speedKmh === null, `speed expected null got ${parsed.speedKmh}`);
  assert(parsed.cadenceRpm === 90, `cadence expected 90 got ${parsed.cadenceRpm}`);
  assert(parsed.powerWatts === 210, `power expected 210 got ${parsed.powerWatts}`);
}

// Truncated packet must not throw
{
  const buffer = new ArrayBuffer(2);
  const view = new DataView(buffer);
  view.setUint16(0, 0x0044, true); // claims cadence+power but no payload
  const parsed = parseIndoorBikeData(view);
  assert(parsed.speedKmh === null, 'truncated: speed null');
  assert(parsed.cadenceRpm === null, 'truncated: cadence null');
  assert(parsed.powerWatts === null, 'truncated: power null');
}

{
  const buffer = new ArrayBuffer(2);
  const view = new DataView(buffer);
  view.setUint8(0, 0x00);
  view.setUint8(1, 142);
  const hr = parseHeartRateMeasurement(view);
  assert(hr.bpm === 142, `hr expected 142 got ${hr.bpm}`);
}

// Fitness Machine Feature: Target Setting Features
// bit2 resistance, bit3 power, bit13 indoor bike simulation
{
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  view.setUint32(0, 1 << 14, true); // power measurement
  view.setUint32(4, (1 << 2) | (1 << 3) | (1 << 13), true);
  const caps = parseFeatureBits(view);
  assert(caps.supportsTargetResistance, 'expected resistance target bit2');
  assert(caps.supportsTargetPower, 'expected power target bit3');
  assert(caps.supportsIndoorBikeSimulation, 'expected SIM bit13');
}

{
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  view.setUint32(0, 0, true);
  view.setUint32(4, 1 << 13, true); // SIM only — no power target
  const caps = parseFeatureBits(view);
  assert(!caps.supportsTargetPower, 'power target should be false');
  assert(!caps.supportsTargetResistance, 'resistance target should be false');
  assert(caps.supportsIndoorBikeSimulation, 'SIM should be true');
}

console.log('FTMS / HR parse checks passed');
