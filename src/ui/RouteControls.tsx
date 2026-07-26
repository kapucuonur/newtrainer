import { useState, useEffect, type CSSProperties } from 'react';
import type { EnrichedRoute, LatLng, RouteResult } from '../routing/types';
import { routeAltColor } from '../routing/osrm';
import {
  MAX_WAYPOINTS,
  canAddWaypoint,
  canBuildRoute,
  nextWaypointLabel,
  waypointLabel,
} from '../routing/waypoints';
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
  Plus,
  Undo2,
  Film,
} from 'lucide-react';

type Props = {
  waypoints: LatLng[];
  pickMode: boolean;
  route: EnrichedRoute | null;
  routeAlternatives?: RouteResult[];
  selectedAlternativeIndex?: number;
  elevByAlternative?: Record<number, { elevGainMeters: number; elevLossMeters: number }>;
  elevatingAlternative?: boolean;
  onSelectAlternative?: (index: number) => void;
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
  onSetPickMode: (active: boolean) => void;
  onAddWaypoint?: (point: LatLng) => void;
  onRemoveLastWaypoint?: () => void;
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
  onSelectPresetRoute?: (waypoints: LatLng[]) => void;
  videoPanelOpen?: boolean;
  onToggleVideoPanel?: () => void;
  /** Hide start/pause/stop row (e.g. ride chrome owns those controls). */
  hideRideActions?: boolean;
};

// Preset iconic cycling routes for instant indoor training
const PRESET_ROUTES = [
  {
    id: 'alps-pass',
    name: 'Alps Pass Climb',
    desc: 'High elevation alpine climb (8.4 km)',
    waypoints: [
      { lat: 45.0934, lng: 6.0682 }, // Alpe d'Huez base
      { lat: 45.1158, lng: 6.0665 },
    ],
  },
  {
    id: 'coastal-flat',
    name: 'Coastal Flat 10K',
    desc: 'Smooth coastal endurance loop (10 km)',
    waypoints: [
      { lat: 43.6957, lng: 7.2714 }, // Nice Promenade des Anglais
      { lat: 43.6845, lng: 7.3321 },
    ],
  },
  {
    id: 'rolling-hills',
    name: 'Tuscany Rolling Hills',
    desc: 'Varied tempo terrain & punchy climbs (12 km)',
    waypoints: [
      { lat: 43.4674, lng: 11.0431 }, // San Gimignano
      { lat: 43.4912, lng: 11.1152 },
    ],
  },
];

