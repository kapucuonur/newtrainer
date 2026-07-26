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
import type { RidePhase } from '../simulation/rideEngine';
import type { EnrichedRoute, LatLng } from '../routing/types';
import { bearingAlongRoute, lerpBearing } from './bearing';
import { hasGoogleStreetViewKey, StreetViewPanel } from './StreetViewPanel';
import 'maplibre-gl/dist/maplibre-gl.css';

// Vite bundles the worker (+ shared deps) into /assets/*; without this, MapLibre
// resolves a sibling maplibre-gl-worker.mjs that never exists in production.
setWorkerUrl(maplibreWorkerUrl);

/** Colorful OpenFreeMap Liberty (free, no API key). Override with VITE_MAP_STYLE_URL. */
const STYLE_URL =
  import.meta.env.VITE_MAP_STYLE_URL ??
  'https://tiles.openfreemap.org/styles/liberty';

type Props = {
  pointA: LatLng | null;
  pointB: LatLng | null;
  route: EnrichedRoute | null;
  rider: LatLng | null;
  ridePhase: RidePhase;
  distanceMeters: number;
  onPick: (point: LatLng) => void;
  pickMode: 'A' | 'B' | null;
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
  rider,
  ridePhase,
  distanceMeters,
  onPick,
  pickMode,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const markerA = useRef<Marker | null>(null);
  const markerB = useRef<Marker | null>(null);
  const markerRider = useRef<Marker | null>(null);
  const onPickRef = useRef(onPick);
  const pickModeRef = useRef(pickMode);
  const bearingRef = useRef(0);
  const [heading, setHeading] = useState(0);

  const followRoad = ridePhase === 'riding' || ridePhase === 'paused';

  useEffect(() => {
    onPickRef.current = onPick;
  }, [onPick]);

  useEffect(() => {
    pickModeRef.current = pickMode;
  }, [pickMode]);

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
      if (!pickModeRef.current) return;
      onPickRef.current({ lat: e.lngLat.lat, lng: e.lngLat.lng });
    });

    map.on('load', () => {
      map.addSource('route', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'route-glow',
        type: 'line',
        source: 'route',
        paint: {
          'line-color': '#0b6e99',
          'line-width': 12,
          'line-opacity': 0.35,
          'line-blur': 1.5,
        },
      });
      map.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#1aa3d9',
          'line-width': 5,
        },
      });
      tryEnable3dBuildings(map);
    });

    map.on('style.load', () => {
      tryEnable3dBuildings(map);
    });

    mapRef.current = map;
    return () => {
      markerA.current?.remove();
      markerB.current?.remove();
      markerRider.current?.remove();
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

    syncMarker(markerA, pointA, 'map-pin-a', 'A');
    syncMarker(markerB, pointB, 'map-pin-b', 'B');
    syncMarker(markerRider, rider, 'map-pin-rider', '●');
  }, [pointA, pointB, rider]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      const source = map.getSource('route') as GeoJSONSource | undefined;
      if (!source || !route) {
        source?.setData({ type: 'FeatureCollection', features: [] });
        return;
      }

      source.setData({
        type: 'Feature',
        properties: {},
        geometry: route.geometry,
      });

      // Overview fit only when not in follow-road ride camera.
      if (followRoad) return;

      const bounds = new LngLatBounds();
      for (const [lng, lat] of route.geometry.coordinates) {
        bounds.extend([lng, lat]);
      }
      if (!bounds.isEmpty()) {
        map.easeTo({ pitch: 0, bearing: 0, duration: 400 });
        map.fitBounds(bounds, { padding: 72, maxZoom: 14, duration: 800 });
      }
    };

    if (map.isStyleLoaded()) apply();
    else map.once('load', apply);
  }, [route, followRoad]);

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
      className={`route-map ${pickMode ? 'route-map-picking' : ''} ${
        followRoad ? 'route-map-follow' : ''
      }`}
    >
      <div ref={containerRef} className="route-map-canvas" />
      {pickMode && (
        <div className="map-pick-banner">
          Tap the map to set point {pickMode}
        </div>
      )}
      {followRoad && (
        <div className="map-follow-banner" role="status">
          Follow road · 3D ride camera
          {hasGoogleStreetViewKey() ? ' · Street View on' : ''}
        </div>
      )}
      <StreetViewPanel
        enabled={followRoad}
        position={rider}
        heading={heading}
      />
    </div>
  );
}
