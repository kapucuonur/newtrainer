import type { LatLng, RouteResult } from './types';

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

function straightFallback(from: LatLng, to: LatLng): RouteResult {
  const distanceMeters = haversineMeters(from, to);
  const coordinates = [from, to];
  return {
    coordinates,
    distanceMeters,
    durationSeconds: distanceMeters / 6, // ~21.6 km/h cycling estimate
    geometry: {
      type: 'LineString',
      coordinates: coordinates.map((c) => [c.lng, c.lat]),
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
 * Fetch A→B (or A→B→A round-trip) with OSRM alternatives.
 * Returns 1–N routes (often 1–3). Falls back to a single straight line on failure.
 */
export async function fetchRouteAlternatives(
  from: LatLng,
  to: LatLng,
  isRoundTrip = false,
): Promise<RouteResult[]> {
  const path = isRoundTrip
    ? `${from.lng},${from.lat};${to.lng},${to.lat};${from.lng},${from.lat}`
    : `${from.lng},${from.lat};${to.lng},${to.lat}`;
  const url =
    `${OSRM_BASE}/route/v1/cycling/${path}` +
    `?overview=full&geometries=geojson&steps=false&alternatives=true`;

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
    return parsed;
  } catch {
    return [straightFallback(from, to)];
  }
}

/**
 * Route A→B using public OSRM cycling profile (free, no API key).
 * Returns the primary alternative. Prefer fetchRouteAlternatives for multi-route UI.
 */
export async function fetchRoute(
  from: LatLng,
  to: LatLng,
  isRoundTrip = false,
): Promise<RouteResult> {
  const alts = await fetchRouteAlternatives(from, to, isRoundTrip);
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
