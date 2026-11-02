import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
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
/** Widest slice of a 360° panorama shown across the screen; narrower on tall screens. */
const PANO_MAX_FOV_DEG = 100;

type Size = { w: number; h: number };

/**
 * Crops an equirectangular panorama so the direction of travel sits at the
 * centre of the view: the image is scaled to cover the pane at <= 100° of
 * horizontal field of view and shifted so `headingDeg` is centred (Mapillary
 * puts the panorama's compass angle at its centre column).
 */
function panoStyle(frame: StreetFrame, size: Size): CSSProperties {
  const bgW = Math.max(2 * size.h, (size.w * 360) / PANO_MAX_FOV_DEG);
  const bgH = bgW / 2;
  const offset = (frame.headingDeg - frame.image.compassAngle) / 360;
  const frac = (((0.5 + offset) % 1) + 1) % 1;
  return {
    backgroundImage: `url(${JSON.stringify(frame.image.thumbUrl)})`,
    backgroundSize: `${bgW}px ${bgH}px`,
    backgroundPosition: `${size.w / 2 - frac * bgW}px ${(size.h - bgH) / 2}px`,
    backgroundRepeat: 'repeat-x',
  };
}

/**
 * Street-level ride view: shows the Mapillary photo for the rider's position,
 * cross-fading (with a slight push-in for a sense of motion) as they advance.
 */
export function StreetViewPane({ frames, status, distanceMeters, totalMeters, pipMapNode }: Props) {
  const t = useT();
  const frame = frameAtDistance(frames, distanceMeters);
  // Keep the previous photo underneath so the new one fades in over it.
  const [layers, setLayers] = useState<StreetFrame[]>([]);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<Size>({ w: 0, h: 0 });

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

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
      <div ref={stageRef} className={`street-view-stage ${frame ? '' : 'street-view-stage-dim'}`}>
        {layers.map((layer) =>
          layer.image.isPano ? (
            <div
              key={layer.image.id}
              className="street-view-photo"
              style={size.w > 0 ? panoStyle(layer, size) : undefined}
            />
          ) : (
            <img
              key={layer.image.id}
              className="street-view-photo"
              src={layer.image.thumbUrl}
              alt=""
              draggable={false}
            />
          ),
        )}
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
