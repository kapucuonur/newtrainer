import type { FilterSpecification, StyleSpecification } from 'maplibre-gl';

/**
 * OpenFreeMap Liberty (and similar) compare `ref_length` with `<=` without a
 * null guard. MapLibre 6 evaluates that strictly and logs worker warnings when
 * the property is missing. Coalesce missing values so the filter stays false.
 */
export function sanitizeMapStyle(style: StyleSpecification): StyleSpecification {
  if (!style.layers) return style;

  for (const layer of style.layers) {
    if (!layer.id.startsWith('highway-shield') || !('filter' in layer) || layer.filter == null) {
      continue;
    }
    layer.filter = patchNumericGetComparisons(layer.filter) as FilterSpecification;
  }

  return style;
}

function patchNumericGetComparisons(expr: unknown): unknown {
  if (!Array.isArray(expr)) return expr;

  const [op, left, ...rest] = expr as unknown[];
  const comparisonOps = new Set(['<=', '>=', '<', '>', '==', '!=']);

  if (
    typeof op === 'string' &&
    comparisonOps.has(op) &&
    Array.isArray(left) &&
    left[0] === 'get' &&
    typeof left[1] === 'string'
  ) {
    // ["<=", ["get", "ref_length"], 6] → ["<=", ["coalesce", ["get", "ref_length"], 0], 6]
    return [op, ['coalesce', left, 0], ...rest.map(patchNumericGetComparisons)];
  }

  return [op, ...[left, ...rest].map(patchNumericGetComparisons)];
}
