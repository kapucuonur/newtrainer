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
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { useEffect, useRef, useState } from 'react';
import { useT } from '../i18n';
import type { RidePhase } from '../simulation/rideEngine';
import { routeAltColor } from '../routing/osrm';
import type { EnrichedRoute, LatLng, RouteResult } from '../routing/types';
import { waypointLabel } from '../routing/waypoints';
import { bearingAlongRoute, lerpBearing } from './bearing';
import { hasMapillaryToken } from './mapillary';
import { sanitizeMapStyle } from './sanitizeMapStyle';
import { StreetViewPanel } from './StreetViewPanel';
import 'maplibre-gl/dist/maplibre-gl.css';

// Vite bundles the worker (+ shared deps) into /assets/*; without this, MapLibre
// resolves a sibling maplibre-gl-worker.mjs that never exists in production.
setWorkerUrl(maplibreWorkerUrl);

/** Colorful OpenFreeMap Liberty (free, no API key). Override with VITE_MAP_STYLE_URL. */
const STYLE_URL =
  import.meta.env.VITE_MAP_STYLE_URL ??
  'https://tiles.openfreemap.org/styles/liberty';

async function loadMapStyle(): Promise<string | StyleSpecification> {
  try {
    const res = await fetch(STYLE_URL);
    if (!res.ok) return STYLE_URL;
    const json: unknown = await res.json();
    if (!json || typeof json !== 'object') return STYLE_URL;
    return sanitizeMapStyle(json as StyleSpecification);
  } catch {
    return STYLE_URL;
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
  /** Group mode: colored map + peers only — no Mapillary / street view. */
  groupMode?: boolean;
};

function pinClassForIndex(index: number, total: number): string {
  if (index === 0) return 'map-pin-a';
  if (index === total - 1 && total > 1) return 'map-pin-b';
  return 'map-pin-via';
}

function tryEnable3dBuildings(map: Map): void {
  if (map.getLayer('roadlab-3d-buildings')) return;

  const style = map.getStyle();
  const sources = style?.sources ?? {};
  const sourceId = Object.keys(sources).find((id) => {
    const src = sources[id];
    return src.type === 'vector';
  });
  if (!sourceId) return;

  // Prefer hiding flat building fills so extrusion is visible.
  for (const layer of style?.layers ?? []) {
    if (
      layer.type === 'fill' &&
      'source-layer' in layer &&
      layer['source-layer'] === 'building'
    ) {
      try {
        map.setLayoutProperty(layer.id, 'visibility', 'none');
      } catch {
        // Style variants may lock layout; ignore.
      }
    }
  }

  try {
    map.addLayer({
      id: 'roadlab-3d-buildings',
      source: sourceId,
      'source-layer': 'building',
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
          ['coalesce', ['get', 'render_height'], ['get', 'height'], 12],
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
  const [heading, setHeading] = useState(0);

  const followRoad = ridePhase === 'riding' || ridePhase === 'paused';
  const activePickMode = pickingEnabled && pickMode;
  const streetViewEnabled = followRoad && !groupMode;
  const showAlternatives = !followRoad && routeAlternatives.length > 1;

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
    if (!containerRef.current || mapRef.current) return;

    let cancelled = false;
    let map: Map | null = null;
    let resizeObserver: ResizeObserver | null = null;
    const container = containerRef.current;

    void (async () => {
      const style = await loadMapStyle();
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
      });

      if (cancelled) {
        map.remove();
        map = null;
        return;
      }

      const activeMap = map;

      activeMap.addControl(new NavigationControl({ visualizePitch: true }), 'top-right');
      activeMap.addControl(new ScaleControl({ unit: 'metric' }));

      activeMap.on('click', (e: { lngLat: { lat: number; lng: number } }) => {
        if (!pickingEnabledRef.current || !pickModeRef.current) return;
        onPickRef.current({ lat: e.lngLat.lat, lng: e.lngLat.lng });
      });

      activeMap.on('load', () => {
        activeMap.addSource('route', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
        activeMap.addLayer({
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
        activeMap.addLayer({
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
        activeMap.addLayer({
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
        activeMap.addLayer({
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

        tryEnable3dBuildings(activeMap);
      });

      activeMap.on('style.load', () => {
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
    })();

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      for (const marker of waypointMarkersRef.current) marker.remove();
      waypointMarkersRef.current = [];
      markerRider.current?.remove();
      for (const marker of peerMarkersRef.current.values()) marker.remove();
      peerMarkersRef.current.clear();
      map?.remove();
      mapRef.current = null;
    };
  }, []);

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
  }, [
    route,
    routeAlternatives,
    selectedAlternativeIndex,
    showAlternatives,
    followRoad,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !rider || !route || !followRoad) return;

    const targetBearing = bearingAlongRoute(route.samples, distanceMeters);
    const nextBearing = lerpBearing(bearingRef.current, targetBearing, 0.28);
    bearingRef.current = nextBearing;
    setHeading(nextBearing);

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
      setHeading(0);
    }
  }, [followRoad, ridePhase]);

  return (
    <div
      className={`route-map ${activePickMode ? 'route-map-picking' : ''} ${
        followRoad ? 'route-map-follow' : ''
      } ${!pickingEnabled ? 'route-map-locked' : ''}`}
    >
      <div ref={containerRef} className="route-map-canvas" />
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
          {groupMode
            ? t('map.followGroup')
            : hasMapillaryToken()
              ? t('map.followMapillary')
              : ''}
        </div>
      )}
      <StreetViewPanel
        enabled={streetViewEnabled}
        position={rider}
        heading={heading}
      />
    </div>
  );
}