function LocationSearchBox({
  badge,
  placeholder,
  disabled,
  onSelectPoint,
}: {
  badge: string;
  placeholder: string;
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
          placeholder={placeholder}
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
  waypoints,
  pickMode,
  route,
  routeAlternatives = [],
  selectedAlternativeIndex = 0,
  elevByAlternative = {},
  elevatingAlternative = false,
  onSelectAlternative,
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
  onAddWaypoint,
  onRemoveLastWaypoint,
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
  videoPanelOpen = false,
  onToggleVideoPanel,
  hideRideActions = false,
}: Props) {
  const t = useT();
  const showComplete = phase === 'finished' && hasExport;
  const locked = !routePlanningEnabled;
  const canBuild = canBuildRoute(waypoints);
  const canAdd = canAddWaypoint(waypoints.length);
  const nextLabel = nextWaypointLabel(waypoints.length);
  const canPickAlternative =
    routePlanningEnabled &&
    routeAlternatives.length > 1 &&
    waypoints.length === 2 &&
    (phase === 'idle' || phase === 'ready' || phase === 'finished');
  const showAltPicker = routeAlternatives.length > 1 && waypoints.length === 2;

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

        <div className="btn-row route-pin-row">
          <button
            type="button"
            className={`btn ${pickMode ? 'btn-primary' : 'btn-secondary'}`}
            disabled={locked || !canAdd}
            onClick={() => onSetPickMode(!pickMode)}
            title={
              canAdd
                ? t('route.addWaypointHint', { point: nextLabel })
                : t('route.maxWaypoints', { n: MAX_WAYPOINTS })
            }
          >
            <Plus className="icon-xs" />
            {t('route.addWaypoint')}
            {canAdd ? ` (${nextLabel})` : ''}
          </button>

          <button
            type="button"
            className="btn btn-secondary"
            disabled={locked || waypoints.length === 0}
            onClick={() => onRemoveLastWaypoint?.()}
          >
            <Undo2 className="icon-xs" />
            {t('route.removeLast')}
          </button>

          <button
            type="button"
            className={`btn ${isRoundTrip ? 'btn-accent' : 'btn-secondary'}`}
            disabled={locked}
            onClick={() => onToggleRoundTrip(!isRoundTrip)}
            title={t('route.roundTrip')}
          >
            <Repeat className="icon-xs" />
            {isRoundTrip ? t('route.roundTripShort') : t('route.oneWay')}
          </button>

          <button
            type="button"
            className="btn btn-primary btn-glow"
            disabled={locked || !canBuild || loading}
            onClick={onBuildRoute}
          >
            <Sparkles className="icon-xs" />
            {loading ? t('route.building') : t('route.build')}
          </button>

          <button type="button" className="btn btn-ghost" onClick={onClear}>
            <RotateCcw className="icon-xs" />
            {t('route.clear')}
          </button>

          {onToggleVideoPanel && (
            <button
              type="button"
              className={`btn ${videoPanelOpen ? 'btn-accent' : 'btn-secondary'}`}
              onClick={onToggleVideoPanel}
              aria-pressed={videoPanelOpen}
              title={t('video.toggleHint')}
            >
              <Film className="icon-xs" />
              {t('video.toggle')}
            </button>
          )}
        </div>
      </div>

      {routePlanningEnabled && (
        <div className="route-search-row">
          <LocationSearchBox
            badge={canAdd ? nextLabel : '—'}
            placeholder={t('route.searchPlaceholder')}
            disabled={locked || !canAdd}
            onSelectPoint={onAddWaypoint}
          />
        </div>
      )}

      {routePlanningEnabled && waypoints.length > 0 && (
        <ul className="waypoint-list" aria-label={t('route.waypoints')}>
          {waypoints.map((point, index) => (
            <li key={`${index}-${point.lat}-${point.lng}`} className="waypoint-list-item">
              <span className="waypoint-list-badge">{waypointLabel(index)}</span>
              <span className="waypoint-list-coords">
                {point.lat.toFixed(4)}, {point.lng.toFixed(4)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {routePlanningEnabled && !route && (
        <div className="preset-routes-bar">
          <span className="preset-label">Quick Presets:</span>
          {PRESET_ROUTES.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className="chip-preset"
              onClick={() => {
                onSetPickMode(false);
                if (onSelectPresetRoute) {
                  onSelectPresetRoute(preset.waypoints);
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

      {showAltPicker && (
        <div className="route-alt-picker" role="listbox" aria-label={t('route.alternatives')}>
          <div className="route-alt-picker-label">
            <Compass className="icon-xs icon-accent" />
            <span>{t('route.pickAlternative')}</span>
          </div>
          <div className="route-alt-cards">
            {routeAlternatives.map((alt, index) => {
              const selected = index === selectedAlternativeIndex;
              const elev = elevByAlternative[index];
              const color = routeAltColor(index);
              return (
                <button
                  key={index}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={`route-alt-card ${selected ? 'is-selected' : ''}`}
                  style={{ '--alt-color': color } as CSSProperties}
                  disabled={!canPickAlternative || elevatingAlternative || selected}
                  onClick={() => onSelectAlternative?.(index)}
                >
                  <span className="route-alt-swatch" aria-hidden />
                  <span className="route-alt-card-body">
                    <span className="route-alt-title">
                      {t('route.alternativeN', { n: index + 1 })}
                      {selected ? ` · ${t('route.selected')}` : ''}
                    </span>
                    <span className="route-alt-stats">
                      {formatDistance(alt.distanceMeters)}
                      {' · '}
                      ~{formatDuration(alt.durationSeconds)}
                      {' · '}
                      {elev
                        ? t('route.ascent', { gain: elev.elevGainMeters })
                        : t('route.ascentPending')}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="route-meta">
        <span className="meta-badge">
          <MapPin className="icon-xs" />{' '}
          {t('route.waypointCount', { count: waypoints.length, max: MAX_WAYPOINTS })}
        </span>
        {isRoundTrip && (
          <span className="meta-badge highlight">
            <Repeat className="icon-xs" /> {t('route.roundTrip')}
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

      {!hideRideActions && (
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
      )}
    </section>
  );
}
