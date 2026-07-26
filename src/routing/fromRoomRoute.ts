import type { EnrichedRoute, LatLng, RoutePoint } from './types';

function isLatLng(value: unknown): value is LatLng {
  if (!value || typeof value !== 'object') return false;
  const v = value as LatLng;
  return Number.isFinite(v.lat) && Number.isFinite(v.lng);
}

function isSample(value: unknown): value is RoutePoint {
  if (!isLatLng(value)) return false;
  const v = value as RoutePoint;
  return (
    Number.isFinite(v.elevationMeters) &&
    Number.isFinite(v.distanceMeters) &&
    Number.isFinite(v.gradePercent)
  );
}

/** Best-effort parse of a room route payload into EnrichedRoute. */
export function parseRoomRoute(raw: unknown): EnrichedRoute | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const geometry = r.geometry as { type?: string; coordinates?: unknown } | undefined;
  if (!geometry || geometry.type !== 'LineString' || !Array.isArray(geometry.coordinates)) {
    return null;
  }
  if (geometry.coordinates.length < 2) return null;
  if (!Array.isArray(r.samples) || r.samples.length < 2) return null;
  if (!r.samples.every(isSample)) return null;

  const distanceMeters = Number(r.distanceMeters);
  if (!Number.isFinite(distanceMeters) || distanceMeters <= 0) return null;

  const coordinates = Array.isArray(r.coordinates)
    ? (r.coordinates.filter(isLatLng) as LatLng[])
    : geometry.coordinates
        .map((c) => {
          if (!Array.isArray(c) || c.length < 2) return null;
          const lng = Number(c[0]);
          const lat = Number(c[1]);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
          return { lat, lng };
        })
        .filter((p): p is LatLng => p != null);

  if (coordinates.length < 2) return null;

  return {
    coordinates,
    distanceMeters,
    durationSeconds: Number(r.durationSeconds) || 0,
    geometry: {
      type: 'LineString',
      coordinates: geometry.coordinates as number[][],
    },
    source: r.source === 'straight' ? 'straight' : 'osrm',
    samples: r.samples as RoutePoint[],
    elevGainMeters: Number(r.elevGainMeters) || 0,
    elevLossMeters: Number(r.elevLossMeters) || 0,
    minElevMeters: Number(r.minElevMeters) || 0,
    maxElevMeters: Number(r.maxElevMeters) || 0,
  };
}
