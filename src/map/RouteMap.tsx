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
import { useEffect, useRef, type MutableRefObject } from 'react';
import type { EnrichedRoute, LatLng } from '../routing/types';
import 'maplibre-gl/dist/maplibre-gl.css';

// Vite bundles the worker (+ shared deps) into /assets/*; without this, MapLibre
// resolves a sibling maplibre-gl-worker.mjs that never exists in production.
setWorkerUrl(maplibreWorkerUrl);

const STYLE_URL =
  import.meta.env.VITE_MAP_STYLE_URL ??
  'https://tiles.openfreemap.org/styles/dark';

type Props = {
  pointA: LatLng | null;
  pointB: LatLng | null;
  route: EnrichedRoute | null;
  rider: LatLng | null;
  onPick: (point: LatLng) => void;
  pickMode: 'A' | 'B' | null;
};

export function RouteMap({
  pointA,
  pointB,
  route,
  rider,
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
          'line-color': '#2ec4ff',
          'line-width': 12,
          'line-opacity': 0.28,
          'line-blur': 1.5,
        },
      });
      map.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#5ee1ff',
          'line-width': 4,
        },
      });
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

      const bounds = new LngLatBounds();
      for (const [lng, lat] of route.geometry.coordinates) {
        bounds.extend([lng, lat]);
      }
      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, { padding: 72, maxZoom: 14, duration: 800 });
      }
    };

    if (map.isStyleLoaded()) apply();
    else map.once('load', apply);
  }, [route]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !rider || !route) return;
    map.easeTo({
      center: [rider.lng, rider.lat],
      duration: 280,
      essential: true,
    });
  }, [rider, route]);

  return (
    <div className={`route-map ${pickMode ? 'route-map-picking' : ''}`}>
      <div ref={containerRef} className="route-map-canvas" />
      {pickMode && (
        <div className="map-pick-banner">
          Tap the map to set point {pickMode}
        </div>
      )}
    </div>
  );
}
