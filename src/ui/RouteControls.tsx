import type { EnrichedRoute, LatLng } from '../routing/types';
import type { RidePhase } from '../simulation/rideEngine';
import { useT } from '../i18n';
import { formatDistance, formatDuration } from './format';

type Props = {
  pointA: LatLng | null;
  pointB: LatLng | null;
  pickMode: 'A' | 'B' | null;
  route: EnrichedRoute | null;
  loading: boolean;
  error: string | null;
  phase: RidePhase;
  hasExport: boolean;
  completedDistanceMeters: number;
  completedElapsedSeconds: number;
  routePlanningEnabled: boolean;
  gateMessage: string | null;
  onOpenAccount: () => void;
  onSetPickMode: (mode: 'A' | 'B' | null) => void;
  onBuildRoute: () => void;
  onClear: () => void;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onDownloadFit: () => void;
  onDownloadGpx: () => void;
  /** When set, show “Save ride to profile” after finish. */
  canSaveToProfile?: boolean;
  saveBusy?: boolean;
  saveMessage?: string | null;
  onSaveToProfile?: () => void;
  /** Hide solo Start while waiting in a group lobby. */
  hideStart?: boolean;
};

export function RouteControls({
  pointA,
  pointB,
  pickMode,
  route,
  loading,
  error,
  phase,
  hasExport,
  completedDistanceMeters,
  completedElapsedSeconds,
  routePlanningEnabled,
  gateMessage,
  onOpenAccount,
  onSetPickMode,
  onBuildRoute,
  onClear,
  onStart,
  onPause,
  onResume,
  onStop,
  onDownloadFit,
  onDownloadGpx,
  canSaveToProfile = false,
  saveBusy = false,
  saveMessage = null,
  onSaveToProfile,
  hideStart = false,
}: Props) {
  const t = useT();
  const showComplete = phase === 'finished' && hasExport;
  const locked = !routePlanningEnabled;

  return (
    <section className="route-controls">
      <div className="route-controls-top">
        <div>
          <h2>{t('route.title')}</h2>
          <p>{t('route.subtitle')}</p>
        </div>
        <div className="btn-row">
          <button
            type="button"
            className={`btn ${pickMode === 'A' ? 'btn-primary' : 'btn-secondary'}`}
            disabled={locked}
            onClick={() => onSetPickMode(pickMode === 'A' ? null : 'A')}
          >
            {t('route.setA')}
          </button>
          <button
            type="button"
            className={`btn ${pickMode === 'B' ? 'btn-primary' : 'btn-secondary'}`}
            disabled={locked}
            onClick={() => onSetPickMode(pickMode === 'B' ? null : 'B')}
          >
            {t('route.setB')}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={locked || !pointA || !pointB || loading}
            onClick={onBuildRoute}
          >
            {loading ? t('route.building') : t('route.build')}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClear}>
            {t('route.clear')}
          </button>
        </div>
      </div>

      {gateMessage && (
        <div className="auth-gate-banner" role="status">
          <p>{gateMessage}</p>
          <button type="button" className="btn btn-accent" onClick={onOpenAccount}>
            {t('route.gateCta')}
          </button>
        </div>
      )}

      <div className="route-meta">
        <span>A: {pointA ? `${pointA.lat.toFixed(4)}, ${pointA.lng.toFixed(4)}` : '—'}</span>
        <span>B: {pointB ? `${pointB.lat.toFixed(4)}, ${pointB.lng.toFixed(4)}` : '—'}</span>
        {route && (
          <>
            <span>{formatDistance(route.distanceMeters)}</span>
            <span>~{formatDuration(route.durationSeconds)}</span>
            <span>
              ↑{route.elevGainMeters}m ↓{route.elevLossMeters}m
            </span>
            <span className="route-source">{route.source}</span>
          </>
        )}
      </div>

      {error && <p className="error-text">{error}</p>}

      {showComplete && (
        <div className="ride-complete" role="status">
          <div className="ride-complete-copy">
            <h3>{t('route.rideComplete')}</h3>
            <p>
              {t('route.rideCompleteHint', {
                distance: formatDistance(completedDistanceMeters),
                duration: formatDuration(completedElapsedSeconds),
              })}
            </p>
          </div>
          <div className="btn-row">
            <button type="button" className="btn btn-primary" onClick={onDownloadFit}>
              {t('route.downloadFit')}
            </button>
            <button type="button" className="btn btn-secondary" onClick={onDownloadGpx}>
              {t('route.downloadGpx')}
            </button>
            {canSaveToProfile && onSaveToProfile && (
              <button
                type="button"
                className="btn btn-accent"
                disabled={saveBusy}
                onClick={onSaveToProfile}
              >
                {saveBusy ? t('route.saving') : t('route.saveRide')}
              </button>
            )}
          </div>
          {saveMessage && <p className="auth-message">{saveMessage}</p>}
        </div>
      )}

      <div className="btn-row ride-actions">
        {!hideStart && (phase === 'ready' || phase === 'finished') && (
          <button type="button" className="btn btn-accent" onClick={onStart} disabled={!route}>
            {t('route.start')}
          </button>
        )}
        {phase === 'riding' && (
          <button type="button" className="btn btn-secondary" onClick={onPause}>
            {t('route.pause')}
          </button>
        )}
        {phase === 'paused' && (
          <button type="button" className="btn btn-accent" onClick={onResume}>
            {t('route.resume')}
          </button>
        )}
        {(phase === 'riding' || phase === 'paused') && (
          <button type="button" className="btn btn-ghost" onClick={onStop}>
            {t('route.stop')}
          </button>
        )}
        {phase === 'finished' && (
          <button type="button" className="btn btn-ghost" onClick={onStop}>
            {t('route.done')}
          </button>
        )}
      </div>
    </section>
  );
}
