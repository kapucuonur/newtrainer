/** Free MapLibre styles — no API key. OpenFreeMap / OpenStreetMap data. */

import type { StyleSpecification } from 'maplibre-gl';

export type MapStyleId = 'satellite' | 'outdoors' | 'streets' | 'light';

export type MapStylePreset = {
  id: MapStyleId;
  /** OpenFreeMap style URL (free public tiles, no key); empty for 'satellite', which is built inline. */
  url: string;
  labelKey: 'map.styleSatellite' | 'map.styleOutdoors' | 'map.styleStreets' | 'map.styleLight';
};

export const MAP_STYLE_PRESETS: readonly MapStylePreset[] = [
  {
    id: 'satellite',
    // Real satellite photography — no vector data, built inline (see buildSatelliteStyle).
    url: '',
    labelKey: 'map.styleSatellite',
  },
  {
    id: 'outdoors',
    // OSM Bright: saturated parks/woods, clear roads — best free outdoor/cycling read.
    url: 'https://tiles.openfreemap.org/styles/bright',
    labelKey: 'map.styleOutdoors',
  },
  {
    id: 'streets',
    // Liberty: classic colorful streets + built-in 3D building extrusion.
    url: 'https://tiles.openfreemap.org/styles/liberty',
    labelKey: 'map.styleStreets',
  },
  {
    id: 'light',
    // Positron: minimal light basemap when route contrast matters most.
    url: 'https://tiles.openfreemap.org/styles/positron',
    labelKey: 'map.styleLight',
  },
] as const;

export const DEFAULT_MAP_STYLE_ID: MapStyleId = 'satellite';

const STORAGE_KEY = 'roadlab.mapStyleId';

export function isMapStyleId(value: unknown): value is MapStyleId {
  return (
    value === 'satellite' || value === 'outdoors' || value === 'streets' || value === 'light'
  );
}

/**
 * Real satellite imagery (Esri World Imagery — free, keyless XYZ tiles,
 * CORS-open) as a standalone raster basemap, with Esri's matching reference
 * overlay (transparent PNG tiles carrying country/region/city/town place
 * names, borders, and road labels — no basemap fill of its own, designed to
 * composite over World_Imagery) drawn on top — otherwise satellite-only
 * imagery has no text anywhere, no country/city/town names. Same free,
 * keyless, CORS-open Esri service as the imagery layer. No vector data, so
 * route planning still works (route/rider layers are added separately, not
 * sourced from the basemap) but 3D building extrusion has nothing to key off
 * and is skipped — same graceful fallback as any other style missing
 * building height attributes.
 */
export function buildSatelliteStyle(): StyleSpecification {
  return {
    version: 8,
    sources: {
      'esri-satellite': {
        type: 'raster',
        tiles: [
          'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        ],
        tileSize: 256,
        attribution: 'Esri, Maxar, Earthstar Geographics',
        // Esri high-zoom imagery only covers select urban/mapped areas — cap
        // below the ride camera zoom so MapLibre overzooms (stretches) the
        // tile rather than fetching Esri's "Map data not yet available" placeholder.
        maxzoom: 16,
      },
      'esri-labels': {
        type: 'raster',
        tiles: [
          'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
        ],
        tileSize: 256,
        attribution: 'Esri',
        maxzoom: 16,
      },
      // Free, keyless AWS/Mapzen Terrain Tiles (Terrarium RGB encoding).
      // Decodes elevation as: height = (R*256 + G + B/256) − 32768 (metres).
      // Used by MapLibre's terrain engine to extrude the ground mesh.
      'terrain-dem': {
        type: 'raster-dem',
        encoding: 'terrarium',
        tiles: [
          'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
        ],
        tileSize: 256,
        maxzoom: 15,
        attribution: 'Terrain Tiles · Mapzen · OpenStreetMap',
      },
    },
    // Activate 3-D terrain — exaggeration 1.5 makes climbs read as visually
    // steep without distorting flat sections too much. Included directly in
    // the style spec so MapLibre enables it before the first frame renders,
    // with no extra setTerrain() call needed after load.
    terrain: {
      source: 'terrain-dem',
      exaggeration: 1.5,
    },
    layers: [
      {
        id: 'esri-satellite-layer',
        type: 'raster',
        source: 'esri-satellite',
      },
      {
        id: 'esri-labels-layer',
        type: 'raster',
        source: 'esri-labels',
      },
    ],
  };
}

export function getPresetById(id: MapStyleId): MapStylePreset {
  return MAP_STYLE_PRESETS.find((p) => p.id === id) ?? MAP_STYLE_PRESETS[0];
}

/** Env override wins for the initial style URL; presets still switchable in UI. */
export function resolveStyleUrl(styleId: MapStyleId): string {
  const envUrl = import.meta.env.VITE_MAP_STYLE_URL?.trim();
  if (envUrl && styleId === DEFAULT_MAP_STYLE_ID) return envUrl;
  return getPresetById(styleId).url;
}

export function loadStoredMapStyleId(): MapStyleId {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (isMapStyleId(raw)) return raw;
  } catch {
    // private mode / SSR-safe
  }
  return DEFAULT_MAP_STYLE_ID;
}

export function storeMapStyleId(id: MapStyleId): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // ignore quota / private mode
  }
}
