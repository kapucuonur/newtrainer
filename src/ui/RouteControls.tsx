import type { EnrichedRoute, LatLng } from '../routing/types';
import type { RidePhase } from '../simulation/rideEngine';
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
  onSetPickMode: (mode: 'A' | 'B' | null) => void;
  onBuildRoute: () => void;
  onClear: () => void;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onDownloadFit: () => void;
  onDownloadGpx: () => void;
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
  onSetPickMode,
  onBuildRoute,
  onClear,
  onStart,
  onPause,
  onResume,
  onStop,
  onDownloadFit,
  onDownloadGpx,
}: Props) {
  const showComplete = phase === 'finished' && hasExport;

  return (
    <section className="route-controls">
      <div className="route-controls-top">
        <div>
          <h2>World route</h2>
          <p>Pick A → B anywhere on the map. OSRM bikes the roads; elevation drives trainer grade.</p>
        </div>
        <div className="btn-row">
          <button
            type="button"
            className={`btn ${pickMode === 'A' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => onSetPickMode(pickMode === 'A' ? null : 'A')}
          >
            Set A
          </button>
          <button
            type="button"
            className={`btn ${pickMode === 'B' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => onSetPickMode(pickMode === 'B' ? null : 'B')}
          >
            Set B
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!pointA || !pointB || loading}
            onClick={onBuildRoute}
          >
            {loading ? 'Building…' : 'Build route'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClear}>
            Clear
          </button>
        </div>
      </div>

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
            <h3>Ride complete</h3>
            <p>
              {formatDistance(completedDistanceMeters)} · {formatDuration(completedElapsedSeconds)} —
              download for Garmin Connect (manual import).
            </p>
          </div>
          <div className="btn-row">
            <button type="button" className="btn btn-primary" onClick={onDownloadFit}>
              Download FIT
            </button>
            <button type="button" className="btn btn-secondary" onClick={onDownloadGpx}>
              Download GPX
            </button>
          </div>
        </div>
      )}

      <div className="btn-row ride-actions">
        {(phase === 'ready' || phase === 'finished') && (
          <button type="button" className="btn btn-accent" onClick={onStart} disabled={!route}>
            Start ride
          </button>
        )}
        {phase === 'riding' && (
          <button type="button" className="btn btn-secondary" onClick={onPause}>
            Pause
          </button>
        )}
        {phase === 'paused' && (
          <button type="button" className="btn btn-accent" onClick={onResume}>
            Resume
          </button>
        )}
        {(phase === 'riding' || phase === 'paused') && (
          <button type="button" className="btn btn-ghost" onClick={onStop}>
            Stop
          </button>
        )}
        {phase === 'finished' && (
          <button type="button" className="btn btn-ghost" onClick={onStop}>
            Done
          </button>
        )}
      </div>
    </section>
  );
}
