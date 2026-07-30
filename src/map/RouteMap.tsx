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
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { useEffect, useRef, useState } from 'react';
import { useT } from '../i18n';
import type { RidePhase } from '../simulation/rideEngine';
import { routeAltColor } from '../routing/osrm';
import type { EnrichedRoute, LatLng, RouteResult } from '../routing/types';
import { waypointLabel } from '../routing/waypoints';
import { bearingAlongRoute, lerpBearing } from './bearing';
import { MapStylePicker } from '../ui/MapStylePicker';
import {
  loadStoredMapStyleId,
  resolveStyleUrl,
  storeMapStyleId,
  type MapStyleId,
} from './mapStyles';
import { sanitizeMapStyle } from './sanitizeMapStyle';
import 'maplibre-gl/dist/maplibre-gl.css';

// Vite bundles the worker (+ shared deps) into /assets/*; without this, MapLibre
// resolves a sibling maplibre-gl-worker.mjs that never exists in production.
setWorkerUrl(maplibreWorkerUrl);

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
      minzoom: 14,
      paint: {
        'fill-extrusion-color': '#c4ccd6',
        'fill-extrusion-opacity': 0.72,
        'fill-extrusion-height': [
          'interpolate',
          ['linear'],
          ['zoom'],
          14,
          0,
          14.5,
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
    id: 'route-glow',
    type: 'line',
    source: 'route',
    filter: ['==', ['get', 'selected'], 1],
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
    filter: ['==', ['get', 'selected'], 1],
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
        maxPitch: 70,
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
        wireRouteClicks();
        tryEnable3dBuildings(activeMap);
      });

      activeMap.on('style.load', () => {
        ensureRouteOverlay(activeMap);
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
        marker = new Marker({ element: el })
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
      const el = document.createElement('div');
      el.className = 'map-pin map-pin-rider';
      el.textContent = '🚴';
      markerRider.current = new Marker({ element: el })
        .setLngLat([rider.lng, rider.lat])
        .addTo(map);
    } else if (markerRider.current && rider) {
      markerRider.current.setLngLat([rider.lng, rider.lat]);
    } else if (markerRider.current && !rider) {
      markerRider.current.remove();
      markerRider.current = null;
    }

    if (!route && waypoints.length > 0) {
      const last = waypoints[waypoints.length - 1];
      const focusKey = `${waypoints.length}:${last.lat.toFixed(5)},${last.lng.toFixed(5)}`;
      if (lastFocusedWaypointRef.current !== focusKey) {
        lastFocusedWaypointRef.current = focusKey;
        map.easeTo({ center: [last.lng, last.lat], zoom: 13, duration: 700 });
      }
    }
  }, [waypoints, rider, route]);

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

      const features = alts.map((alt, index) => {
        const isSelected = showAlternatives
          ? index === selectedAlternativeIndex
          : true;
        const colorIndex = showAlternatives
          ? index
          : followRoad
            ? selectedAlternativeIndex
            : index;
        return {
          type: 'Feature' as const,
          properties: {
            index,
            selected: isSelected ? 1 : 0,
            color: routeAltColor(colorIndex),
          },
          geometry: alt.geometry,
        };
      });

      // Draw unselected first so selected paints on top within filter layers.
      features.sort((a, b) => a.properties.selected - b.properties.selected);

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
  ]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !rider || !route || !followRoad) return;

    const targetBearing = bearingAlongRoute(route.samples, distanceMeters);
    const nextBearing = lerpBearing(bearingRef.current, targetBearing, 0.28);
    bearingRef.current = nextBearing;

    map.easeTo({
      center: [rider.lng, rider.lat],
      zoom: Math.max(map.getZoom(), 16.2),
      pitch: 62,
      bearing: nextBearing,
      duration: ridePhase === 'paused' ? 0 : 320,
      essential: true,
    });
  }, [rider, route, distanceMeters, followRoad, ridePhase]);

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
