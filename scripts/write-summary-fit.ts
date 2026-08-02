/**
 * One-off: write a summary-only FIT for a known RideSummary (no GPS track).
 * Usage: npx tsx scripts/write-summary-fit.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildFitFromSummary } from '../src/export/fit.ts';

/** Pi sqlite ride #1 — admin@trihonor.com — 2026-07-31 */
const ride1 = {
  startedAtMs: Date.parse('2026-07-31T16:25:55.514Z'),
  finishedAtMs: Date.parse('2026-07-31T16:57:08.065Z'),
  elapsedSeconds: 1820,
  distanceMeters: 12085.4982542731,
  avgPowerWatts: 113,
  maxPowerWatts: 385,
  avgHeartRateBpm: 75,
  maxHeartRateBpm: 75,
  avgSpeedKmh: 24.1,
  maxSpeedKmh: 27.1,
  elevationGainMeters: 59,
  routeName: 'A→B · 12.1 km',
};

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'exports');
mkdirSync(outDir, { recursive: true });

const outPath = join(outDir, 'roadlab-ride-1-20260731.fit');
const bytes = buildFitFromSummary(ride1);
if (bytes.byteLength === 0) {
  throw new Error('Empty FIT');
}
writeFileSync(outPath, bytes);
console.log(`Wrote ${bytes.byteLength} bytes → ${outPath}`);
