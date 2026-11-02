import type { RoutePoint } from '../routing/types';
import { frameAtDistance, pickStreetFrames, streetCoverage, type StreetImage } from './pickFrames';

/** `npx tsx src/streetview/pickFrames.test.ts` */

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const METERS_PER_DEG_LAT = 111195;
const LAT0 = 41.0;
const LNG0 = 29.0;

// Straight 400 m road heading due north.
const samples: RoutePoint[] = Array.from({ length: 41 }, (_, i) => ({
  lat: LAT0 + (i * 10) / METERS_PER_DEG_LAT,
  lng: LNG0,
  elevationMeters: 0,
  distanceMeters: i * 10,
  gradePercent: 0,
}));

function image(
  id: string,
  northMeters: number,
  compassAngle: number,
  eastMeters = 0,
  seq = 'seq-a',
  isPano = false,
): StreetImage {
  return {
    id,
    isPano,
    lat: LAT0 + northMeters / METERS_PER_DEG_LAT,
    lng: LNG0 + eastMeters / (METERS_PER_DEG_LAT * Math.cos((LAT0 * Math.PI) / 180)),
    compassAngle,
    thumbUrl: `https://example.invalid/${id}.jpg`,
    sequenceId: seq,
    creator: null,
  };
}

// Forward-facing photos every 20 m on the first 200 m only.
const forward = Array.from({ length: 11 }, (_, i) => image(`f${i}`, i * 20, 2));
// Distractors: facing backwards, and a forward one 40 m off the road.
const backwards = image('back', 50, 180);
const offRoad = image('far', 300, 0, 40);

const frames = pickStreetFrames(samples, [...forward, backwards, offRoad]);

assert(frames.length > 0, 'expected frames on the covered stretch');
assert(
  frames.every((f) => f.image.id !== 'back'),
  'a photo facing against the direction of travel must never be picked',
);
assert(frames.every((f) => f.image.id !== 'far'), 'a photo 40 m off the road must never be picked');
for (let i = 1; i < frames.length; i++) {
  assert(frames[i].distanceMeters > frames[i - 1].distanceMeters, 'frames ordered by distance');
  assert(frames[i].image.id !== frames[i - 1].image.id, 'consecutive duplicates collapsed');
}

// Frame lookup follows the rider.
assert(frameAtDistance(frames, 0)?.image.id === 'f0', `start frame ${frameAtDistance(frames, 0)?.image.id}`);
const mid = frameAtDistance(frames, 101)?.image.id;
assert(mid === 'f5' || mid === 'f4', `frame near 100 m should be f4/f5, got ${mid}`);
// Past the last photo + gap → no imagery rather than a stale frame.
assert(frameAtDistance(frames, 350) === null, 'gap after coverage ends must show no imagery');

// Coverage: photos exist for roughly the first 200 m (+ gap allowance) of 400 m.
const coverage = streetCoverage(frames, 400);
assert(coverage > 0.45 && coverage < 0.75, `coverage expected ~0.5-0.7, got ${coverage.toFixed(2)}`);

// Prefer staying on the same capture sequence when two photos are equally close.
{
  const a = image('a1', 0, 0, 0, 'seq-a');
  const a2 = image('a2', 16, 0, 3, 'seq-a');
  const b2 = image('b2', 16, 0, -1, 'seq-b');
  const picked = pickStreetFrames(samples.slice(0, 4), [a, a2, b2]);
  assert(picked.some((f) => f.image.id === 'a2'), `expected same-sequence a2, got ${picked.map((f) => f.image.id)}`);
}

// A 360° panorama is usable whatever its compass angle (it is cropped to the heading).
{
  const pano = image('pano', 300, 180, 2, 'seq-p', true);
  const picked = pickStreetFrames(samples, [pano]);
  assert(picked.some((f) => f.image.id === 'pano'), 'a backwards-facing panorama should still be picked');
  assert(picked.every((f) => Math.abs(f.headingDeg) < 1 || Math.abs(f.headingDeg - 360) < 1), 'heading ~north');
}

assert(pickStreetFrames(samples, []).length === 0, 'no images → no frames');
assert(frameAtDistance([], 10) === null, 'no frames → null');

console.log('street view frame picking checks passed');
