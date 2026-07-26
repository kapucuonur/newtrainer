import { readFileSync } from 'node:fs';
import { sanitizeMapStyle } from './sanitizeMapStyle';
import type { StyleSpecification } from 'maplibre-gl';

/** Lightweight self-check: `npm run test:map-style` [optional liberty.json path] */

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function findUndefined(value: unknown, path = ''): string[] {
  if (value === undefined) return [path || '(root)'];
  if (Array.isArray(value)) {
    return value.flatMap((v, i) => findUndefined(v, `${path}[${i}]`));
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) =>
      findUndefined(v, path ? `${path}.${k}` : k),
    );
  }
  return [];
}

const fixturePath = process.argv[2];
const style = (
  fixturePath
    ? (JSON.parse(readFileSync(fixturePath, 'utf8')) as StyleSpecification)
    : ({
        version: 8,
        sources: {},
        layers: [
          {
            id: 'highway-shield-non-us',
            type: 'symbol',
            source: 'openmaptiles',
            filter: [
              'all',
              ['<=', ['get', 'ref_length'], 6],
              ['match', ['geometry-type'], ['LineString', 'MultiLineString'], true, false],
              [
                'match',
                ['get', 'network'],
                ['us-highway', 'us-interstate', 'us-state'],
                false,
                true,
              ],
            ],
          },
        ],
      } satisfies StyleSpecification)
);

const sanitized = sanitizeMapStyle(structuredClone(style));
const shields = (sanitized.layers ?? []).filter((l) => l.id.startsWith('highway-shield'));

assert(shields.length > 0, 'expected highway-shield layers');

for (const layer of shields) {
  if (!('filter' in layer) || layer.filter == null) continue;
  const undefs = findUndefined(layer.filter, `${layer.id}.filter`);
  assert(undefs.length === 0, `undefined in ${layer.id}: ${undefs.join(', ')}`);

  const json = JSON.stringify(layer.filter);
  assert(json.includes('"coalesce"'), `${layer.id} should coalesce ref_length`);
  assert(json.includes('["geometry-type"]'), `${layer.id} must keep zero-arg geometry-type`);
  assert(
    !json.includes('"geometry-type",null'),
    `${layer.id} must not pad geometry-type with null`,
  );
}

console.log(`sanitizeMapStyle ok (${shields.length} shield layer(s))`);
