import { densifyRoute } from '../routing/osrm';
import { getApiBaseUrl } from '../api/config';
import type {
  ElevationSource,
  EnrichedRoute,
  LatLng,
  RoutePoint,
  RouteResult,
} from '../routing/types';

const OPEN_METEO_BASE = 'https://api.open-meteo.com/v1/elevation';
const OPEN_TOPO_BASE =
  import.meta.env.VITE_ELEVATION_URL?.trim() ||
  'https://api.opentopodata.org/v1/mapzen';

/** Max concurrent Open-Meteo chunk requests from the browser. */
const OPEN_METEO_CONCURRENCY = 4;
/** Open-Meteo / OpenTopo batch size (keeps URLs under common length limits). */
const ELEVATION_CHUNK_SIZE = 80;
/** Max locations per Pi proxy request. */
const PROXY_BATCH_SIZE = 800;

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
 * Adaptive sample spacing: dense enough for pro grade feel, sparse enough
 * for free DEM quotas (~50–100 m).
 */
export function sampleSpacingMeters(distanceMeters: number): number {
  if (distanceMeters < 15_000) return 50;
  if (distanceMeters < 60_000) return 75;
  return 100;
}

function assertElevationLength(elevations: number[], expected: number, label: string): void {
  if (elevations.length !== expected) {
    throw new Error(
      `${label}: expected ${expected} elevations, got ${elevations.length}`,
    );
  }
}

function normalizeElevation(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return value;
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;

  async function run(): Promise<void> {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i], i);
    }
  }

  const runners = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => run(),
  );
  await Promise.all(runners);
  return results;
}

/**
 * Pi backend proxy — avoids browser CORS / public rate-limit issues.
 */
async function fetchProxyElevations(points: LatLng[]): Promise<number[]> {
  const base = getApiBaseUrl();
  if (!base) throw new Error('Pi API URL not configured');

  const elevations: number[] = [];
  for (let i = 0; i < points.length; i += PROXY_BATCH_SIZE) {
    const chunk = points.slice(i, i + PROXY_BATCH_SIZE);
    const res = await fetch(`${base}/api/elevation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        locations: chunk.map((p) => ({ lat: p.lat, lng: p.lng })),
      }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(body?.error || `Elevation proxy HTTP ${res.status}`);
    }
    const json = (await res.json()) as { elevations?: unknown };
    if (!Array.isArray(json.elevations)) {
      throw new Error('Elevation proxy returned no elevations');
    }
    elevations.push(...json.elevations.map(normalizeElevation));
  }
  assertElevationLength(elevations, points.length, 'Elevation proxy');
  return elevations;
}

/**
 * Open-Meteo DEM (Copernicus / GLO-90 style). Free, CORS-friendly, no key.
 */
async function fetchOpenMeteoElevations(points: LatLng[]): Promise<number[]> {
  if (points.length === 0) return [];

  const chunks: LatLng[][] = [];
  for (let i = 0; i < points.length; i += ELEVATION_CHUNK_SIZE) {
    chunks.push(points.slice(i, i + ELEVATION_CHUNK_SIZE));
  }

  const chunkResults = await mapPool(chunks, OPEN_METEO_CONCURRENCY, async (chunk) => {
    const lats = chunk.map((p) => p.lat.toFixed(5)).join(',');
    const lngs = chunk.map((p) => p.lng.toFixed(5)).join(',');
    const url = `${OPEN_METEO_BASE}?latitude=${lats}&longitude=${lngs}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
    const json = (await res.json()) as { elevation?: unknown };
    if (!Array.isArray(json.elevation)) {
      throw new Error('Open-Meteo elevation data missing');
    }
    if (json.elevation.length !== chunk.length) {
      throw new Error(
        `Open-Meteo chunk size mismatch (${json.elevation.length} vs ${chunk.length})`,
      );
    }
    return json.elevation.map(normalizeElevation);
  });

  const elevations = chunkResults.flat();
  assertElevationLength(elevations, points.length, 'Open-Meteo');
  return elevations;
}

/**
 * OpenTopoData mapzen (or VITE_ELEVATION_URL dataset). Public API: ~1 req/s.
 */
