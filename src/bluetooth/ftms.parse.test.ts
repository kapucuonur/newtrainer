import { parseIndoorBikeData } from './ftms';
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

{
  const buffer = new ArrayBuffer(2);
  const view = new DataView(buffer);
  view.setUint8(0, 0x00);
  view.setUint8(1, 142);
  const hr = parseHeartRateMeasurement(view);
  assert(hr.bpm === 142, `hr expected 142 got ${hr.bpm}`);
}

console.log('FTMS / HR parse checks passed');
