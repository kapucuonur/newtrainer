import { useEffect, useMemo, useState } from 'react';
import type { LatLng } from '../routing/types';

type Props = {
  enabled: boolean;
  position: LatLng | null;
  heading: number;
};

const GOOGLE_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim() ?? '';

/**
 * Optional Google Street View Static panel.
 * Requires billing-enabled Maps API key via VITE_GOOGLE_MAPS_API_KEY.
 * Without a key this component renders nothing (free follow-camera stays primary).
 */
export function StreetViewPanel({ enabled, position, heading }: Props) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const nextUrl = useMemo(() => {
    if (!GOOGLE_KEY || !enabled || !position) return null;
    const params = new URLSearchParams({
      size: '640x360',
      location: `${position.lat.toFixed(6)},${position.lng.toFixed(6)}`,
      heading: String(Math.round(heading)),
      pitch: '0',
      fov: '85',
      source: 'outdoor',
      key: GOOGLE_KEY,
    });
    return `https://maps.googleapis.com/maps/api/streetview?${params}`;
  }, [enabled, position, heading]);

  useEffect(() => {
    if (!nextUrl) {
      setSrc(null);
      return;
    }
    const timer = window.setTimeout(() => {
      setSrc(nextUrl);
      setFailed(false);
    }, 700);
    return () => window.clearTimeout(timer);
  }, [nextUrl]);

  if (!GOOGLE_KEY || !enabled) return null;

  return (
    <aside className="street-view-panel" aria-label="Street View">
      <div className="street-view-label">Street View</div>
      {src && !failed ? (
        <img
          src={src}
          alt="Street-level view along the route"
          className="street-view-image"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="street-view-fallback">
          {failed
            ? 'No Street View coverage here (or API key / billing issue).'
            : 'Loading street imagery…'}
        </div>
      )}
    </aside>
  );
}

export function hasGoogleStreetViewKey(): boolean {
  return GOOGLE_KEY.length > 0;
}
