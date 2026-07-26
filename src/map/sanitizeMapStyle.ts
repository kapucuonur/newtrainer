import type { FilterSpecification, LayerSpecification, StyleSpecification } from 'maplibre-gl';

/**
 * OpenFreeMap Bright/Liberty compare `ref_length` with `<=` without a null
 * guard. MapLibre 6 evaluates that strictly. Coalesce missing values so the
 * filter stays false, and never leave JS `undefined` in expression arrays
 * (MapLibre wants `null`).
 *
 * Bright ships the Natural Earth shaded source but omits the raster layer —
 * re-add it so low-zoom terrain isn’t flat.
 */
export function sanitizeMapStyle(style: StyleSpecification): StyleSpecification {
  ensureNaturalEarthShadedRelief(style);

  if (!style.layers) return style;

  for (const layer of style.layers) {
    if (!layer.id.startsWith('highway-shield') || !('filter' in layer) || layer.filter == null) {
      continue;
    }
    layer.filter = replaceUndefinedWithNull(
      patchNumericGetComparisons(layer.filter),
    ) as FilterSpecification;
  }

  return style;
}

function ensureNaturalEarthShadedRelief(style: StyleSpecification): void {
  const sources = style.sources;
  if (!sources || !('ne2_shaded' in sources)) return;

  const layers = style.layers;
  if (!layers) return;
  if (
    layers.some(
      (l) =>
        l.id === 'natural_earth' ||
        ('source' in l && l.source === 'ne2_shaded'),
    )
  ) {
    return;
  }

  const relief: LayerSpecification = {
    id: 'natural_earth',
    type: 'raster',
    source: 'ne2_shaded',
    maxzoom: 7,
    paint: {
      'raster-opacity': [
        'interpolate',
        ['exponential', 1.5],
        ['zoom'],
        0,
        0.6,
        6,
        0.1,
      ],
    },
  };

  const bgIndex = layers.findIndex((l) => l.type === 'background');
  layers.splice(bgIndex >= 0 ? bgIndex + 1 : 0, 0, relief);
}

function patchNumericGetComparisons(expr: unknown): unknown {
  if (!Array.isArray(expr)) return expr;

  const op = expr[0];
  const comparisonOps = new Set(['<=', '>=', '<', '>', '==', '!=']);
  const left = expr[1];

  if (
    typeof op === 'string' &&
    comparisonOps.has(op) &&
    Array.isArray(left) &&
    left[0] === 'get' &&
    typeof left[1] === 'string'
  ) {
    // ["<=", ["get", "ref_length"], 6] → ["<=", ["coalesce", ["get", "ref_length"], 0], 6]
    return [
      op,
      ['coalesce', left, 0],
      ...expr.slice(2).map(patchNumericGetComparisons),
    ];
  }

  // Map over existing slots only — do not invent trailing undefined for
  // zero-arg ops like ["geometry-type"].
  return expr.map(patchNumericGetComparisons);
}

/** MapLibre style JSON rejects JS undefined; use null instead. */
function replaceUndefinedWithNull(value: unknown): unknown {
  if (value === undefined) return null;
  if (!Array.isArray(value)) return value;
  return value.map(replaceUndefinedWithNull);
}
