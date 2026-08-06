import type { LatLng, RoutePoint } from '../routing/types';

/** Initial bearing (degrees clockwise from north) from `from` toward `to`. */
export function bearingDegrees(from: LatLng, to: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const φ1 = toRad(from.lat);
  const φ2 = toRad(to.lat);
  const Δλ = toRad(to.lng - from.lng);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Smooth shortest-path blend between two compass bearings. */
export function lerpBearing(from: number, to: number, t: number): number {
  let delta = ((to - from + 540) % 360) - 180;
  return (from + delta * t + 360) % 360;
}

/** Point `distanceMeters` from `from` along compass `bearingDeg` (great-circle). */
export function destinationPoint(
  from: LatLng,
  bearingDeg: number,
  distanceMeters: number,
): LatLng {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const δ = distanceMeters / R;
  const θ = toRad(bearingDeg);
  const φ1 = toRad(from.lat);
  const λ1 = toRad(from.lng);

  const φ2 = Math.asin(
    Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ),
  );
  const λ2 =
    λ1 +
    Math.atan2(
      Math.sin(θ) * Math.sin(δ) * Math.cos(φ1),
      Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2),
    );

  return { lat: toDeg(φ2), lng: toDeg(λ2) };
}

/**
 * Bearing along the route at `distanceMeters`, looking ahead so the camera
 * faces the road direction rather than jittering on dense samples.
 */
export function bearingAlongRoute(
  samples: RoutePoint[],
  distanceMeters: number,
  lookAheadMeters = 35,
): number {
  if (samples.length < 2) return 0;

  const from = pointAtDistance(samples, distanceMeters);
  const to = pointAtDistance(samples, distanceMeters + lookAheadMeters);
  if (from.lat === to.lat && from.lng === to.lng) {
    const last = samples[samples.length - 1];
    const prev = samples[Math.max(0, samples.length - 2)];
    return bearingDegrees(prev, last);
  }
  return bearingDegrees(from, to);
}

function pointAtDistance(
  samples: RoutePoint[],
  distanceMeters: number,
): LatLng {
  if (distanceMeters <= samples[0].distanceMeters) {
    return { lat: samples[0].lat, lng: samples[0].lng };
  }
  const last = samples[samples.length - 1];
  if (distanceMeters >= last.distanceMeters) {
    return { lat: last.lat, lng: last.lng };
  }

  let lo = 0;
  let hi = samples.length - 1;
  while (lo < hi - 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (samples[mid].distanceMeters <= distanceMeters) lo = mid;
    else hi = mid;
  }

  const a = samples[lo];
  const b = samples[hi];
  const span = b.distanceMeters - a.distanceMeters || 1;
  const t = (distanceMeters - a.distanceMeters) / span;
  return {
    lat: a.lat + (b.lat - a.lat) * t,
    lng: a.lng + (b.lng - a.lng) * t,
  };
}
