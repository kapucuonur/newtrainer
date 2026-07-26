import { useState, useEffect } from 'react';
import type { EnrichedRoute, LatLng } from '../routing/types';
import type { RidePhase } from '../simulation/rideEngine';
import { searchLocation, type GeocodedPlace } from '../routing/geocoding';
import { useT } from '../i18n';
import { formatDistance, formatDuration } from './format';
import {
  MapPin,
  Play,
  Pause,
  RotateCcw,
  Square,
  Download,
  Save,
  Route,
  Sparkles,
  Mountain,
  Compass,
  Repeat,
  Search,
  Loader2,
} from 'lucide-react';

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
  isRoundTrip: boolean;
  onOpenAccount: () => void;
  onSetPickMode: (mode: 'A' | 'B' | null) => void;
  onSetPointA?: (point: LatLng) => void;
  onSetPointB?: (point: LatLng) => void;
  onToggleRoundTrip: (isRoundTrip: boolean) => void;
  onBuildRoute: () => void;
  onClear: () => void;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onDownloadFit: () => void;
  onDownloadGpx: () => void;
  canSaveToProfile?: boolean;
  saveBusy?: boolean;
  saveMessage?: string | null;
  onSaveToProfile?: () => void;
  hideStart?: boolean;
  /** Direct preset route selector callback */
  onSelectPresetRoute?: (pointA: LatLng, pointB: LatLng) => void;
};

// Preset iconic cycling routes for instant indoor training
const PRESET_ROUTES = [
  {
    id: 'alps-pass',
    name: 'Alps Pass Climb',
    desc: 'High elevation alpine climb (8.4 km)',
    pointA: { lat: 45.0934, lng: 6.0682 }, // Alpe d'Huez base
    pointB: { lat: 45.1158, lng: 6.0665 },
  },
  {
    id: 'coastal-flat',
    name: 'Coastal Flat 10K',
    desc: 'Smooth coastal endurance loop (10 km)',
    pointA: { lat: 43.6957, lng: 7.2714 }, // Nice Promenade des Anglais
    pointB: { lat: 43.6845, lng: 7.3321 },
  },
  {
    id: 'rolling-hills',
    name: 'Tuscany Rolling Hills',
    desc: 'Varied tempo terrain & punchy climbs (12 km)',
    pointA: { lat: 43.4674, lng: 11.0431 }, // San Gimignano
    pointB: { lat: 43.4912, lng: 11.1152 },
  },
];

