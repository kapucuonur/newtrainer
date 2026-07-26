import type { LatLng, RouteResult } from './types';
import { MIN_WAYPOINTS } from './waypoints';

const OSRM_BASE =
  import.meta.env.VITE_OSRM_URL ?? 'https://router.project-osrm.org';

/** Distinct colors for alternative routes on the map / chips. */
export const ROUTE_ALT_COLORS = [
  '#1aa3d9',
  '#ff9f0a',
  '#af52de',
  '#30d158',
  '#ff3b30',
] as const;

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

function straightFallback(points: LatLng[]): RouteResult {
  let distanceMeters = 0;
  for (let i = 1; i < points.length; i++) {
    distanceMeters += haversineMeters(points[i - 1], points[i]);
  }
  return {
    coordinates: points,
    distanceMeters,
    durationSeconds: distanceMeters / 6, // ~21.6 km/h cycling estimate
    geometry: {
      type: 'LineString',
      coordinates: points.map((c) => [c.lng, c.lat]),
    },
    source: 'straight',
  };
}

type OsrmRouteJson = {
  distance: number;
  duration: number;
  geometry: { type: string; coordinates: number[][] };
};

function parseOsrmRoute(route: OsrmRouteJson): RouteResult {
  const coordinates = route.geometry.coordinates.map(([lng, lat]) => ({
    lat,
    lng,
  }));
  return {
    coordinates,
    distanceMeters: route.distance,
    durationSeconds: route.duration,
    geometry: {
      type: 'LineString',
      coordinates: route.geometry.coordinates,
    },
    source: 'osrm',
  };
}

/**
 * Build an out-and-back route on the exact same roads:
 * outbound geometry concatenated with its reverse (skip duplicate turnaround point).
 * Distance and duration are doubled — no second OSRM request for the return.
 */
export function asSamePathRoundTrip(route: RouteResult): RouteResult {
  if (route.coordinates.length < 2) return route;

  const returnCoords = route.coordinates.slice(0, -1).reverse();
  const coordinates = [...route.coordinates, ...returnCoords];
  const geometryCoords = coordinates.map((c) => [c.lng, c.lat]);

  return {
    ...route,
    coordinates,
    distanceMeters: route.distanceMeters * 2,
    durationSeconds: route.durationSeconds * 2,
    geometry: {
      type: 'LineString',
      coordinates: geometryCoords,
    },
  };
}

/**
 * Fetch a route through ordered waypoints (A→B→C→…).
 * Round-trip mirrors the outbound polyline back to A (same roads) — OSRM is
 * only asked for the outbound path. Alternatives only when exactly 2 points.
 * Falls back to a single straight polyline on failure.
 */
export async function fetchRouteAlternatives(
  waypoints: LatLng[],
  isRoundTrip = false,
): Promise<RouteResult[]> {
  if (waypoints.length < MIN_WAYPOINTS) {
    return [];
  }

  const path = waypoints.map((p) => `${p.lng},${p.lat}`).join(';');
  const wantAlts = waypoints.length === 2;
  const url =
    `${OSRM_BASE}/route/v1/cycling/${path}` +
    `?overview=full&geometries=geojson&steps=false&alternatives=${wantAlts}`;

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`OSRM HTTP ${response.status}`);
    const json = (await response.json()) as {
      code?: string;
      routes?: OsrmRouteJson[];
    };

    const routes = json.routes ?? [];
    if (json.code !== 'Ok' || routes.length === 0) {
      throw new Error('OSRM returned no route');
    }

    const parsed = routes
      .filter((r) => r.geometry?.coordinates?.length)
      .map(parseOsrmRoute);

    if (parsed.length === 0) throw new Error('OSRM returned no route');
    return isRoundTrip ? parsed.map(asSamePathRoundTrip) : parsed;
  } catch {
    const fallback = straightFallback(waypoints);
    return [isRoundTrip ? asSamePathRoundTrip(fallback) : fallback];
  }
}

/**
 * Route through waypoints using public OSRM cycling profile.
 * Returns the primary alternative.
 */
export async function fetchRoute(
  waypoints: LatLng[],
  isRoundTrip = false,
): Promise<RouteResult> {
  const alts = await fetchRouteAlternatives(waypoints, isRoundTrip);
  if (alts.length === 0) {
    return isRoundTrip
      ? asSamePathRoundTrip(straightFallback(waypoints))
      : straightFallback(waypoints);
  }
  return alts[0];
}

export function densifyRoute(
  coordinates: LatLng[],
  targetSpacingMeters = 40,
): LatLng[] {
  if (coordinates.length < 2) return coordinates;

  const out: LatLng[] = [coordinates[0]];
  for (let i = 1; i < coordinates.length; i++) {
    const a = coordinates[i - 1];
    const b = coordinates[i];
    const seg = haversineMeters(a, b);
    const steps = Math.max(1, Math.floor(seg / targetSpacingMeters));
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      out.push({
        lat: a.lat + (b.lat - a.lat) * t,
        lng: a.lng + (b.lng - a.lng) * t,
      });
    }
  }
  return out;
}

export function routeAltColor(index: number): string {
  return ROUTE_ALT_COLORS[index % ROUTE_ALT_COLORS.length];
}
