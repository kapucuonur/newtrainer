import type { FilterSpecification, StyleSpecification } from 'maplibre-gl';

/**
 * OpenFreeMap Liberty (and similar) compare `ref_length` with `<=` without a
 * null guard. MapLibre 6 evaluates that strictly. Coalesce missing values so the
 * filter stays false, and never leave JS `undefined` in expression arrays
 * (MapLibre wants `null`).
 */
export function sanitizeMapStyle(style: StyleSpecification): StyleSpecification {
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