async function fetchOpenTopoElevations(points: LatLng[]): Promise<number[]> {
  const elevations: number[] = [];

  for (let i = 0; i < points.length; i += ELEVATION_CHUNK_SIZE) {
    const chunk = points.slice(i, i + ELEVATION_CHUNK_SIZE);
    const locations = chunk.map((p) => `${p.lat},${p.lng}`).join('|');
    const url = `${OPEN_TOPO_BASE}?locations=${encodeURIComponent(locations)}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`OpenTopo HTTP ${response.status}`);
    const json = (await response.json()) as {
      status?: string;
      results?: Array<{ elevation: number | null }>;
    };
    if (json.status !== 'OK' || !json.results) {
      throw new Error('OpenTopo lookup failed');
    }
    if (json.results.length !== chunk.length) {
      throw new Error('OpenTopo chunk size mismatch');
    }
    elevations.push(...json.results.map((r) => normalizeElevation(r.elevation)));
    if (i + ELEVATION_CHUNK_SIZE < points.length) {
      await new Promise((r) => setTimeout(r, 1100));
    }
  }

  assertElevationLength(elevations, points.length, 'OpenTopo');
  return elevations;
}

type ElevationFetchResult = {
  elevations: number[];
  source: Exclude<ElevationSource, 'unavailable'>;
};

/**
 * Prefer Pi proxy when configured; else Open-Meteo, then OpenTopo.
 * Never invents synthetic terrain.
 */
async function fetchAllElevations(points: LatLng[]): Promise<ElevationFetchResult> {
  const errors: string[] = [];

  if (getApiBaseUrl()) {
    try {
      return { elevations: await fetchProxyElevations(points), source: 'proxy' };
    } catch (err) {
      errors.push(err instanceof Error ? err.message : 'proxy failed');
    }
  }

  try {
    return { elevations: await fetchOpenMeteoElevations(points), source: 'open-meteo' };
  } catch (err) {
    errors.push(err instanceof Error ? err.message : 'open-meteo failed');
  }

  try {
    return { elevations: await fetchOpenTopoElevations(points), source: 'opentopo' };
  } catch (err) {
    errors.push(err instanceof Error ? err.message : 'opentopo failed');
  }

  throw new Error(`Elevation providers unavailable (${errors.join('; ')})`);
}

/** Light 5-point Gaussian to tame DEM noise — does not invent hills. */
function smoothElevationsGaussian(raw: number[]): number[] {
  if (raw.length < 3) return raw;
  const smoothed: number[] = new Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    const p0 = raw[Math.max(0, i - 2)];
    const p1 = raw[Math.max(0, i - 1)];
    const p2 = raw[i];
    const p3 = raw[Math.min(raw.length - 1, i + 1)];
    const p4 = raw[Math.min(raw.length - 1, i + 2)];
    smoothed[i] = p0 * 0.1 + p1 * 0.2 + p2 * 0.4 + p3 * 0.2 + p4 * 0.1;
  }
  return smoothed;
}

function buildSamples(
  spaced: LatLng[],
  elevations: number[],
): {
  samples: RoutePoint[];
  elevGainMeters: number;
  elevLossMeters: number;
  minElevMeters: number;
  maxElevMeters: number;
} {
  const samples: RoutePoint[] = [];
  let cumulative = 0;
  let elevGain = 0;
  let elevLoss = 0;
  let minElev = elevations[0] ?? 0;
  let maxElev = elevations[0] ?? 0;
  let pendingGain = 0;
  let pendingLoss = 0;

  for (let i = 0; i < spaced.length; i++) {
    const point = spaced[i];
    const elev = elevations[i] ?? 0;

    if (i > 0) {
      const dist = haversineMeters(spaced[i - 1], point);
      const dElev = elev - (elevations[i - 1] ?? elev);
      cumulative += dist;

      if (dElev > 0) {
        pendingGain += dElev;
        if (pendingGain >= 0.5) {
          elevGain += pendingGain;
          pendingGain = 0;
        }
        pendingLoss = 0;
      } else if (dElev < 0) {
        pendingLoss += -dElev;
        if (pendingLoss >= 0.5) {
          elevLoss += pendingLoss;
          pendingLoss = 0;
        }
        pendingGain = 0;
      }
    }

    minElev = Math.min(minElev, elev);
    maxElev = Math.max(maxElev, elev);

    let gradePercent = 0;
    const prevIdx = Math.max(0, i - 2);
    const nextIdx = Math.min(spaced.length - 1, i + 2);
    if (nextIdx > prevIdx) {
      const windowDist = haversineMeters(spaced[prevIdx], spaced[nextIdx]);
      const windowDElev = elevations[nextIdx] - elevations[prevIdx];
      gradePercent = windowDist > 1.0 ? (windowDElev / windowDist) * 100 : 0;
      gradePercent = Math.max(-18, Math.min(22, gradePercent));
    }

    samples.push({
      lat: point.lat,
      lng: point.lng,
      elevationMeters: Number(elev.toFixed(1)),
      distanceMeters: Number(cumulative.toFixed(1)),
      gradePercent: Number(gradePercent.toFixed(2)),
    });
  }

  for (let i = 0; i < samples.length; i++) {
    const win = samples.slice(Math.max(0, i - 1), Math.min(samples.length, i + 2));
    const avgGrade = win.reduce((acc, s) => acc + s.gradePercent, 0) / win.length;
    samples[i].gradePercent = Number(avgGrade.toFixed(2));
  }

  return {
    samples,
    elevGainMeters: Math.round(elevGain),
    elevLossMeters: Math.round(elevLoss),
    minElevMeters: Math.round(minElev),
    maxElevMeters: Math.round(maxElev),
  };
}

function flatUnavailableRoute(
  route: RouteResult,
  spaced: LatLng[],
  warning: string,
): EnrichedRoute {
  const elevations = spaced.map(() => 0);
  const built = buildSamples(spaced, elevations);
  return {
    ...route,
    ...built,
    elevationSource: 'unavailable',
    elevationWarning: warning,
  };
}

/**
 * Enrich an OSRM route with real DEM elevations and grade %.
 * On total provider failure: honest flat profile + warning (never sine waves).
 */
export async function enrichRouteWithElevation(
  route: RouteResult,
): Promise<EnrichedRoute> {
  const spacing = sampleSpacingMeters(route.distanceMeters);
  const spaced = densifyRoute(route.coordinates, spacing);

  try {
    const { elevations: rawElevations, source } = await fetchAllElevations(spaced);
    const elevations = smoothElevationsGaussian(rawElevations);
    const built = buildSamples(spaced, elevations);
    return {
      ...route,
      ...built,
      elevationSource: source,
    };
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'unknown error';
    return flatUnavailableRoute(
      route,
      spaced,
      `Elevation data unavailable — trainer grade set to flat. ${detail}`,
    );
  }
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
    gradePercent: Number((a.gradePercent + (b.gradePercent - a.gradePercent) * t).toFixed(2)),
    elevationMeters: Number(
      (a.elevationMeters + (b.elevationMeters - a.elevationMeters) * t).toFixed(1),
    ),
    lat: a.lat + (b.lat - a.lat) * t,
    lng: a.lng + (b.lng - a.lng) * t,
  };
}
