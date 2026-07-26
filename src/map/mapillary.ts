import type { LatLng } from '../routing/types';

const TOKEN = import.meta.env.VITE_MAPILLARY_ACCESS_TOKEN?.trim() ?? '';

/** Min rider movement before another Graph API lookup. */
const MIN_MOVE_METERS = 28;
/** Floor between Graph API lookups (even if rider moved). */
const MIN_INTERVAL_MS = 2500;
/** Cache grid (~35 m at mid-latitudes). */
const CACHE_DECIMALS = 4;
const SEARCH_RADIUS_M = 50;

export type MapillaryImage = {
  id: string;
  thumbUrl: string;
  compassAngle: number | null;
  lat: number;
  lng: number;
};

type ApiImage = {
  id: string;
  thumb_1024_url?: string;
  thumb_512_url?: string;
  computed_compass_angle?: number;
  compass_angle?: number;
  computed_geometry?: { type: string; coordinates: [number, number] };
  geometry?: { type: string; coordinates: [number, number] };
};

type ApiResponse = { data?: ApiImage[] };

export function hasMapillaryToken(): boolean {
  return TOKEN.length > 0;
}

function cacheKey(position: LatLng): string {
  return `${position.lat.toFixed(CACHE_DECIMALS)},${position.lng.toFixed(CACHE_DECIMALS)}`;
}

function haversineMeters(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function toImage(raw: ApiImage): MapillaryImage | null {
  const thumbUrl = raw.thumb_1024_url ?? raw.thumb_512_url;
  if (!thumbUrl) return null;

  const coords =
    raw.computed_geometry?.coordinates ?? raw.geometry?.coordinates;
  const compass =
    typeof raw.computed_compass_angle === 'number'
      ? raw.computed_compass_angle
      : typeof raw.compass_angle === 'number'
        ? raw.compass_angle
        : null;

  return {
    id: raw.id,
    thumbUrl,
    compassAngle: compass,
    lat: coords?.[1] ?? 0,
    lng: coords?.[0] ?? 0,
  };
}

async function fetchNearestImage(
  position: LatLng,
  signal: AbortSignal,
): Promise<MapillaryImage | null> {
  if (!TOKEN) return null;

  const fields = [
    'id',
    'geometry',
    'computed_geometry',
    'compass_angle',
    'computed_compass_angle',
    'thumb_1024_url',
    'thumb_512_url',
  ].join(',');

  const params = new URLSearchParams({
    access_token: TOKEN,
    fields,
    lat: position.lat.toFixed(6),
    lng: position.lng.toFixed(6),
    radius: String(SEARCH_RADIUS_M),
    limit: '1',
  });

  const res = await fetch(`https://graph.mapillary.com/images?${params}`, {
    signal,
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) {
    throw new Error(`Mapillary ${res.status}`);
  }

  const body = (await res.json()) as ApiResponse;
  const first = body.data?.[0];
  return first ? toImage(first) : null;
}

/**
 * Throttled + cached nearest-image lookups for ride position updates.
 * Callers should treat a returned `unchanged` as "keep previous UI state".
 */
export class MapillaryNearestClient {
  private cache = new Map<string, MapillaryImage | null>();
  private lastPos: LatLng | null = null;
  private lastAt = 0;
  private abort: AbortController | null = null;
  private lastImage: MapillaryImage | null = null;

  reset(): void {
    this.abort?.abort();
    this.abort = null;
    this.cache.clear();
    this.lastPos = null;
    this.lastAt = 0;
    this.lastImage = null;
  }

  async lookup(
    position: LatLng,
  ): Promise<{ image: MapillaryImage | null; unchanged: boolean }> {
    if (!TOKEN) {
      return { image: null, unchanged: false };
    }

    const key = cacheKey(position);
    if (this.cache.has(key)) {
      const image = this.cache.get(key) ?? null;
      this.lastImage = image;
      this.lastPos = position;
      return { image, unchanged: false };
    }

    const now = Date.now();
    const moved =
      this.lastPos === null
        ? Infinity
        : haversineMeters(this.lastPos, position);
    const elapsed = now - this.lastAt;

    if (
      this.lastPos !== null &&
      moved < MIN_MOVE_METERS &&
      elapsed < MIN_INTERVAL_MS
    ) {
      return { image: this.lastImage, unchanged: true };
    }

    this.abort?.abort();
    const controller = new AbortController();
    this.abort = controller;
    this.lastPos = position;
    this.lastAt = now;

    try {
      const image = await fetchNearestImage(position, controller.signal);
      if (controller.signal.aborted) {
        return { image: this.lastImage, unchanged: true };
      }
      this.cache.set(key, image);
      // Bound memory on long rides.
      if (this.cache.size > 80) {
        const oldest = this.cache.keys().next().value;
        if (oldest !== undefined) this.cache.delete(oldest);
      }
      this.lastImage = image;
      return { image, unchanged: false };
    } catch (error) {
      if (controller.signal.aborted) {
        return { image: this.lastImage, unchanged: true };
      }
      throw error;
    }
  }
}
