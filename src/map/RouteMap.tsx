import {
  GeoJSONSource,
  LngLatBounds,
  Map,
  Marker,
  NavigationControl,
  ScaleControl,
  setWorkerUrl,
} from 'maplibre-gl';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { useT } from '../i18n';
import type { RidePhase } from '../simulation/rideEngine';
import { routeAltColor } from '../routing/osrm';
import type { EnrichedRoute, LatLng, RouteResult } from '../routing/types';
import { bearingAlongRoute, lerpBearing } from './bearing';
import { hasMapillaryToken } from './mapillary';
import { StreetViewPanel } from './StreetViewPanel';
import 'maplibre-gl/dist/maplibre-gl.css';

// Vite bundles the worker (+ shared deps) into /assets/*; without this, MapLibre
// resolves a sibling maplibre-gl-worker.mjs that never exists in production.
setWorkerUrl(maplibreWorkerUrl);

/** Colorful OpenFreeMap Liberty (free, no API key). Override with VITE_MAP_STYLE_URL. */
const STYLE_URL =
  import.meta.env.VITE_MAP_STYLE_URL ??
  'https://tiles.openfreemap.org/styles/liberty';

export type MapPeer = {
  userId: number;
  displayName: string;
  position: LatLng;
};

type Props = {
  pointA: LatLng | null;
  pointB: LatLng | null;
  route: EnrichedRoute | null;
  /** OSRM alternatives shown faded until selected (planning only). */
  routeAlternatives?: RouteResult[];
  selectedAlternativeIndex?: number;
  onSelectAlternative?: (index: number) => void;
  rider: LatLng | null;
  ridePhase: RidePhase;
  distanceMeters: number;
  onPick: (point: LatLng) => void;
  pickMode: 'A' | 'B' | null;
  pickingEnabled?: boolean;
  /** Other riders on the shared route (group rides). */
  peers?: MapPeer[];
  /** Group mode: colored map + peers only — no Mapillary / street view. */
  groupMode?: boolean;
};

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
  pointA,
  pointB,
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
  const markerA = useRef<Marker | null>(null);
  const markerB = useRef<Marker | null>(null);
  const markerRider = useRef<Marker | null>(null);
  const peerMarkersRef = useRef(new globalThis.Map<number, Marker>());
  const onPickRef = useRef(onPick);
  const pickModeRef = useRef(pickMode);
  const pickingEnabledRef = useRef(pickingEnabled);
  const onSelectAlternativeRef = useRef(onSelectAlternative);
  const bearingRef = useRef(0);
  const [heading, setHeading] = useState(0);

  const followRoad = ridePhase === 'riding' || ridePhase === 'paused';
  const activePickMode = pickingEnabled ? pickMode : null;
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

    const map = new Map({
      container: containerRef.current,
      style: STYLE_URL,
      center: [28.9784, 41.0082],
      zoom: 11,
      pitch: 0,
      bearing: 0,
      maxPitch: 70,
      attributionControl: { compact: true },
    });

    map.addControl(new NavigationControl({ visualizePitch: true }), 'top-right');
    map.addControl(new ScaleControl({ unit: 'metric' }));

    map.on('click', (e: { lngLat: { lat: number; lng: number } }) => {
      if (!pickingEnabledRef.current || !pickModeRef.current) return;
      onPickRef.current({ lat: e.lngLat.lat, lng: e.lngLat.lng });
    });

    map.on('load', () => {
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

      const onAltClick = (e: { features?: Array<{ properties?: { index?: number } }> }) => {
        const idx = e.features?.[0]?.properties?.index;
        if (typeof idx === 'number' && Number.isFinite(idx)) {
          onSelectAlternativeRef.current?.(idx);
        }
      };
      map.on('click', 'route-alt-hit', onAltClick);
      map.on('click', 'route-alt-line', onAltClick);
      map.on('mouseenter', 'route-alt-hit', () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', 'route-alt-hit', () => {
        map.getCanvas().style.cursor = '';
      });

      tryEnable3dBuildings(map);
    });

    map.on('style.load', () => {
      tryEnable3dBuildings(map);
    });

    mapRef.current = map;

    const container = containerRef.current;
    const resizeObserver =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            map.resize();
          })
        : null;
    resizeObserver?.observe(container);

    return () => {
      resizeObserver?.disconnect();
      markerA.current?.remove();
      markerB.current?.remove();
      markerRider.current?.remove();
      for (const marker of peerMarkersRef.current.values()) marker.remove();
      peerMarkersRef.current.clear();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const syncMarker = (
      ref: MutableRefObject<Marker | null>,
      point: LatLng | null,
      className: string,
      label: string,
    ) => {
      if (!point) {
        ref.current?.remove();
        ref.current = null;
        return;
      }
      if (!ref.current) {
        const el = document.createElement('div');
        el.className = `map-pin ${className}`;
        el.textContent = label;
        ref.current = new Marker({ element: el })
          .setLngLat([point.lng, point.lat])
          .addTo(map);
      } else {
        ref.current.setLngLat([point.lng, point.lat]);
      }
    };

    syncMarker(markerA, pointA, 'map-pin-a', 'A START');
    syncMarker(markerB, pointB, 'map-pin-b', 'B FINISH');
    syncMarker(markerRider, rider, 'map-pin-rider', '🚴');

    if (pointA && !route) {
      map.easeTo({ center: [pointA.lng, pointA.lat], zoom: 13, duration: 700 });
    } else if (pointB && !route) {
      map.easeTo({ center: [pointB.lng, pointB.lat], zoom: 13, duration: 700 });
    }
  }, [pointA, pointB, rider, route]);

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
      {activePickMode && (
        <div className="map-pick-banner">
          {t('map.pickBanner', { point: activePickMode })}
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
