import type { RoutePoint } from '../routing/types';

export type LocalRoutePoint = {
  x: number;
  y: number;
  z: number;
  distanceMeters: number;
  gradePercent: number;
};

/**
 * Projects real GPS+elevation samples onto a local flat XZ plane (meters),
 * origin at the first sample. Fine for route-length spans (a few/tens of
 * km) — no need for true mercator/geodesic accuracy once we're building a
 * stylized 3D scene rather than a map. Three.js convention: -Z is "forward"
 * at bearing 0 (north), +X is east, +Y is up (relative elevation).
 */
export function projectRouteToLocal(samples: RoutePoint[]): LocalRoutePoint[] {
  if (samples.length === 0) return [];
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const lat0 = toRad(samples[0].lat);
  const lng0 = toRad(samples[0].lng);
  const elev0 = samples[0].elevationMeters;
  const cosLat0 = Math.cos(lat0);

  return samples.map((s) => ({
    x: (toRad(s.lng) - lng0) * cosLat0 * R,
    y: s.elevationMeters - elev0,
    z: -(toRad(s.lat) - lat0) * R,
    distanceMeters: s.distanceMeters,
    gradePercent: s.gradePercent,
  }));
}

/** Interpolated local point + forward tangent at `distanceMeters` along the projected route. */
export function localPointAtDistance(
  points: LocalRoutePoint[],
  distanceMeters: number,
): { x: number; y: number; z: number; forward: { x: number; y: number; z: number } } {
  if (points.length === 0) return { x: 0, y: 0, z: 0, forward: { x: 0, y: 0, z: -1 } };
  if (points.length === 1) {
    return { x: points[0].x, y: points[0].y, z: points[0].z, forward: { x: 0, y: 0, z: -1 } };
  }

  const clamped = Math.max(
    points[0].distanceMeters,
    Math.min(distanceMeters, points[points.length - 1].distanceMeters),
  );

  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi - 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (points[mid].distanceMeters <= clamped) lo = mid;
    else hi = mid;
  }

  const a = points[lo];
  const b = points[hi];
  const span = b.distanceMeters - a.distanceMeters || 1;
  const t = (clamped - a.distanceMeters) / span;

  const fx = b.x - a.x;
  const fy = b.y - a.y;
  const fz = b.z - a.z;
  const flen = Math.max(0.001, Math.hypot(fx, fy, fz));

  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
    forward: { x: fx / flen, y: fy / flen, z: fz / flen },
  };
}
