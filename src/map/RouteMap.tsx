import {
  GeoJSONSource,
  LngLatBounds,
  Map,
  Marker,
  NavigationControl,
  ScaleControl,
  setWorkerUrl,
  type StyleSpecification,
} from 'maplibre-gl';
import { useEffect, useRef, useState } from 'react';
import { useT } from '../i18n';
import type { RidePhase } from '../simulation/rideEngine';
import { routeAltColor } from '../routing/osrm';
import type {
  EnrichedRoute,
  LatLng,
  RouteLineString,
  RoutePoint,
  RouteResult,
} from '../routing/types';
import { waypointLabel } from '../routing/waypoints';
import { bearingAlongRoute, destinationPoint, lerpBearing } from './bearing';
import { MapStylePicker } from '../ui/MapStylePicker';
import {
  loadStoredMapStyleId,
  resolveStyleUrl,
  storeMapStyleId,
  type MapStyleId,
} from './mapStyles';
import { sanitizeMapStyle } from './sanitizeMapStyle';
import 'maplibre-gl/dist/maplibre-gl.css';

// Served from /maplibre-worker/ (see vite.config.ts) alongside its sibling
// maplibre-gl-shared.mjs chunk, which the worker module statically imports —
// a plain `?url` asset import copies only the worker and leaves that import 404ing.
// Capacitor Android serves the same paths from https://localhost (secure context).
{
  const base = import.meta.env.BASE_URL.endsWith('/')
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`;
  setWorkerUrl(new URL(`${base}maplibre-worker/maplibre-gl-worker.mjs`, window.location.origin).href);
}

async function loadMapStyle(styleId: MapStyleId): Promise<string | StyleSpecification> {
  const url = resolveStyleUrl(styleId);
  try {
    const res = await fetch(url);
    if (!res.ok) return url;
    const json: unknown = await res.json();
    if (!json || typeof json !== 'object') return url;
    return sanitizeMapStyle(json as StyleSpecification);
  } catch {
    return url;
  }
}

export type MapPeer = {
  userId: number;
  displayName: string;
  position: LatLng;
};

type Props = {
  waypoints: LatLng[];
  /** Next label shown in pick banner (A, B, C…). */
  nextWaypointLabel?: string | null;
  route: EnrichedRoute | null;
  /** OSRM alternatives shown faded until selected (planning only). */
  routeAlternatives?: RouteResult[];
  selectedAlternativeIndex?: number;
  onSelectAlternative?: (index: number) => void;
  rider: LatLng | null;
  ridePhase: RidePhase;
  distanceMeters: number;
  /** Current speed — subtly widens the ride camera at higher speed for a sense of pace. */
  speedKmh?: number;
  onPick: (point: LatLng) => void;
  /** When true, map clicks append the next waypoint. */
  pickMode: boolean;
  pickingEnabled?: boolean;
  /** Other riders on the shared route (group rides). */
  peers?: MapPeer[];
  /** Group mode: colored map + peer markers. */
  groupMode?: boolean;
  /** When false, host UI owns the style chips (e.g. closed-panel chrome). */
  showStylePicker?: boolean;
  styleId?: MapStyleId;
  onStyleIdChange?: (id: MapStyleId) => void;
};

function pinClassForIndex(index: number, total: number): string {
  if (index === 0) return 'map-pin-a';
  if (index === total - 1 && total > 1) return 'map-pin-b';
  return 'map-pin-via';
}

// Minimal side-view cyclist glyph (head + torso + frame + wheels) — a real
// vector bike-and-rider instead of the wobbly 🚴 emoji, small enough to read
// at marker scale.
const RIDER_BIKE_SVG = `
<svg viewBox="0 0 32 32" width="19" height="19" fill="none" xmlns="http://www.w3.org/2000/svg">
  <circle cx="16" cy="7" r="2.6" fill="currentColor"/>
  <path d="M16 9.3 L13.5 15 L19 15 L16.6 20.5" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M13.5 15 L9 20.5" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>
  <path d="M13.5 15 L21 22.5" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>
  <circle cx="7" cy="22.5" r="4.3" stroke="currentColor" stroke-width="1.9"/>
  <circle cx="21" cy="22.5" r="4.3" stroke="currentColor" stroke-width="1.9"/>
</svg>`.trim();

/**
 * Builds the rider map marker: a fixed, always-upright bike glyph (readable
 * regardless of camera rotation) plus a heading cone that points the travel
 * direction. `heading` is rotated separately so the glyph never flips.
 */
function createRiderMarkerElement(): { root: HTMLDivElement; heading: HTMLDivElement } {
  const root = document.createElement('div');
  root.className = 'rider-marker';
  root.innerHTML = `<div class="rider-marker-cone"></div><div class="rider-marker-core">${RIDER_BIKE_SVG}</div>`;
  const heading = root.querySelector('.rider-marker-cone') as HTMLDivElement;
  return { root, heading };
}

function haversineMetersApprox(a: LatLng, b: LatLng): number {
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

function riderTrailData(points: LatLng[]) {
  if (points.length < 2) {
    return { type: 'FeatureCollection' as const, features: [] };
  }
  return {
    type: 'FeatureCollection' as const,
    features: [
      {
        type: 'Feature' as const,
        properties: {},
        geometry: {
          type: 'LineString' as const,
          coordinates: points.map((p) => [p.lng, p.lat]),
        },
      },
    ],
  };
}

function ensureRiderTrailOverlay(map: Map): void {
  if (map.getSource('rider-trail')) return;
  map.addSource('rider-trail', {
    type: 'geojson',
    lineMetrics: true,
    data: { type: 'FeatureCollection', features: [] },
  });
  map.addLayer({
    id: 'rider-trail-line',
    type: 'line',
    source: 'rider-trail',
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-width': 5,
      'line-color': '#00f0ff',
      'line-gradient': [
        'interpolate',
        ['linear'],
        ['line-progress'],
        0,
        'rgba(0,240,255,0)',
        1,
        'rgba(0,240,255,0.85)',
      ],
    },
  });
}

function setRiderTrailData(map: Map, points: LatLng[]): void {
  ensureRiderTrailOverlay(map);
  const source = map.getSource('rider-trail') as GeoJSONSource | undefined;
  source?.setData(riderTrailData(points));
}

/** Splits the ridden route into a dim "traveled" line and a bright "remaining" line. */
function splitRouteAtDistance(
  samples: RoutePoint[],
  distanceMeters: number,
): { traveled: RouteLineString; remaining: RouteLineString } {
  const empty: RouteLineString = { type: 'LineString', coordinates: [] };
  if (samples.length < 2) return { traveled: empty, remaining: empty };

  const clamped = Math.max(
    samples[0].distanceMeters,
    Math.min(distanceMeters, samples[samples.length - 1].distanceMeters),
  );

  let lo = 0;
  let hi = samples.length - 1;
  while (lo < hi - 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (samples[mid].distanceMeters <= clamped) lo = mid;
    else hi = mid;
  }

  const a = samples[lo];
  const b = samples[hi];
  const span = b.distanceMeters - a.distanceMeters || 1;
  const t = (clamped - a.distanceMeters) / span;
  const splitPoint: LatLng = {
    lat: a.lat + (b.lat - a.lat) * t,
    lng: a.lng + (b.lng - a.lng) * t,
  };

  const traveledCoords = samples.slice(0, lo + 1).map((s) => [s.lng, s.lat]);
  traveledCoords.push([splitPoint.lng, splitPoint.lat]);

  const remainingCoords = [
    [splitPoint.lng, splitPoint.lat],
    ...samples.slice(hi).map((s) => [s.lng, s.lat]),
  ];

  return {
    traveled: { type: 'LineString', coordinates: traveledCoords },
    remaining: { type: 'LineString', coordinates: remainingCoords },
  };
}

/** Interpolated grade (%) at `distanceMeters`, from the same real DEM samples used for elevation. */
function gradeAtDistance(samples: RoutePoint[], distanceMeters: number): number {
  if (samples.length === 0) return 0;
  if (distanceMeters <= samples[0].distanceMeters) return samples[0].gradePercent;
  const last = samples[samples.length - 1];
  if (distanceMeters >= last.distanceMeters) return last.gradePercent;

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
  return a.gradePercent + (b.gradePercent - a.gradePercent) * t;
}

// Ride-camera tuning: these exaggerate the *visual* framing of the same real
// grade/speed data (no synthetic elevation) so climbs read as steep and
// speed reads as fast, the way racing/training games bias their camera.
const RIDE_BASE_PITCH = 62;
const RIDE_MAX_PITCH = 78;
const RIDE_BASE_ZOOM = 16.2;
const RIDE_LOOK_AHEAD_METERS = 14;

/** Tilts the camera toward the horizon on climbs — a graded plane reads as a steeper wall the flatter the viewing angle. */
function climbPitchBoost(gradePercent: number): number {
  return Math.max(0, Math.min(gradePercent, 14)) * 0.85;
}

/** Nudges the camera in slightly on climbs, framing the "wall" ahead tighter. */
function climbZoomBoost(gradePercent: number): number {
  return Math.max(0, Math.min(gradePercent, 12)) * 0.035;
}

/** Pulls the camera back slightly at speed for a sense of covering ground fast. */
function speedZoomOut(speedKmh: number): number {
  return Math.max(0, Math.min(speedKmh - 15, 30)) * 0.012;
}

const BUILDING_SOURCE_LAYERS = new Set(['building', 'buildings']);

function tryEnable3dBuildings(map: Map): void {
  if (map.getLayer('roadlab-3d-buildings')) return;

  const style = map.getStyle();
  const layers = style?.layers ?? [];

  // Liberty already ships a fill-extrusion building layer — keep it.
  const hasExtrusion = layers.some(
    (layer) =>
      layer.type === 'fill-extrusion' &&
      'source-layer' in layer &&
      typeof layer['source-layer'] === 'string' &&
      BUILDING_SOURCE_LAYERS.has(layer['source-layer']),
  );
  if (hasExtrusion) return;

  const sources = style?.sources ?? {};
  const sourceId = Object.keys(sources).find((id) => {
    const src = sources[id];
    return src.type === 'vector';
  });
  if (!sourceId) return;

  let buildingSourceLayer: string | null = null;
  for (const layer of layers) {
    if (
      layer.type === 'fill' &&
      'source-layer' in layer &&
      typeof layer['source-layer'] === 'string' &&
      BUILDING_SOURCE_LAYERS.has(layer['source-layer'])
    ) {
      buildingSourceLayer = layer['source-layer'];
      try {
        map.setLayoutProperty(layer.id, 'visibility', 'none');
      } catch {
        // Style variants may lock layout; ignore.
      }
    }
  }
  if (!buildingSourceLayer) buildingSourceLayer = 'building';

  try {
    map.addLayer({
      id: 'roadlab-3d-buildings',
      source: sourceId,
      'source-layer': buildingSourceLayer,
      type: 'fill-extrusion',
      minzoom: 13,
      paint: {
        'fill-extrusion-color': '#c4ccd6',
        'fill-extrusion-vertical-gradient': true,
        'fill-extrusion-opacity': [
          'interpolate',
          ['linear'],
          ['zoom'],
          13,
          0.35,
          15,
          0.6,
          17,
          0.85,
        ],
        'fill-extrusion-height': [
          'interpolate',
          ['linear'],
          ['zoom'],
          13,
          0,
          13.5,
          [
            'coalesce',
            ['get', 'render_height'],
            ['get', 'height'],
            12,
          ],
        ],
        'fill-extrusion-base': [
          'coalesce',
          ['get', 'render_min_height'],
          ['get', 'min_height'],
          0,
        ],
      },
    });
  } catch {
    // Some styles lack building height attrs; ride view still works without extrusion.
  }
}

function ensureRouteOverlay(map: Map): void {
  if (map.getSource('route')) return;

  map.addSource('route', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  });
  map.addLayer({
    id: 'route-alt-hit',
    type: 'line',
    source: 'route',
    filter: ['==', ['get', 'selected'], 0],
    paint: {
      'line-color': '#ffffff',
      'line-width': 18,
      'line-opacity': 0.01,
    },
  });
  map.addLayer({
    id: 'route-alt-line',
    type: 'line',
    source: 'route',
    filter: ['==', ['get', 'selected'], 0],
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color': ['get', 'color'],
      'line-width': 4,
      'line-opacity': 0.42,
    },
  });
  map.addLayer({
    id: 'route-traveled-line',
    type: 'line',
    source: 'route',
    filter: ['==', ['get', 'traveled'], 1],
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color': ['get', 'color'],
      'line-width': 4,
      'line-opacity': 0.24,
    },
  });
  map.addLayer({
    id: 'route-glow',
    type: 'line',
    source: 'route',
    filter: ['all', ['==', ['get', 'selected'], 1], ['!=', ['get', 'traveled'], 1]],
    paint: {
      'line-color': ['get', 'color'],
      'line-width': 12,
      'line-opacity': 0.35,
      'line-blur': 1.5,
    },
  });
  map.addLayer({
    id: 'route-line',
    type: 'line',
    source: 'route',
    filter: ['all', ['==', ['get', 'selected'], 1], ['!=', ['get', 'traveled'], 1]],
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color': ['get', 'color'],
      'line-width': 5.5,
      'line-opacity': 1,
    },
  });
}

export function RouteMap({
  waypoints,
  nextWaypointLabel = null,
  route,
  routeAlternatives = [],
  selectedAlternativeIndex = 0,
  onSelectAlternative,
  rider,
  ridePhase,
  distanceMeters,
  speedKmh = 0,
  onPick,
  pickMode,
  pickingEnabled = true,
  peers = [],
  groupMode = false,
  showStylePicker: showStylePickerProp,
  styleId: styleIdProp,
  onStyleIdChange,
}: Props) {
  const t = useT();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const waypointMarkersRef = useRef<Marker[]>([]);
  const markerRider = useRef<Marker | null>(null);
  const riderHeadingElRef = useRef<HTMLDivElement | null>(null);
  const riderTrailRef = useRef<LatLng[]>([]);
  const peerMarkersRef = useRef(new globalThis.Map<number, Marker>());
  const onPickRef = useRef(onPick);
  const pickModeRef = useRef(pickMode);
  const pickingEnabledRef = useRef(pickingEnabled);
  const onSelectAlternativeRef = useRef(onSelectAlternative);
  const lastFocusedWaypointRef = useRef<string | null>(null);
  const bearingRef = useRef(0);
  const appliedStyleIdRef = useRef<MapStyleId | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [uncontrolledStyleId, setUncontrolledStyleId] = useState<MapStyleId>(() =>
    loadStoredMapStyleId(),
  );
  const styleId = styleIdProp ?? uncontrolledStyleId;
  const setStyleId = onStyleIdChange ?? setUncontrolledStyleId;

  const followRoad = ridePhase === 'riding' || ridePhase === 'paused';
  const activePickMode = pickingEnabled && pickMode;
  const showAlternatives = !followRoad && routeAlternatives.length > 1;
  const showStylePicker =
    showStylePickerProp !== undefined ? showStylePickerProp : !followRoad;

  useEffect(() => {
    onPickRef.current = onPick;
  }, [onPick]);

  useEffect(() => {
    pickModeRef.current = pickMode;
  }, [pickMode]);

  useEffect(() => {
    pickingEnabledRef.current = pickingEnabled;
  }, [pickingEnabled]);

  useEffect(() => {
    onSelectAlternativeRef.current = onSelectAlternative;
  }, [onSelectAlternative]);

  useEffect(() => {
    storeMapStyleId(styleId);
  }, [styleId]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    let cancelled = false;
    let map: Map | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let handleWinResize: (() => void) | null = null;
    const container = containerRef.current;
    const initialStyleId = styleId;

    void (async () => {
      try {
      const style = await loadMapStyle(initialStyleId);
      if (cancelled || !containerRef.current) return;

      map = new Map({
        container: containerRef.current,
        style,
        center: [28.9784, 41.0082],
        zoom: 11,
        pitch: 0,
        bearing: 0,
        maxPitch: RIDE_MAX_PITCH,
        attributionControl: { compact: true },
        transformRequest: (url) => ({ url }),
      });

      if (cancelled) {
        map.remove();
        map = null;
        return;
      }

      const activeMap = map;
      appliedStyleIdRef.current = initialStyleId;
      setMapError(null);

      activeMap.addControl(new NavigationControl({ visualizePitch: true }), 'top-right');
      activeMap.addControl(new ScaleControl({ unit: 'metric' }));

      activeMap.on('error', (e: { error?: Error }) => {
        const errObj = e?.error;
        if (errObj && typeof errObj.message === 'string') {
          // Ignore harmless missing font/sprite warnings
          if (!errObj.message.includes('sprite') && !errObj.message.includes('glyph')) {
            console.warn('[RouteMap] MapLibre warning/error:', errObj.message);
          }
        }
      });

      activeMap.on('click', (e: { lngLat: { lat: number; lng: number } }) => {
        if (!pickingEnabledRef.current || !pickModeRef.current) return;
        onPickRef.current({ lat: e.lngLat.lat, lng: e.lngLat.lng });
      });

      const wireRouteClicks = () => {
        const onAltClick = (e: {
          features?: Array<{ properties?: { index?: number } }>;
        }) => {
          const idx = e.features?.[0]?.properties?.index;
          if (typeof idx === 'number' && Number.isFinite(idx)) {
            onSelectAlternativeRef.current?.(idx);
          }
        };
        activeMap.on('click', 'route-alt-hit', onAltClick);
        activeMap.on('click', 'route-alt-line', onAltClick);
        activeMap.on('mouseenter', 'route-alt-hit', () => {
          activeMap.getCanvas().style.cursor = 'pointer';
        });
        activeMap.on('mouseleave', 'route-alt-hit', () => {
          activeMap.getCanvas().style.cursor = '';
        });
      };

      activeMap.on('load', () => {
        ensureRouteOverlay(activeMap);
        ensureRiderTrailOverlay(activeMap);
        wireRouteClicks();
        tryEnable3dBuildings(activeMap);
      });

      activeMap.on('style.load', () => {
        ensureRouteOverlay(activeMap);
        setRiderTrailData(activeMap, riderTrailRef.current);
        tryEnable3dBuildings(activeMap);
      });

      mapRef.current = activeMap;

      resizeObserver =
        typeof ResizeObserver !== 'undefined'
          ? new ResizeObserver(() => {
              activeMap.resize();
            })
          : null;
      resizeObserver?.observe(container);

      handleWinResize = () => activeMap.resize();
      window.addEventListener('resize', handleWinResize);
      window.addEventListener('orientationchange', handleWinResize);
      setTimeout(() => activeMap.resize(), 300);
      setTimeout(() => activeMap.resize(), 1000);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setMapError(msg);
      }
    })();

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      if (handleWinResize) {
        window.removeEventListener('resize', handleWinResize);
        window.removeEventListener('orientationchange', handleWinResize);
      }
      for (const marker of waypointMarkersRef.current) marker.remove();
      waypointMarkersRef.current = [];
      markerRider.current?.remove();
      for (const marker of peerMarkersRef.current.values()) marker.remove();
      peerMarkersRef.current.clear();
      map?.remove();
      mapRef.current = null;
      appliedStyleIdRef.current = null;
    };
    // Mount once; style changes use setStyle below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || appliedStyleIdRef.current === styleId) return;

    let cancelled = false;
    void (async () => {
      const next = await loadMapStyle(styleId);
      if (cancelled || !mapRef.current) return;
      appliedStyleIdRef.current = styleId;
      mapRef.current.setStyle(next);
    })();

    return () => {
      cancelled = true;
    };
  }, [styleId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const markers = waypointMarkersRef.current;

    while (markers.length > waypoints.length) {
      markers.pop()?.remove();
    }

    for (let i = 0; i < waypoints.length; i++) {
      const point = waypoints[i];
      const label = waypointLabel(i);
      const className = pinClassForIndex(i, waypoints.length);
      let marker = markers[i];
      if (!marker) {
        const el = document.createElement('div');
        el.className = `map-pin ${className}`;
        el.textContent = label;
        marker = new Marker({ element: el, anchor: 'bottom' })
          .setLngLat([point.lng, point.lat])
          .addTo(map);
        markers[i] = marker;
      } else {
        marker.setLngLat([point.lng, point.lat]);
        const el = marker.getElement();
        el.className = `map-pin ${className}`;
        el.textContent = label;
      }
    }

    if (!markerRider.current && rider) {
      const { root, heading } = createRiderMarkerElement();
      riderHeadingElRef.current = heading;
      markerRider.current = new Marker({ element: root })
        .setLngLat([rider.lng, rider.lat])
        .addTo(map);
    } else if (markerRider.current && rider) {
      markerRider.current.setLngLat([rider.lng, rider.lat]);
    } else if (markerRider.current && !rider) {
      markerRider.current.remove();
      markerRider.current = null;
      riderHeadingElRef.current = null;
    }

    if (followRoad && rider) {
      const trail = riderTrailRef.current;
      const last = trail[trail.length - 1];
      if (!last || haversineMetersApprox(last, rider) > 2.5) {
        trail.push(rider);
        if (trail.length > 240) trail.shift();
        if (map.isStyleLoaded()) setRiderTrailData(map, trail);
      }
    } else if (!followRoad && riderTrailRef.current.length > 0) {
      riderTrailRef.current = [];
      if (map.isStyleLoaded()) setRiderTrailData(map, []);
    }

    if (!route && waypoints.length > 0) {
      const last = waypoints[waypoints.length - 1];
      const focusKey = `${waypoints.length}:${last.lat.toFixed(5)},${last.lng.toFixed(5)}`;
      if (lastFocusedWaypointRef.current !== focusKey) {
        lastFocusedWaypointRef.current = focusKey;
        map.easeTo({ center: [last.lng, last.lat], zoom: 13, duration: 700 });
      }
    }
  }, [waypoints, rider, route, followRoad]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const alive = new Set(peers.map((p) => p.userId));
    for (const [userId, marker] of peerMarkersRef.current) {
      if (!alive.has(userId)) {
        marker.remove();
        peerMarkersRef.current.delete(userId);
      }
    }

    for (const peer of peers) {
      let marker = peerMarkersRef.current.get(peer.userId);
      if (!marker) {
        const el = document.createElement('div');
        el.className = 'map-pin map-pin-peer';
        const label = document.createElement('span');
        label.className = 'map-pin-peer-label';
        label.textContent = peer.displayName.slice(0, 12);
        el.appendChild(label);
        marker = new Marker({ element: el, offset: [0, -4] })
          .setLngLat([peer.position.lng, peer.position.lat])
          .addTo(map);
        peerMarkersRef.current.set(peer.userId, marker);
      } else {
        marker.setLngLat([peer.position.lng, peer.position.lat]);
        const label = marker.getElement().querySelector('.map-pin-peer-label');
        if (label) label.textContent = peer.displayName.slice(0, 12);
      }
    }
  }, [peers]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      ensureRouteOverlay(map);
      const source = map.getSource('route') as GeoJSONSource | undefined;
      if (!source) return;

      if (!route && routeAlternatives.length === 0) {
        source.setData({ type: 'FeatureCollection', features: [] });
        return;
      }

      let features: Array<{
        type: 'Feature';
        properties: { index: number; selected: number; traveled: number; color: string };
        geometry: RouteResult['geometry'];
      }>;

      if (followRoad && route && rider) {
        const color = routeAltColor(selectedAlternativeIndex);
        const split = splitRouteAtDistance(route.samples, distanceMeters);
        features = [
          {
            type: 'Feature' as const,
            properties: { index: 0, selected: 1, traveled: 1, color },
            geometry: split.traveled,
          },
          {
            type: 'Feature' as const,
            properties: { index: 0, selected: 1, traveled: 0, color },
            geometry: split.remaining,
          },
        ].filter((f) => f.geometry.coordinates.length >= 2);
      } else {
        let alts: Array<{ geometry: RouteResult['geometry'] }>;
        if (followRoad && route) {
          alts = [route];
        } else if (routeAlternatives.length > 0) {
          alts = routeAlternatives;
        } else if (route) {
          alts = [route];
        } else {
          source.setData({ type: 'FeatureCollection', features: [] });
          return;
        }

        features = alts.map((alt, index) => {
          const isSelected = showAlternatives
            ? index === selectedAlternativeIndex
            : true;
          const colorIndex = showAlternatives ? index : index;
          return {
            type: 'Feature' as const,
            properties: {
              index,
              selected: isSelected ? 1 : 0,
              traveled: 0,
              color: routeAltColor(colorIndex),
            },
            geometry: alt.geometry,
          };
        });

        // Draw unselected first so selected paints on top within filter layers.
        features.sort((a, b) => a.properties.selected - b.properties.selected);
      }

      source.setData({
        type: 'FeatureCollection',
        features,
      });

      // Overview fit only when not in follow-road ride camera.
      if (followRoad) return;

      const bounds = new LngLatBounds();
      for (const feature of features) {
        for (const [lng, lat] of feature.geometry.coordinates) {
          bounds.extend([lng, lat]);
        }
      }
      if (!bounds.isEmpty()) {
        map.easeTo({ pitch: 0, bearing: 0, duration: 400 });
        map.fitBounds(bounds, { padding: 72, maxZoom: 14, duration: 800 });
      }
    };

    if (map.isStyleLoaded()) apply();
    else map.once('load', apply);
    map.on('style.load', apply);
    return () => {
      map.off('style.load', apply);
    };
  }, [
    route,
    routeAlternatives,
    selectedAlternativeIndex,
    showAlternatives,
    followRoad,
    styleId,
    rider,
    distanceMeters,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !rider || !route) return;

    const targetBearing = bearingAlongRoute(route.samples, distanceMeters);
    const nextBearing = lerpBearing(bearingRef.current, targetBearing, 0.28);
    bearingRef.current = nextBearing;

    // In follow-road ride view the camera itself rotates to face travel
    // direction (bearing below), so "up" on screen already means "forward" —
    // the cone stays pointed up. In the flat overview the map stays
    // north-up, so the cone rotates to show true travel direction.
    if (riderHeadingElRef.current) {
      riderHeadingElRef.current.style.transform = `rotate(${followRoad ? 0 : nextBearing}deg)`;
    }

    if (!followRoad) return;

    const grade = gradeAtDistance(route.samples, distanceMeters);
    const pitch = Math.min(RIDE_MAX_PITCH, RIDE_BASE_PITCH + climbPitchBoost(grade));
    const zoom = RIDE_BASE_ZOOM + climbZoomBoost(grade) - speedZoomOut(speedKmh);
    // Center a bit ahead of the rider (not on top of them) so the avatar
    // sits low in frame with open road ahead — a chase camera, not a dot
    // riding under a fixed crosshair.
    const lookAhead = destinationPoint(rider, nextBearing, RIDE_LOOK_AHEAD_METERS);

    map.easeTo({
      center: [lookAhead.lng, lookAhead.lat],
      zoom,
      pitch,
      bearing: nextBearing,
      duration: ridePhase === 'paused' ? 0 : 320,
      essential: true,
    });
  }, [rider, route, distanceMeters, followRoad, ridePhase, speedKmh]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || followRoad) return;
    if (ridePhase === 'ready' || ridePhase === 'finished' || ridePhase === 'idle') {
      map.easeTo({ pitch: 0, bearing: 0, duration: 600 });
      bearingRef.current = 0;
    }
  }, [followRoad, ridePhase]);

  return (
    <div
      className={`route-map ${activePickMode ? 'route-map-picking' : ''} ${
        followRoad ? 'route-map-follow' : ''
      } ${!pickingEnabled ? 'route-map-locked' : ''}`}
    >
      <div ref={containerRef} className="route-map-canvas" style={{ width: '100%', height: '100%', minHeight: '200px' }} />
      {mapError && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', background: 'rgba(8,10,15,0.85)',
          color: '#ff9f0a', padding: '24px', textAlign: 'center', fontSize: '0.85rem', zIndex: 10
        }}>
          <span style={{ fontSize: '2rem', marginBottom: '12px' }}>🗺️</span>
          <strong>Map failed to load</strong>
          <p style={{ opacity: 0.7, marginTop: '8px', wordBreak: 'break-all' }}>{mapError}</p>
          <button
            type="button"
            style={{ marginTop: '16px', padding: '8px 20px', borderRadius: '8px', background: '#00f0ff', color: '#000', border: 'none', cursor: 'pointer', fontWeight: 700 }}
            onClick={() => { setMapError(null); mapRef.current?.remove(); mapRef.current = null; appliedStyleIdRef.current = null; }}
          >Retry</button>
        </div>
      )}
      {showStylePicker && (
        <MapStylePicker styleId={styleId} onChange={setStyleId} />
      )}
      {!pickingEnabled && !followRoad && (
        <div className="map-pick-banner map-lock-banner">{t('map.lockedBanner')}</div>
      )}
      {activePickMode && nextWaypointLabel && (
        <div className="map-pick-banner">
          {t('map.pickBanner', { point: nextWaypointLabel })}
        </div>
      )}
      {followRoad && (
        <div className="map-follow-banner" role="status">
          {t('map.followBanner')}
          {groupMode ? t('map.followGroup') : ''}
        </div>
      )}
    </div>
  );
}
