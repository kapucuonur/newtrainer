import { useEffect, useState, type ReactNode } from 'react';
import { MapPin } from 'lucide-react';
import { useT } from '../i18n';
import { frameAtDistance, streetCoverage, type StreetFrame } from '../streetview/pickFrames';

export type StreetViewStatus = 'loading' | 'ready' | 'error';

type Props = {
  frames: StreetFrame[];
  status: StreetViewStatus;
  distanceMeters: number;
  totalMeters: number;
  pipMapNode?: ReactNode;
};

const PRELOAD_AHEAD = 3;

/**
 * Street-level ride view: shows the Mapillary photo for the rider's position,
 * cross-fading (with a slight push-in for a sense of motion) as they advance.
 */
export function StreetViewPane({ frames, status, distanceMeters, totalMeters, pipMapNode }: Props) {
  const t = useT();
  const frame = frameAtDistance(frames, distanceMeters);
  // Keep the previous photo underneath so the new one fades in over it.
  const [layers, setLayers] = useState<StreetFrame[]>([]);

  useEffect(() => {
    if (!frame) return;
    setLayers((prev) =>
      prev[prev.length - 1]?.image.id === frame.image.id ? prev : [...prev.slice(-1), frame],
    );
  }, [frame]);

  useEffect(() => {
    if (!frame) return;
    const index = frames.indexOf(frame);
    for (const next of frames.slice(index + 1, index + 1 + PRELOAD_AHEAD)) {
      const img = new Image();
      img.src = next.image.thumbUrl;
    }
  }, [frame, frames]);

  const coveragePct = Math.round(streetCoverage(frames, totalMeters) * 100);
  const current = layers[layers.length - 1];
  const message =
    status === 'loading'
      ? t('street.loading')
      : status === 'error'
        ? t('street.error')
        : !frame
          ? t('street.noCoverage')
          : null;

  return (
    <div className="street-view">
      <div className={`street-view-stage ${frame ? '' : 'street-view-stage-dim'}`}>
        {layers.map((layer) => (
          <img
            key={layer.image.id}
            className="street-view-photo"
            src={layer.image.thumbUrl}
            alt=""
            draggable={false}
          />
        ))}
      </div>

      {message && (
        <div className="street-view-message" role="status">
          {message}
        </div>
      )}

      {status === 'ready' && (
        <div className="street-view-coverage">{t('street.coverage', { pct: coveragePct })}</div>
      )}

      {current && (
        <a
          className="street-view-attribution"
          href={`https://www.mapillary.com/app/?pKey=${encodeURIComponent(current.image.id)}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          {current.image.creator ? `© ${current.image.creator} · ` : ''}Mapillary · CC BY-SA
        </a>
      )}

      {pipMapNode && (
        <div className="rouvy-pip-map rouvy-pip-open street-view-pip">
          <div className="rouvy-pip-header">
            <span className="rouvy-pip-title">
              <MapPin className="icon-xs" aria-hidden="true" /> {t('street.map')}
            </span>
          </div>
          <div className="rouvy-pip-content">{pipMapNode}</div>
        </div>
      )}
    </div>
  );
}