function LocationSearchBox({
  badge,
  placeholder,
  point,
  disabled,
  onSelectPoint,
}: {
  badge: string;
  placeholder: string;
  point: LatLng | null;
  disabled?: boolean;
  onSelectPoint?: (point: LatLng) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeocodedPlace[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!query || query.trim().length < 3) {
      setResults([]);
      setOpen(false);
      return;
    }

    const timer = setTimeout(() => {
      setSearching(true);
      searchLocation(query).then((items) => {
        setResults(items);
        setSearching(false);
        setOpen(items.length > 0);
      });
    }, 380);

    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div className="location-search-box">
      <div className="search-input-wrapper">
        <span className="search-point-badge">{badge}</span>
        <input
          type="text"
          className="search-input"
          value={query}
          disabled={disabled}
          placeholder={
            point
              ? `${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}`
              : placeholder
          }
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            if (results.length > 0) setOpen(true);
          }}
          onBlur={() => {
            // Delay close so click event triggers
            setTimeout(() => setOpen(false), 200);
          }}
        />
        {searching ? (
          <Loader2 className="icon-xs search-spinner" />
        ) : (
          <Search className="icon-xs search-icon" />
        )}
      </div>

      {open && results.length > 0 && (
        <ul className="search-dropdown">
          {results.map((place, idx) => (
            <li
              key={idx}
              className="search-dropdown-item"
              onMouseDown={(e) => {
                e.preventDefault();
                if (onSelectPoint) onSelectPoint({ lat: place.lat, lng: place.lng });
                const firstPart = place.displayName.split(',')[0];
                setQuery(firstPart);
                setOpen(false);
              }}
            >
              <MapPin className="icon-xs icon-accent" />
              <span className="dropdown-text">{place.displayName}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

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
  isRoundTrip,
  onOpenAccount,
  onSetPickMode,
  onSetPointA,
  onSetPointB,
  onToggleRoundTrip,
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
  onSelectPresetRoute,
}: Props) {
  const t = useT();
  const showComplete = phase === 'finished' && hasExport;
  const locked = !routePlanningEnabled;

  return (
    <section className="route-controls" aria-label="Route Controls">
      <div className="route-controls-top">
        <div className="route-header-brand">
          <Route className="icon-md icon-accent" />
          <div>
            <h2>{t('route.title')}</h2>
            <p className="subtitle">{t('route.subtitle')}</p>
          </div>
        </div>

        {/* Step by step map pin buttons */}
        <div className="btn-row route-pin-row">
          <button
            type="button"
            className={`btn ${pickMode === 'A' ? 'btn-primary' : 'btn-secondary'}`}
            disabled={locked}
            onClick={() => onSetPickMode(pickMode === 'A' ? null : 'A')}
          >
            <MapPin className="icon-xs" />
            {t('route.setA')} {pointA ? '✓' : ''}
          </button>

          <button
            type="button"
            className={`btn ${pickMode === 'B' ? 'btn-primary' : 'btn-secondary'}`}
            disabled={locked}
            onClick={() => onSetPickMode(pickMode === 'B' ? null : 'B')}
          >
            <MapPin className="icon-xs" />
            {t('route.setB')} {pointB ? '✓' : ''}
          </button>

          {/* Out & Back Return Route Toggle */}
          <button
            type="button"
            className={`btn ${isRoundTrip ? 'btn-accent' : 'btn-secondary'}`}
            disabled={locked}
            onClick={() => onToggleRoundTrip(!isRoundTrip)}
            title="Return option: Ride to B and back to A (A → B → A)"
          >
            <Repeat className="icon-xs" />
            {isRoundTrip ? 'Return (A→B→A)' : 'One Way (A→B)'}
          </button>

          <button
            type="button"
            className="btn btn-primary btn-glow"
            disabled={locked || !pointA || !pointB || loading}
            onClick={onBuildRoute}
          >
            <Sparkles className="icon-xs" />
            {loading ? t('route.building') : t('route.build')}
          </button>

          <button type="button" className="btn btn-ghost" onClick={onClear}>
            <RotateCcw className="icon-xs" />
            {t('route.clear')}
          </button>
        </div>
      </div>

      {/* Address / Location Search Bar Row */}
      {routePlanningEnabled && (
        <div className="route-search-row">
          <LocationSearchBox
            badge="Start A"
            placeholder="Search city, address or mountain (e.g. Alpe d'Huez)"
            point={pointA}
            disabled={locked}
            onSelectPoint={onSetPointA}
          />
          <LocationSearchBox
            badge="Finish B"
            placeholder="Search destination address or city"
            point={pointB}
            disabled={locked}
            onSelectPoint={onSetPointB}
          />
        </div>
      )}

      {/* Preset Routes Quick Chips */}
      {routePlanningEnabled && !route && (
        <div className="preset-routes-bar">
          <span className="preset-label">Quick Presets:</span>
          {PRESET_ROUTES.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className="chip-preset"
              onClick={() => {
                onSetPickMode(null);
                if (onSelectPresetRoute) {
                  onSelectPresetRoute(preset.pointA, preset.pointB);
                }
              }}
            >
              <Mountain className="icon-xs" />
              <span>{preset.name}</span>
            </button>
          ))}
        </div>
      )}

      {gateMessage && (
        <div className="auth-gate-banner" role="status">
          <p>{gateMessage}</p>
          <button type="button" className="btn btn-accent" onClick={onOpenAccount}>
            {t('route.gateCta')}
          </button>
        </div>
      )}

      {/* Route Metadata Summary */}
      <div className="route-meta">
        <span className="meta-badge">
          <MapPin className="icon-xs" /> A: {pointA ? `${pointA.lat.toFixed(4)}, ${pointA.lng.toFixed(4)}` : '—'}
        </span>
        <span className="meta-badge">
          <MapPin className="icon-xs" /> B: {pointB ? `${pointB.lat.toFixed(4)}, ${pointB.lng.toFixed(4)}` : '—'}
        </span>
        {isRoundTrip && (
          <span className="meta-badge highlight">
            <Repeat className="icon-xs" /> Round Trip (A → B → A)
          </span>
        )}
        {route && (
          <>
            <span className="meta-badge highlight">
              <Compass className="icon-xs" /> {formatDistance(route.distanceMeters)}
            </span>
            <span className="meta-badge">
              ~{formatDuration(route.durationSeconds)}
            </span>
            <span className="meta-badge">
              ↑{route.elevGainMeters}m ↓{route.elevLossMeters}m
            </span>
            <span className="route-source">{route.source}</span>
          </>
        )}
      </div>

      {error && <p className="error-text">{error}</p>}

      {/* Ride Complete Summary Card */}
      {showComplete && (
        <div className="ride-complete" role="status">
          <div className="ride-complete-copy">
            <h3>
              <Sparkles className="icon-sm" /> {t('route.rideComplete')}
            </h3>
            <p>
              {t('route.rideCompleteHint', {
                distance: formatDistance(completedDistanceMeters),
                duration: formatDuration(completedElapsedSeconds),
              })}
            </p>
          </div>
          <div className="btn-row">
            <button type="button" className="btn btn-primary" onClick={onDownloadFit}>
              <Download className="icon-xs" />
              {t('route.downloadFit')}
            </button>
            <button type="button" className="btn btn-secondary" onClick={onDownloadGpx}>
              <Download className="icon-xs" />
              {t('route.downloadGpx')}
            </button>
            {canSaveToProfile && onSaveToProfile && (
              <button
                type="button"
                className="btn btn-accent"
                disabled={saveBusy}
                onClick={onSaveToProfile}
              >
                <Save className="icon-xs" />
                {saveBusy ? t('route.saving') : t('route.saveRide')}
              </button>
            )}
          </div>
          {saveMessage && <p className="auth-message">{saveMessage}</p>}
        </div>
      )}

      {/* Main Ride Control Actions */}
      <div className="btn-row ride-actions">
        {!hideStart && (phase === 'ready' || phase === 'finished') && (
          <button
            type="button"
            className="btn btn-accent btn-large btn-glow"
            onClick={onStart}
            disabled={!route}
          >
            <Play className="icon-sm" />
            {t('route.start')}
          </button>
        )}
        {phase === 'riding' && (
          <button type="button" className="btn btn-secondary btn-large" onClick={onPause}>
            <Pause className="icon-sm" />
            {t('route.pause')}
          </button>
        )}
        {phase === 'paused' && (
          <button type="button" className="btn btn-accent btn-large btn-glow" onClick={onResume}>
            <Play className="icon-sm" />
            {t('route.resume')}
          </button>
        )}
        {(phase === 'riding' || phase === 'paused') && (
          <button type="button" className="btn btn-danger btn-large" onClick={onStop}>
            <Square className="icon-sm" />
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
