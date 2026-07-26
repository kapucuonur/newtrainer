import { densifyRoute } from '../routing/osrm';
import type { EnrichedRoute, LatLng, RoutePoint, RouteResult } from '../routing/types';

const OPEN_TOPO =
  import.meta.env.VITE_ELEVATION_URL ??
  'https://api.opentopodata.org/v1/aster30m';

async function fetchElevationsBatch(points: LatLng[]): Promise<number[]> {
  if (points.length === 0) return [];

  const locations = points.map((p) => `${p.lat},${p.lng}`).join('|');
  const url = `${OPEN_TOPO}?locations=${encodeURIComponent(locations)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Elevation HTTP ${response.status}`);

  const json = (await response.json()) as {
    status?: string;
    results?: Array<{ elevation: number | null }>;
  };

  if (json.status !== 'OK' || !json.results) {
    throw new Error('Elevation lookup failed');
  }

  return json.results.map((r) => r.elevation ?? 0);
}

/** OpenTopoData allows ~100 locations per request. */
async function fetchAllElevations(points: LatLng[]): Promise<number[]> {
  const chunkSize = 90;
  const elevations: number[] = [];

  for (let i = 0; i < points.length; i += chunkSize) {
    const chunk = points.slice(i, i + chunkSize);
    const part = await fetchElevationsBatch(chunk);
    elevations.push(...part);
    if (i + chunkSize < points.length) {
      await new Promise((r) => setTimeout(r, 1100));
    }
  }

  return elevations;
}

function haversineMeters(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Sample elevations along a route and compute grade % for trainer SIM mode.
 */
export async function enrichRouteWithElevation(
  route: RouteResult,
): Promise<EnrichedRoute> {
  const spaced = densifyRoute(route.coordinates, 45);
  let elevations: number[];

  try {
    elevations = await fetchAllElevations(spaced);
  } catch {
    // Offline / rate-limit fallback: synthetic gentle rollers so the app stays usable
    elevations = spaced.map((_, i) => 40 + Math.sin(i / 8) * 18 + (i % 17));
  }

  const samples: RoutePoint[] = [];
  let cumulative = 0;
  let elevGain = 0;
  let elevLoss = 0;
  let minElev = elevations[0] ?? 0;
  let maxElev = elevations[0] ?? 0;

  for (let i = 0; i < spaced.length; i++) {
    const point = spaced[i];
    const elev = elevations[i] ?? 0;
    if (i > 0) {
      const dist = haversineMeters(spaced[i - 1], point);
      const dElev = elev - (elevations[i - 1] ?? elev);
      cumulative += dist;
      if (dElev > 0) elevGain += dElev;
      else elevLoss += -dElev;
    }
    minElev = Math.min(minElev, elev);
    maxElev = Math.max(maxElev, elev);

    let gradePercent = 0;
    if (i < spaced.length - 1) {
      const ahead = haversineMeters(point, spaced[i + 1]);
      const dElev = (elevations[i + 1] ?? elev) - elev;
      gradePercent = ahead > 0.5 ? (dElev / ahead) * 100 : 0;
      gradePercent = Math.max(-20, Math.min(25, gradePercent));
    }

    samples.push({
      lat: point.lat,
      lng: point.lng,
      elevationMeters: elev,
      distanceMeters: cumulative,
      gradePercent,
    });
  }

  // Smooth grades with a small moving average
  for (let i = 0; i < samples.length; i++) {
    const window = samples.slice(Math.max(0, i - 2), Math.min(samples.length, i + 3));
    const avg =
      window.reduce((sum, s) => sum + s.gradePercent, 0) / Math.max(1, window.length);
    samples[i].gradePercent = Number(avg.toFixed(2));
  }

  return {
    ...route,
    samples,
    elevGainMeters: Math.round(elevGain),
    elevLossMeters: Math.round(elevLoss),
    minElevMeters: Math.round(minElev),
    maxElevMeters: Math.round(maxElev),
  };
}

export function gradeAtDistance(
  samples: RoutePoint[],
  distanceMeters: number,
): { gradePercent: number; elevationMeters: number; lat: number; lng: number } {
  if (samples.length === 0) {
    return { gradePercent: 0, elevationMeters: 0, lat: 0, lng: 0 };
  }

  if (distanceMeters <= samples[0].distanceMeters) {
    const s = samples[0];
    return {
      gradePercent: s.gradePercent,
      elevationMeters: s.elevationMeters,
      lat: s.lat,
      lng: s.lng,
    };
  }

  const last = samples[samples.length - 1];
  if (distanceMeters >= last.distanceMeters) {
    return {
      gradePercent: 0,
      elevationMeters: last.elevationMeters,
      lat: last.lat,
      lng: last.lng,
    };
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
    gradePercent: a.gradePercent + (b.gradePercent - a.gradePercent) * t,
    elevationMeters:
      a.elevationMeters + (b.elevationMeters - a.elevationMeters) * t,
    lat: a.lat + (b.lat - a.lat) * t,
    lng: a.lng + (b.lng - a.lng) * t,
  };
}
