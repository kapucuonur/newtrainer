import { useEffect, useRef, useState } from 'react';
import { useT } from '../i18n';
import type { LatLng } from '../routing/types';
import {
  hasMapillaryToken,
  MapillaryNearestClient,
  type MapillaryImage,
} from './mapillary';

type Props = {
  enabled: boolean;
  position: LatLng | null;
  heading: number;
};

type PanelStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'error';

/**
 * Free Mapillary street-level panel along the ride.
 * Requires VITE_MAPILLARY_ACCESS_TOKEN. Without a token this renders nothing
 * (MapLibre follow-road camera stays primary).
 */
export function StreetViewPanel({ enabled, position, heading }: Props) {
  const t = useT();
  const clientRef = useRef(new MapillaryNearestClient());
  const hasImageRef = useRef(false);
  const [image, setImage] = useState<MapillaryImage | null>(null);
  const [status, setStatus] = useState<PanelStatus>('idle');
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    if (!enabled) {
      clientRef.current.reset();
      hasImageRef.current = false;
      setImage(null);
      setStatus('idle');
      setImgFailed(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!hasMapillaryToken() || !enabled || !position) return;

    let cancelled = false;
    if (!hasImageRef.current) setStatus('loading');

    void clientRef.current
      .lookup(position)
      .then(({ image: next, unchanged }) => {
        if (cancelled || unchanged) return;
        hasImageRef.current = Boolean(next);
        setImage(next);
        setImgFailed(false);
        setStatus(next ? 'ready' : 'empty');
      })
      .catch(() => {
        if (cancelled) return;
        if (!hasImageRef.current) setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, position]);

  if (!hasMapillaryToken() || !enabled) return null;

  const compass = image?.compassAngle;
  const showImage = status === 'ready' && image && !imgFailed;

  return (
    <aside className="street-view-panel" aria-label={t('street.aria')}>
      <div className="street-view-label">{t('street.label')}</div>
      {typeof compass === 'number' && (
        <div
          className="street-view-compass"
          title={t('street.compass', {
            capture: Math.round(compass),
            ride: Math.round(heading),
          })}
          aria-hidden
        >
          <span
            className="street-view-compass-needle"
            style={{ transform: `rotate(${compass}deg)` }}
          />
        </div>
      )}
      {showImage ? (
        <img
          key={image.id}
          src={image.thumbUrl}
          alt={t('street.alt')}
          className="street-view-image"
          onError={() => setImgFailed(true)}
        />
      ) : (
        <div className="street-view-fallback" role="status">
          {status === 'empty' || imgFailed
            ? t('street.empty')
            : status === 'error'
              ? t('street.error')
              : t('street.loading')}
        </div>
      )}
      <div className="street-view-attribution">
        ©{' '}
        <a
          href="https://www.mapillary.com/"
          target="_blank"
          rel="noreferrer"
        >
          Mapillary
        </a>{' '}
        · CC BY-SA
      </div>
    </aside>
  );
}
