import * as THREE from 'three';
import { localXZToLngLat } from './routeProjection';

/**
 * Real satellite imagery (Esri World Imagery — free, keyless XYZ tiles,
 * CORS-open, widely used in open-source web maps) draped over the ground
 * plane. No API key/account needed, consistent with the rest of the app's
 * "no key management" services (OpenFreeMap, public OSRM, Open-Meteo).
 */

const TILE_SIZE = 256;
const MAX_TILES_PER_SIDE = 7;

function esriTileUrl(z: number, x: number, y: number): string {
  return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
}

function lngLatToTileXY(lng: number, lat: number, zoom: number): { x: number; y: number } {
  const n = 2 ** zoom;
  const x = ((lng + 180) / 360) * n;
  const latRad = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  return { x, y };
}

function tileXYToLngLat(x: number, y: number, zoom: number): { lng: number; lat: number } {
  const n = 2 ** zoom;
  const lng = (x / n) * 360 - 180;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n)));
  return { lng, lat: (latRad * 180) / Math.PI };
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

export type SatelliteCoverage = {
  texture: THREE.CanvasTexture;
  /** Real-world bounds the stitched canvas covers, for UV mapping. */
  bounds: { minLng: number; maxLng: number; minLat: number; maxLat: number };
};

/**
 * Fetches and stitches Esri satellite tiles covering the route's bounding
 * box (padded) into one canvas texture. Picks the highest zoom that keeps
 * the tile grid within MAX_TILES_PER_SIDE² so a long route doesn't try to
 * fetch hundreds of tiles.
 */
export async function loadSatelliteCoverage(
  originLat: number,
  originLng: number,
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
): Promise<SatelliteCoverage | null> {
  const corners = [
    localXZToLngLat(originLat, originLng, minX, minZ),
    localXZToLngLat(originLat, originLng, maxX, minZ),
    localXZToLngLat(originLat, originLng, minX, maxZ),
    localXZToLngLat(originLat, originLng, maxX, maxZ),
  ];
  const minLng = Math.min(...corners.map((c) => c.lng));
  const maxLng = Math.max(...corners.map((c) => c.lng));
  const minLat = Math.min(...corners.map((c) => c.lat));
  const maxLat = Math.max(...corners.map((c) => c.lat));

  let zoom = 17;
  let tx0 = 0;
  let ty0 = 0;
  let tx1 = 0;
  let ty1 = 0;
  for (; zoom >= 5; zoom--) {
    const a = lngLatToTileXY(minLng, maxLat, zoom); // top-left (max lat = smaller tile-y)
    const b = lngLatToTileXY(maxLng, minLat, zoom); // bottom-right
    tx0 = Math.floor(a.x);
    ty0 = Math.floor(a.y);
    tx1 = Math.floor(b.x);
    ty1 = Math.floor(b.y);
    if (tx1 - tx0 + 1 <= MAX_TILES_PER_SIDE && ty1 - ty0 + 1 <= MAX_TILES_PER_SIDE) break;
  }

  const cols = tx1 - tx0 + 1;
  const rows = ty1 - ty0 + 1;
  if (cols <= 0 || rows <= 0 || cols > MAX_TILES_PER_SIDE + 1 || rows > MAX_TILES_PER_SIDE + 1) return null;

  const canvas = document.createElement('canvas');
  canvas.width = cols * TILE_SIZE;
  canvas.height = rows * TILE_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const loads: Promise<void>[] = [];
  let anyLoaded = false;
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      const px = (tx - tx0) * TILE_SIZE;
      const py = (ty - ty0) * TILE_SIZE;
      loads.push(
        loadImage(esriTileUrl(zoom, tx, ty)).then((img) => {
          if (img) {
            ctx.drawImage(img, px, py, TILE_SIZE, TILE_SIZE);
            anyLoaded = true;
          }
        }),
      );
    }
  }
  await Promise.all(loads);
  if (!anyLoaded) return null;

  const topLeft = tileXYToLngLat(tx0, ty0, zoom);
  const bottomRight = tileXYToLngLat(tx1 + 1, ty1 + 1, zoom);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;

  return {
    texture,
    bounds: {
      minLng: topLeft.lng,
      maxLng: bottomRight.lng,
      minLat: bottomRight.lat,
      maxLat: topLeft.lat,
    },
  };
}
