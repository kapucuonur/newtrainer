import type { RoutePoint } from '../routing/types';

/** One street-level photo (Mapillary), already validated. */
export type StreetImage = {
  id: string;
  lat: number;
  lng: number;
  /** Camera heading, degrees clockwise from north. */
  compassAngle: number;
  thumbUrl: string;
  sequenceId: string | null;
  creator: string | null;
};

/** The photo to show from `distanceMeters` along the route until the next frame. */
export type StreetFrame = {
  distanceMeters: number;
  image: StreetImage;
};

const EARTH_RADIUS_M = 6371000;
/** ~44 m of latitude per bucket; neighbours are searched too. */
const CELL_DEG = 0.0004;
/** A photo farther than this from the rider's road position is not "here". */
const MAX_OFFSET_M = 18;
/** Photos must look roughly where the rider is heading. */
const MAX_ANGLE_DEG = 55;
/** Past this gap with no photo, show "no street imagery" instead of a stale frame. */
export const MAX_FRAME_GAP_M = 60;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Equirectangular distance — fine at street scale. */
function distanceMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const x = toRad(bLng - aLng) * Math.cos(toRad((aLat + bLat) / 2));
  const y = toRad(bLat - aLat);
  return Math.hypot(x, y) * EARTH_RADIUS_M;
}

function bearingDeg(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const y = Math.sin(toRad(bLng - aLng)) * Math.cos(toRad(bLat));
  const x =
    Math.cos(toRad(aLat)) * Math.sin(toRad(bLat)) -
    Math.sin(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.cos(toRad(bLng - aLng));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function angleDiff(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

function cellKey(lat: number, lng: number): string {
  return `${Math.floor(lat / CELL_DEG)}:${Math.floor(lng / CELL_DEG)}`;
}

function pointAtDistance(samples: RoutePoint[], d: number, hint: { i: number }): { lat: number; lng: number } {
  while (hint.i < samples.length - 2 && samples[hint.i + 1].distanceMeters < d) hint.i++;
  const a = samples[hint.i];
  const b = samples[Math.min(samples.length - 1, hint.i + 1)];
  const span = b.distanceMeters - a.distanceMeters || 1;
  const t = Math.max(0, Math.min(1, (d - a.distanceMeters) / span));
  return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
}

/**
 * Walks the route every `spacingMeters` and picks the photo closest to the
 * road position that faces the direction of travel, preferring to stay on the
 * same capture sequence so consecutive frames look continuous.
 */
export function pickStreetFrames(
  samples: RoutePoint[],
  images: StreetImage[],
  spacingMeters = 8,
): StreetFrame[] {
  if (samples.length < 2 || images.length === 0) return [];

  const buckets = new Map<string, StreetImage[]>();
  for (const image of images) {
    const key = cellKey(image.lat, image.lng);
    const list = buckets.get(key);
    if (list) list.push(image);
    else buckets.set(key, [image]);
  }

  const total = samples[samples.length - 1].distanceMeters;
  const frames: StreetFrame[] = [];
  const hereHint = { i: 0 };
  const aheadHint = { i: 0 };
  let previous: StreetImage | null = null;

  for (let d = 0; d <= total; d += spacingMeters) {
    const here = pointAtDistance(samples, d, hereHint);
    const ahead = pointAtDistance(samples, Math.min(total, d + 10), aheadHint);
    const heading = bearingDeg(here.lat, here.lng, ahead.lat, ahead.lng);
    const row = Math.floor(here.lat / CELL_DEG);
    const col = Math.floor(here.lng / CELL_DEG);

    let best: StreetImage | null = null;
    let bestScore = Infinity;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        for (const image of buckets.get(`${row + dr}:${col + dc}`) ?? []) {
          const offset = distanceMeters(here.lat, here.lng, image.lat, image.lng);
          if (offset > MAX_OFFSET_M) continue;
          const turn = angleDiff(image.compassAngle, heading);
          if (turn > MAX_ANGLE_DEG) continue;
          const sameSequence =
            previous?.sequenceId != null && image.sequenceId === previous.sequenceId;
          const score = offset + turn * 0.15 - (sameSequence ? 6 : 0);
          if (score < bestScore) {
            bestScore = score;
            best = image;
          }
        }
      }
    }

    if (best && best.id !== previous?.id) {
      frames.push({ distanceMeters: d, image: best });
      previous = best;
    }
  }
  return frames;
}

/** Frame to show at `distanceMeters`, or null when the rider is in a gap with no photos. */
export function frameAtDistance(frames: StreetFrame[], distanceMeters: number): StreetFrame | null {
  let lo = 0;
  let hi = frames.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (frames[mid].distanceMeters <= distanceMeters) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (found < 0) return null;
  const frame = frames[found];
  return distanceMeters - frame.distanceMeters > MAX_FRAME_GAP_M ? null : frame;
}

/** Share of the route (0–1) that has a photo within the frame gap. */
export function streetCoverage(frames: StreetFrame[], totalMeters: number): number {
  if (totalMeters <= 0 || frames.length === 0) return 0;
  let covered = 0;
  for (let i = 0; i < frames.length; i++) {
    const end = i + 1 < frames.length ? frames[i + 1].distanceMeters : totalMeters;
    covered += Math.min(end - frames[i].distanceMeters, MAX_FRAME_GAP_M);
  }
  return Math.min(1, covered / totalMeters);
}
