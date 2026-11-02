import type { RoutePoint } from '../routing/types';
import { pickStreetFrames, type StreetFrame, type StreetImage } from './pickFrames';

/**
 * Street-level photos along a route from Mapillary's Graph API (CC BY-SA,
 * attribution required — see StreetViewPane). The client token is a public,
 * read-only Mapillary client token baked in at build time.
 */

const GRAPH_IMAGES_URL = 'https://graph.mapillary.com/images';
const FIELDS = 'id,geometry,compass_angle,thumb_1024_url,is_pano,sequence,creator';
const REQUEST_TIMEOUT_MS = 10000;
/** Route chunk per bbox query — keeps each box small enough for the API. */
const CHUNK_METERS = 400;
const BBOX_PADDING_DEG = 0.0003;
/** Prototype cap: ~32 km of route, so a long route can't fire hundreds of requests. */
const MAX_CHUNKS = 80;
const CONCURRENCY = 6;

export function getMapillaryToken(): string {
  return import.meta.env.VITE_MAPILLARY_ACCESS_TOKEN?.trim() ?? '';
}

type BBox = { minLng: number; minLat: number; maxLng: number; maxLat: number };

/** Treat API output as untrusted: keep only well-formed https photos. */
function parseImage(raw: unknown): StreetImage | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const coords = (r.geometry as { coordinates?: unknown } | undefined)?.coordinates;
  if (typeof r.id !== 'string' || !Array.isArray(coords) || coords.length < 2) return null;
  const [lng, lat] = coords;
  if (typeof lng !== 'number' || typeof lat !== 'number') return null;
  if (typeof r.compass_angle !== 'number' || !Number.isFinite(r.compass_angle)) return null;
  if (typeof r.thumb_1024_url !== 'string' || !r.thumb_1024_url.startsWith('https://')) return null;
  const creator = (r.creator as { username?: unknown } | undefined)?.username;
  return {
    id: r.id,
    lat,
    lng,
    compassAngle: r.compass_angle,
    isPano: r.is_pano === true,
    thumbUrl: r.thumb_1024_url,
    sequenceId: typeof r.sequence === 'string' ? r.sequence : null,
    creator: typeof creator === 'string' ? creator : null,
  };
}

async function fetchImagesInBBox(bbox: BBox, token: string, signal: AbortSignal): Promise<StreetImage[]> {
  const params = new URLSearchParams({
    access_token: token,
    fields: FIELDS,
    bbox: [bbox.minLng, bbox.minLat, bbox.maxLng, bbox.maxLat].map((v) => v.toFixed(6)).join(','),
    limit: '2000',
  });
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const res = await fetch(`${GRAPH_IMAGES_URL}?${params}`, {
    signal: AbortSignal.any ? AbortSignal.any([signal, timeout]) : timeout,
  });
  if (!res.ok) throw new Error(`Mapillary request failed (${res.status})`);
  const body = (await res.json()) as { data?: unknown };
  if (!Array.isArray(body.data)) return [];
  return body.data.map(parseImage).filter((img): img is StreetImage => img !== null);
}

function chunkBBoxes(samples: RoutePoint[]): BBox[] {
  const boxes: BBox[] = [];
  let current: BBox | null = null;
  let chunkStart = 0;
  for (const s of samples) {
    if (!current || s.distanceMeters - chunkStart > CHUNK_METERS) {
      if (current) boxes.push(current);
      if (boxes.length >= MAX_CHUNKS) return boxes;
      chunkStart = s.distanceMeters;
      current = { minLng: s.lng, minLat: s.lat, maxLng: s.lng, maxLat: s.lat };
    }
    current.minLng = Math.min(current.minLng, s.lng);
    current.minLat = Math.min(current.minLat, s.lat);
    current.maxLng = Math.max(current.maxLng, s.lng);
    current.maxLat = Math.max(current.maxLat, s.lat);
  }
  if (current) boxes.push(current);
  return boxes.map((b) => ({
    minLng: b.minLng - BBOX_PADDING_DEG,
    minLat: b.minLat - BBOX_PADDING_DEG,
    maxLng: b.maxLng + BBOX_PADDING_DEG,
    maxLat: b.maxLat + BBOX_PADDING_DEG,
  }));
}

/**
 * Fetches photos around the route (start first) and picks one per few metres
 * of travel. `onProgress` gets the frames picked so far after each batch, so
 * the ride can start showing photos before a long route finishes loading.
 * Individual chunk failures are skipped (that stretch just shows "no imagery");
 * if every chunk fails the error is rethrown so the UI can say so.
 */
export async function loadStreetFrames(
  samples: RoutePoint[],
  token: string,
  signal: AbortSignal,
  onProgress?: (frames: StreetFrame[]) => void,
): Promise<StreetFrame[]> {
  const boxes = chunkBBoxes(samples);
  const images = new Map<string, StreetImage>();
  let failures = 0;
  let lastError: unknown = null;

  for (let i = 0; i < boxes.length; i += CONCURRENCY) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    const results = await Promise.allSettled(
      boxes.slice(i, i + CONCURRENCY).map((box) => fetchImagesInBBox(box, token, signal)),
    );
    for (const result of results) {
      if (result.status === 'fulfilled') {
        for (const img of result.value) images.set(img.id, img);
      } else {
        failures += 1;
        lastError = result.reason;
      }
    }
    if (onProgress && i + CONCURRENCY < boxes.length) {
      onProgress(pickStreetFrames(samples, [...images.values()]));
    }
  }

  if (boxes.length > 0 && failures === boxes.length) {
    throw lastError instanceof Error ? lastError : new Error('Mapillary unavailable');
  }
  return pickStreetFrames(samples, [...images.values()]);
}
