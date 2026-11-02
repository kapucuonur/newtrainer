import { useEffect, useRef, useState } from 'react';
import { useT } from '../i18n';
import type { RoutePoint } from '../routing/types';
import {
  loadGoogleStreetView,
  type GoogleStreetViewPanorama,
} from '../streetview/googleMaps';
import { routePoseAtDistance } from '../streetview/pickFrames';

type Props = {
  apiKey: string;
  samples: RoutePoint[];
  distanceMeters: number;
  /** Load or key failure — the caller falls back to the map view. */
  onUnavailable: () => void;
};

/** Move the panorama only after this much travel — fewer pano loads, steadier view. */
const MOVE_EVERY_METERS = 10;

/**
 * Street-level ride view from Google Street View. One panorama object for the
 * whole ride (billed once), moved along the route and turned to face the
 * direction of travel; Google draws its own logo and imagery credits.
 */
export function GoogleStreetViewPane({ apiKey, samples, distanceMeters, onUnavailable }: Props) {
  const t = useT();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const panoramaRef = useRef<GoogleStreetViewPanorama | null>(null);
  const lastMovedAtRef = useRef(-Infinity);
  const [loading, setLoading] = useState(true);
  const [noImageryHere, setNoImageryHere] = useState(false);
  const onUnavailableRef = useRef(onUnavailable);
  useEffect(() => {
    onUnavailableRef.current = onUnavailable;
  }, [onUnavailable]);
  const startDistanceRef = useRef(distanceMeters);

  useEffect(() => {
    const container = containerRef.current;
    const start = routePoseAtDistance(samples, startDistanceRef.current);
    if (!container || !start) return;
    let cancelled = false;
    let statusListener: { remove(): void } | null = null;

    loadGoogleStreetView(apiKey)
      .then(({ StreetViewPanorama }) => {
        if (cancelled) return;
        const panorama = new StreetViewPanorama(container, {
          position: { lat: start.lat, lng: start.lng },
          pov: { heading: start.headingDeg, pitch: 0 },
          disableDefaultUI: true,
          clickToGo: false,
          linksControl: false,
          addressControl: false,
          showRoadLabels: false,
          motionTracking: false,
          motionTrackingControl: false,
          scrollwheel: false,
          disableDoubleClickZoom: true,
        });
        statusListener = panorama.addListener('status_changed', () => {
          setNoImageryHere(panorama.getStatus() !== 'OK');
        });
        panoramaRef.current = panorama;
        lastMovedAtRef.current = startDistanceRef.current;
        setLoading(false);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        console.warn('[street-view] Google Street View unavailable', error);
        onUnavailableRef.current();
      });

    return () => {
      cancelled = true;
      statusListener?.remove();
      panoramaRef.current = null;
    };
  }, [apiKey, samples]);

  useEffect(() => {
    const panorama = panoramaRef.current;
    if (!panorama || Math.abs(distanceMeters - lastMovedAtRef.current) < MOVE_EVERY_METERS) return;
    const pose = routePoseAtDistance(samples, distanceMeters);
    if (!pose) return;
    lastMovedAtRef.current = distanceMeters;
    panorama.setPosition({ lat: pose.lat, lng: pose.lng });
    panorama.setPov({ heading: pose.headingDeg, pitch: 0 });
  }, [distanceMeters, samples]);

  const message = loading ? t('street.loading') : noImageryHere ? t('street.noCoverage') : null;

  return (
    <div className="street-view">
      <div ref={containerRef} className="street-view-google" />
      {message && (
        <div className="street-view-message" role="status">
          {message}
        </div>
      )}
    </div>
  );
}
