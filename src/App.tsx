import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Menu } from 'lucide-react';
import {
  ApiError,
  createRoom,
  endRoom,
  fetchMe,
  getStoredToken,
  joinRoom,
  leaveRoom,
  login as apiLogin,
  logout as apiLogout,
  register as apiRegister,
  saveRide,
  setStoredToken,
  startRoom,
  updateProfile,
} from './api/client';
import { isCloudApiEnabled } from './api/config';
import { RoomSocket } from './api/roomSocket';
import type { PeerRider, Room, User } from './api/types';
import { FtmsTrainer } from './bluetooth/ftms';
import { HeartRateMonitor } from './bluetooth/heartRate';
import { MockTrainer } from './bluetooth/mockTrainer';
import type { BikeTrainer, ConnectionState } from './bluetooth/types';
import { probeWifiBridge } from './bluetooth/wifiBridge';
import { enrichRouteWithElevation } from './elevation/service';
import { downloadRideFit, downloadRideGpx } from './export';
import type { TrackPoint } from './export/types';
import { useT, type MessageKey } from './i18n';
import { RouteMap, type MapPeer } from './map/RouteMap';
import {
  loadStoredMapStyleId,
  storeMapStyleId,
  type MapStyleId,
} from './map/mapStyles';
import { parseRoomRoute } from './routing/fromRoomRoute';
import { fetchRouteAlternatives } from './routing/osrm';
import { toRoomRoutePayload } from './routing/toRoomRoute';
import type { EnrichedRoute, LatLng, RouteResult } from './routing/types';
import {
  MAX_WAYPOINTS,
  canAddWaypoint,
  canBuildRoute,
  nextWaypointLabel,
} from './routing/waypoints';
import { RideEngine, type RidePowerMode, type RideTelemetry } from './simulation/rideEngine';
import { AuthPanel } from './ui/AuthPanel';
import { ConnectionPanel } from './ui/ConnectionPanel';
import { ElevationProfile } from './ui/ElevationProfile';
import { GroupRidePanel } from './ui/GroupRidePanel';
import { MapStylePicker } from './ui/MapStylePicker';
import { RideChrome } from './ui/RideChrome';
import { RideHUD } from './ui/RideHUD';
import { RouteControls } from './ui/RouteControls';
import { VideoPanel } from './ui/VideoPanel';

const idleTelemetry: RideTelemetry = {
  phase: 'idle',
  distanceMeters: 0,
  routeDistanceMeters: 0,
  progress: 0,
  speedKmh: 0,
  powerWatts: 0,
  cadenceRpm: 0,
  heartRateBpm: null,
  gradePercent: 0,
  elevationMeters: 0,
  elapsedSeconds: 0,
  position: null,
  trainerResistanceHint: 20,
  trainerGradeSent: null,
  trainerControlMode: null,
  powerMode: 'free',
  targetPowerWatts: null,
  ergHardwareActive: false,
  supportsTargetPower: null,
  hasExport: false,
};

function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function maxOf(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.max(...values);
}

function elevationGainMeters(points: TrackPoint[]): number | null {
  let gain = 0;
  for (let i = 1; i < points.length; i++) {
    const delta = points[i].elevationMeters - points[i - 1].elevationMeters;
    if (delta > 0) gain += delta;
  }
  if (gain <= 0) return null;
  return Math.round(gain);
}

export default function App() {
  const t = useT();
  const engineRef = useRef(new RideEngine());
  const hrRef = useRef(new HeartRateMonitor());
  const mockRef = useRef(new MockTrainer());
  const activeTrainerRef = useRef<BikeTrainer | null>(null);
  const trainerUnsubRef = useRef<(() => void) | null>(null);

  const [usingMock, setUsingMock] = useState(false);
  const [trainerState, setTrainerState] = useState<ConnectionState>('disconnected');
  const [trainerName, setTrainerName] = useState('FTMS Trainer');
  const [trainerErrorMessage, setTrainerErrorMessage] = useState<string | null>(null);
  const [hrState, setHrState] = useState<ConnectionState>('disconnected');
  const [hrName, setHrName] = useState('Heart Rate');
  const [hrErrorMessage, setHrErrorMessage] = useState<string | null>(null);
  const [hrBpm, setHrBpm] = useState<number | null>(null);
  const [mockEffort, setMockEffort] = useState(0.72);
  const [wifiCode, setWifiCode] = useState<MessageKey>('wifi.default');

  const [waypoints, setWaypoints] = useState<LatLng[]>([]);
  const [pickMode, setPickMode] = useState(false);
  const [isRoundTrip, setIsRoundTrip] = useState(false);
  const [route, setRoute] = useState<EnrichedRoute | null>(null);
  const [routeAlternatives, setRouteAlternatives] = useState<RouteResult[]>([]);
  const [selectedAltIndex, setSelectedAltIndex] = useState(0);
  const [enrichedByAlt, setEnrichedByAlt] = useState<Record<number, EnrichedRoute>>(
    {},
  );
  const [elevatingAlt, setElevatingAlt] = useState(false);
  const [loadingRoute, setLoadingRoute] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [telemetry, setTelemetry] = useState<RideTelemetry>(idleTelemetry);
  const altEnrichGenRef = useRef(0);

  const [user, setUser] = useState<User | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [savedRideId, setSavedRideId] = useState<number | null>(null);
  const [rideHistoryRevision, setRideHistoryRevision] = useState(0);

  const [room, setRoom] = useState<Room | null>(null);
  const [peers, setPeers] = useState<PeerRider[]>([]);
  const [joinCode, setJoinCode] = useState('');
  const [groupBusy, setGroupBusy] = useState(false);
  const [groupMessage, setGroupMessage] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(min-width: 1025px)').matches
      : true,
  );
  const [mapStyleId, setMapStyleId] = useState<MapStyleId>(() => loadStoredMapStyleId());
  const [routePeekOpen, setRoutePeekOpen] = useState(false);
  const [videoPanelOpen, setVideoPanelOpen] = useState(false);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const roomSocketRef = useRef<RoomSocket | null>(null);
  const roomRef = useRef<Room | null>(null);
  const groupStartRef = useRef(false);
  const telemetryPhaseRef = useRef(idleTelemetry.phase);

  const cloudEnabled = isCloudApiEnabled();
  const canPlanRoute = Boolean(cloudEnabled && user);
  const canUseDevices = canPlanRoute;
  const inGroup = Boolean(room && room.status !== 'ended');
  const groupMode = inGroup;
  const immersiveRide =
    telemetry.phase === 'riding' || telemetry.phase === 'paused';

  useEffect(() => {
    const engine = engineRef.current;
    const unsub = engine.onTelemetry(setTelemetry);
    return () => {
      unsub();
      engine.dispose();
    };
  }, []);

  useEffect(() => {
    const hr = hrRef.current;
    const offConn = hr.onConnection((state, message) => {
      setHrState(state);
      setHrName(hr.name);
      setHrErrorMessage(state === 'error' ? (message ?? null) : null);
    });
    const offSample = hr.onSample((sample) => {
      setHrBpm(sample.bpm);
      engineRef.current.setHeartRate(sample.bpm);
    });
    return () => {
      offConn();
      offSample();
    };
  }, []);

  useEffect(() => {
    mockRef.current.setEffort(mockEffort);
  }, [mockEffort]);

  useEffect(() => {
    if (!isCloudApiEnabled() || !getStoredToken()) return;
    let cancelled = false;
    void (async () => {
      try {
        const me = await fetchMe();
        if (!cancelled) setUser(me);
      } catch {
        if (!cancelled) setStoredToken(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!canPlanRoute || inGroup) {
      setPickMode(false);
      return;
    }
    if (waypoints.length === 0) {
      setPickMode(true);
    }
  }, [canPlanRoute, inGroup, waypoints.length]);

  useEffect(() => {
    if (canUseDevices) return;
    let cancelled = false;
    void (async () => {
      const trainer = activeTrainerRef.current;
      if (trainer && trainer.getState() !== 'disconnected') {
        try {
          await trainer.disconnect();
        } catch {
          // ignore disconnect errors while locking devices
        }
      }
      if (cancelled) return;
      trainerUnsubRef.current?.();
      trainerUnsubRef.current = null;
      activeTrainerRef.current = null;
      engineRef.current.attachTrainer(null);
      setUsingMock(false);
      setTrainerState('disconnected');
      setTrainerName(t('trainer.defaultName'));

      if (hrRef.current.getState() !== 'disconnected') {
        try {
          await hrRef.current.disconnect();
        } catch {
          // ignore
        }
      }
      if (cancelled) return;
      setHrBpm(null);
      engineRef.current.setHeartRate(null);
      setHrName(t('hr.defaultName'));
    })();
    return () => {
      cancelled = true;
    };
  }, [canUseDevices, t]);

  useEffect(() => {
    if (telemetry.phase === 'finished') {
      setSavedRideId(null);
      setSaveMessage(null);
    }
  }, [telemetry.phase, telemetry.hasExport]);

  useEffect(() => {
    roomRef.current = room;
  }, [room]);

  const applyRoomRoute = useCallback(
    (nextRoom: Room) => {
      const parsed = parseRoomRoute(nextRoom.route);
      if (!parsed) {
        setGroupMessage(t('group.badRoute'));
        return false;
      }
      altEnrichGenRef.current += 1;
      setRouteAlternatives([]);
      setSelectedAltIndex(0);
      setEnrichedByAlt({ 0: parsed });
      setElevatingAlt(false);
      setRoute(parsed);
      engineRef.current.setRoute(parsed);
      const first = parsed.coordinates[0];
      const last = parsed.coordinates[parsed.coordinates.length - 1];
      const roomWaypoints: LatLng[] = [];
      if (first) roomWaypoints.push(first);
      if (last && (!first || first.lat !== last.lat || first.lng !== last.lng)) {
        roomWaypoints.push(last);
      }
      setWaypoints(roomWaypoints);
      setPickMode(false);
      setRouteError(null);
      return true;
    },
    [t],
  );

  const activateEnrichedRoute = useCallback((enriched: EnrichedRoute, index: number) => {
    setSelectedAltIndex(index);
    setRoute(enriched);
    engineRef.current.setRoute(enriched);
    setRouteError(enriched.elevationWarning ?? null);
  }, []);

  const enrichAndActivate = useCallback(
    async (alts: RouteResult[], index: number, generation: number) => {
      const base = alts[index];
      if (!base) return;
      setElevatingAlt(true);
      try {
        const enriched = await enrichRouteWithElevation(base);
        if (altEnrichGenRef.current !== generation) return;
        setEnrichedByAlt((prev) => ({ ...prev, [index]: enriched }));
        activateEnrichedRoute(enriched, index);
      } catch (error) {
        if (altEnrichGenRef.current !== generation) return;
        setRouteError(error instanceof Error ? error.message : t('route.buildFailed'));
      } finally {
        if (altEnrichGenRef.current === generation) setElevatingAlt(false);
      }
    },
    [activateEnrichedRoute, t],
  );

  /** Background DEM for remaining alternatives (cheap when 2–3 alts). */
  const enrichRemainingInBackground = useCallback(
    (alts: RouteResult[], skipIndex: number, generation: number) => {
      if (alts.length <= 1) return;
      void (async () => {
        for (let i = 0; i < alts.length; i++) {
          if (i === skipIndex) continue;
          if (altEnrichGenRef.current !== generation) return;
          try {
            const enriched = await enrichRouteWithElevation(alts[i]);
            if (altEnrichGenRef.current !== generation) return;
            setEnrichedByAlt((prev) =>
              prev[i] ? prev : { ...prev, [i]: enriched },
            );
          } catch {
            // Selected route elev is required; background failures are silent.
          }
        }
      })();
    },
    [],
  );

  const beginGroupRide = useCallback(async () => {
    if (groupStartRef.current) return;
    const phase = engineRef.current.getPhase();
    if (phase === 'riding' || phase === 'paused') {
      groupStartRef.current = true;
      return;
    }
    try {
      groupStartRef.current = true;
      await engineRef.current.start();
    } catch (error) {
      groupStartRef.current = false;
      setGroupMessage(
        error instanceof Error ? error.message : t('group.startFailed'),
      );
    }
  }, [t]);

  const disconnectRoomSocket = useCallback(() => {
    roomSocketRef.current?.close();
    roomSocketRef.current = null;
  }, []);

  const connectRoomSocket = useCallback(
    (roomId: number) => {
      disconnectRoomSocket();
      const sock = new RoomSocket(roomId, {
        onEvent: (event) => {
          if (event.type === 'hello') {
            if (event.room) setRoom(event.room);
            setPeers(event.peers ?? []);
            return;
          }
          if (event.type === 'peers') {
            setPeers(event.riders ?? []);
            return;
          }
          if (event.type === 'member_join' || event.type === 'member_leave') {
            if (event.room) setRoom(event.room);
            return;
          }
          if (event.type === 'start') {
            if (event.room) setRoom(event.room);
            void beginGroupRide();
            return;
          }
          if (event.type === 'end') {
            if (event.room) setRoom(event.room);
            setGroupMessage(t('group.ended'));
            disconnectRoomSocket();
            groupStartRef.current = false;
          }
        },
        onError: () => {
          setGroupMessage(t('group.wsError'));
        },
      });
      roomSocketRef.current = sock;
      sock.connect();
    },
    [beginGroupRide, disconnectRoomSocket, t],
  );

  useEffect(() => {
    return () => {
      disconnectRoomSocket();
    };
  }, [disconnectRoomSocket]);

  useEffect(() => {
    telemetryPhaseRef.current = telemetry.phase;
  }, [telemetry.phase]);

  useEffect(() => {
    const active = roomRef.current;
    if (!active || active.status === 'ended') return;
    if (telemetry.phase !== 'riding' && telemetry.phase !== 'paused') return;
    const pos = telemetry.position;
    if (!pos) return;
    roomSocketRef.current?.sendTelemetry({
      lat: pos.lat,
      lng: pos.lng,
      distance_m: telemetry.distanceMeters,
      speed_kmh: telemetry.speedKmh,
      power: telemetry.powerWatts,
      hr: telemetry.heartRateBpm,
      cadence: telemetry.cadenceRpm,
    });
  }, [telemetry]);

  const attachTrainer = useCallback((next: BikeTrainer, mock: boolean) => {
    trainerUnsubRef.current?.();
    activeTrainerRef.current = next;
    setUsingMock(mock);
    setTrainerName(next.name);
    engineRef.current.attachTrainer(next);
    trainerUnsubRef.current = next.onConnection((state, message) => {
      setTrainerState(state);
      setTrainerName(next.name);
      setTrainerErrorMessage(state === 'error' ? (message ?? null) : null);
    });
  }, []);

  const connectFtms = async () => {
    if (!canUseDevices) return;
    try {
      setRouteError(null);
      // Do not await anything before requestDevice — Bluefy needs the tap gesture.
      const mockWasConnected =
        usingMock && mockRef.current.getState() === 'connected';
      const ftms = new FtmsTrainer();
      attachTrainer(ftms, false);
      await ftms.connect();
      if (mockWasConnected) {
        await mockRef.current.disconnect();
      }
    } catch (error) {
      setRouteError(error instanceof Error ? error.message : t('trainer.connectFailed'));
    }
  };

  const enableMockTrainer = async () => {
    if (!canUseDevices) return;
    try {
      setRouteError(null);
      const current = activeTrainerRef.current;
      if (current && current.kind === 'ftms' && current.getState() === 'connected') {
        await current.disconnect();
      }
      const mock = mockRef.current;
      attachTrainer(mock, true);
      if (mock.getState() !== 'connected') {
        await mock.connect();
      }
    } catch (error) {
      setRouteError(error instanceof Error ? error.message : t('trainer.mockFailed'));
    }
  };

  const disconnectTrainer = async () => {
    await activeTrainerRef.current?.disconnect();
    trainerUnsubRef.current?.();
    trainerUnsubRef.current = null;
    activeTrainerRef.current = null;
    engineRef.current.attachTrainer(null);
    setUsingMock(false);
    setTrainerState('disconnected');
    setTrainerName(t('trainer.defaultName'));
    setTrainerErrorMessage(null);
  };

  const connectHr = async () => {
    if (!canUseDevices) return;
    try {
      setRouteError(null);
      await hrRef.current.connect();
    } catch (error) {
      setRouteError(error instanceof Error ? error.message : t('hr.connectFailed'));
    }
  };

  const disconnectHr = async () => {
    await hrRef.current.disconnect();
    setHrBpm(null);
    engineRef.current.setHeartRate(null);
    setHrName(t('hr.defaultName'));
    setHrErrorMessage(null);
  };

  const onPowerModeChange = useCallback((mode: RidePowerMode) => {
    void engineRef.current.setPowerMode(mode);
  }, []);

  const onTargetPowerChange = useCallback((watts: number | null) => {
    void engineRef.current.setTargetPowerWatts(watts);
  }, []);

  const addWaypoint = useCallback(
    (point: LatLng) => {
      if (!canPlanRoute) return;
      setWaypoints((prev) => {
        if (!canAddWaypoint(prev.length)) return prev;
        const next = [...prev, point];
        if (!canAddWaypoint(next.length)) {
          queueMicrotask(() => setPickMode(false));
        }
        return next;
      });
    },
    [canPlanRoute],
  );

  const removeLastWaypoint = useCallback(() => {
    if (!canPlanRoute) return;
    setWaypoints((prev) => prev.slice(0, -1));
  }, [canPlanRoute]);

  const onPick = useCallback(
    (point: LatLng) => {
      if (!canPlanRoute || !pickMode) return;
      addWaypoint(point);
    },
    [addWaypoint, canPlanRoute, pickMode],
  );

  const onSetPickMode = useCallback(
    (active: boolean) => {
      if (!canPlanRoute) return;
      setPickMode(active);
    },
    [canPlanRoute],
  );

  const buildRoute = async (roundTripOverride?: boolean) => {
    if (!canPlanRoute || !canBuildRoute(waypoints)) return;
    const roundTrip = roundTripOverride ?? isRoundTrip;
    const generation = ++altEnrichGenRef.current;
    setLoadingRoute(true);
    setRouteError(null);
    setElevatingAlt(false);
    setRoute(null);
    setRouteAlternatives([]);
    setEnrichedByAlt({});
    setSelectedAltIndex(0);
    setPickMode(false);
    engineRef.current.setRoute(null);
    try {
      const alts = await fetchRouteAlternatives(waypoints, roundTrip);
      if (altEnrichGenRef.current !== generation) return;
      setRouteAlternatives(alts);
      await enrichAndActivate(alts, 0, generation);
      enrichRemainingInBackground(alts, 0, generation);
    } catch (error) {
      if (altEnrichGenRef.current !== generation) return;
      setRouteError(error instanceof Error ? error.message : t('route.buildFailed'));
    } finally {
      if (altEnrichGenRef.current === generation) setLoadingRoute(false);
    }
  };

  const handleSelectPreset = async (
    nextWaypoints: LatLng[],
    roundTripOverride?: boolean,
  ) => {
    if (!canPlanRoute || !canBuildRoute(nextWaypoints)) return;
    const roundTrip = roundTripOverride ?? isRoundTrip;
    const generation = ++altEnrichGenRef.current;
    setWaypoints(nextWaypoints.slice(0, MAX_WAYPOINTS));
    setPickMode(false);
    setLoadingRoute(true);
    setRouteError(null);
    setElevatingAlt(false);
    setRoute(null);
    setRouteAlternatives([]);
    setEnrichedByAlt({});
    setSelectedAltIndex(0);
    engineRef.current.setRoute(null);
    try {
      const alts = await fetchRouteAlternatives(nextWaypoints, roundTrip);
      if (altEnrichGenRef.current !== generation) return;
      setRouteAlternatives(alts);
      await enrichAndActivate(alts, 0, generation);
      enrichRemainingInBackground(alts, 0, generation);
    } catch (error) {
      if (altEnrichGenRef.current !== generation) return;
      setRouteError(error instanceof Error ? error.message : t('route.buildFailed'));
    } finally {
      if (altEnrichGenRef.current === generation) setLoadingRoute(false);
    }
  };

  const onSelectAlternative = useCallback(
    (index: number) => {
      if (index === selectedAltIndex) return;
      const phase = engineRef.current.getPhase();
      if (phase === 'riding' || phase === 'paused') return;
      if (!routeAlternatives[index]) return;

      setSelectedAltIndex(index);
      const cached = enrichedByAlt[index];
      if (cached) {
        activateEnrichedRoute(cached, index);
        return;
      }
      // Don't keep the previous route active while DEM loads for the new choice.
      setRoute(null);
      engineRef.current.setRoute(null);
      const generation = altEnrichGenRef.current;
      void enrichAndActivate(routeAlternatives, index, generation);
    },
    [
      activateEnrichedRoute,
      enrichAndActivate,
      enrichedByAlt,
      routeAlternatives,
      selectedAltIndex,
    ],
  );

  const resetGroupState = useCallback(() => {
    disconnectRoomSocket();
    setRoom(null);
    setPeers([]);
    groupStartRef.current = false;
  }, [disconnectRoomSocket]);

  const clearRoute = async () => {
    if (roomRef.current && roomRef.current.status !== 'ended') {
      try {
        await leaveRoom(roomRef.current.id);
      } catch {
        // still clear local state
      }
      resetGroupState();
      setGroupMessage(null);
    }
    await engineRef.current.stop();
    altEnrichGenRef.current += 1;
    setRoute(null);
    setRouteAlternatives([]);
    setSelectedAltIndex(0);
    setEnrichedByAlt({});
    setElevatingAlt(false);
    setWaypoints([]);
    setPickMode(canPlanRoute);
    engineRef.current.setRoute(null);
    setTelemetry(idleTelemetry);
    setSavedRideId(null);
    setSaveMessage(null);
  };

  const onProbeWifi = async () => {
    if (!canUseDevices) return;
    const status = await probeWifiBridge();
    setWifiCode(status.code);
  };

  const focusRideViewer = () => {
    window.requestAnimationFrame(() => {
      document.getElementById('ride-viewer')?.focus({ preventScroll: true });
    });
  };

  const openPanel = () => setPanelOpen(true);

  const closePanel = () => {
    setPanelOpen(false);
    focusRideViewer();
  };

  const onOpenAccount = () => {
    openPanel();
    window.setTimeout(() => {
      document.getElementById('account-panel')?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }, 80);
  };

  useEffect(() => {
    if (immersiveRide) {
      setPanelOpen(false);
      focusRideViewer();
    } else {
      setRoutePeekOpen(false);
    }
  }, [immersiveRide]);

  useEffect(() => {
    if (!panelOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPanelOpen(false);
        focusRideViewer();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [panelOpen]);

  const rideLabel = useMemo(() => {
    if (telemetry.phase === 'riding') return t('phase.riding');
    if (telemetry.phase === 'paused') return t('phase.paused');
    if (telemetry.phase === 'finished') return t('phase.finished');
    if (telemetry.phase === 'ready') return t('phase.ready');
    return t('phase.idle');
  }, [t, telemetry.phase]);

  const gateMessage = !cloudEnabled
    ? t('route.gateNoApi')
    : !user
      ? t('route.gateLogin')
      : null;

  const deviceGateMessage = !cloudEnabled
    ? t('devices.gateNoApi')
    : !user
      ? t('devices.gateLogin')
      : null;

  const onDownloadFit = () => {
    const ride = engineRef.current.getExport();
    if (!ride || ride.points.length === 0) {
      setRouteError(t('route.noExport'));
      return;
    }
    setRouteError(null);
    downloadRideFit(ride);
  };

  const onDownloadGpx = () => {
    const ride = engineRef.current.getExport();
    if (!ride || ride.points.length === 0) {
      setRouteError(t('route.noExport'));
      return;
    }
    setRouteError(null);
    downloadRideGpx(ride);
  };

  const withAuthError = (error: unknown): string => {
    if (error instanceof ApiError) return error.message;
    if (error instanceof Error) return error.message;
    return t('auth.requestFailed');
  };

  const onCreateRoom = async () => {
    if (!user) {
      setGroupMessage(t('group.needLogin'));
      return;
    }
    if (!route) {
      setGroupMessage(t('group.needRoute'));
      return;
    }
    setGroupBusy(true);
    setGroupMessage(null);
    try {
      const created = await createRoom(toRoomRoutePayload(route));
      setRoom(created);
      applyRoomRoute(created);
      connectRoomSocket(created.id);
      setGroupMessage(t('group.created', { code: created.code }));
    } catch (error) {
      setGroupMessage(withAuthError(error));
    } finally {
      setGroupBusy(false);
    }
  };

  const onJoinRoom = async () => {
    if (!user) {
      setGroupMessage(t('group.needLogin'));
      return;
    }
    if (joinCode.trim().length < 4) {
      setGroupMessage(t('group.needCode'));
      return;
    }
    setGroupBusy(true);
    setGroupMessage(null);
    try {
      const joined = await joinRoom(joinCode.trim());
      if (!applyRoomRoute(joined)) {
        setGroupBusy(false);
        return;
      }
      setRoom(joined);
      connectRoomSocket(joined.id);
      setJoinCode('');
      setGroupMessage(t('group.joined', { code: joined.code }));
      if (joined.status === 'live') {
        void beginGroupRide();
      }
    } catch (error) {
      if (
        error instanceof ApiError &&
        (error.code === 'ROOM_FULL' || error.message.toLowerCase().includes('full'))
      ) {
        setGroupMessage(t('group.full', { max: 20 }));
      } else {
        setGroupMessage(withAuthError(error));
      }
    } finally {
      setGroupBusy(false);
    }
  };

  const onStartGroup = async () => {
    if (!room) return;
    setGroupBusy(true);
    setGroupMessage(null);
    try {
      const next = await startRoom(room.id);
      setRoom(next);
      await beginGroupRide();
    } catch (error) {
      setGroupMessage(withAuthError(error));
    } finally {
      setGroupBusy(false);
    }
  };

  const onLeaveGroup = async () => {
    if (!room) return;
    setGroupBusy(true);
    setGroupMessage(null);
    try {
      await leaveRoom(room.id);
      resetGroupState();
      setGroupMessage(t('group.left'));
    } catch (error) {
      setGroupMessage(withAuthError(error));
    } finally {
      setGroupBusy(false);
    }
  };

  const onEndGroup = async () => {
    if (!room) return;
    setGroupBusy(true);
    setGroupMessage(null);
    try {
      const next = await endRoom(room.id);
      setRoom(next);
      disconnectRoomSocket();
      groupStartRef.current = false;
      setGroupMessage(t('group.ended'));
    } catch (error) {
      setGroupMessage(withAuthError(error));
    } finally {
      setGroupBusy(false);
    }
  };

  const onLogin = async (email: string, password: string) => {
    setAuthBusy(true);
    setAuthMessage(null);
    try {
      const res = await apiLogin(email, password);
      setUser(res.user);
      setAuthMessage(t('auth.loggedIn'));
    } catch (error) {
      setAuthMessage(withAuthError(error));
    } finally {
      setAuthBusy(false);
    }
  };

  const onRegister = async (email: string, password: string, displayName: string) => {
    setAuthBusy(true);
    setAuthMessage(null);
    try {
      const res = await apiRegister(email, password, displayName || undefined);
      setUser(res.user);
      setAuthMessage(t('auth.accountCreated'));
    } catch (error) {
      setAuthMessage(withAuthError(error));
    } finally {
      setAuthBusy(false);
    }
  };

  const onLogout = async () => {
    setAuthBusy(true);
    setAuthMessage(null);
    try {
      if (roomRef.current && roomRef.current.status !== 'ended') {
        try {
          await leaveRoom(roomRef.current.id);
        } catch {
          // ignore leave errors on logout
        }
      }
      resetGroupState();
      await apiLogout();
      setUser(null);
      setAuthMessage(t('auth.loggedOut'));
    } catch (error) {
      setStoredToken(null);
      setUser(null);
      resetGroupState();
      setAuthMessage(withAuthError(error));
    } finally {
      setAuthBusy(false);
    }
  };

  const onSaveProfile = async (fields: {
    displayName: string;
    weightKg: string;
    ftp: string;
    bikeWeightKg: string;
  }) => {
    setAuthBusy(true);
    setAuthMessage(null);
    try {
      const parseNum = (raw: string): number | null => {
        if (!raw.trim()) return null;
        const n = Number(raw);
        return Number.isFinite(n) ? n : null;
      };
      const parseIntOrNull = (raw: string): number | null => {
        if (!raw.trim()) return null;
        const n = Number(raw);
        return Number.isInteger(n) ? n : null;
      };
      const next = await updateProfile({
        displayName: fields.displayName.trim() || null,
        weightKg: parseNum(fields.weightKg),
        ftp: parseIntOrNull(fields.ftp),
        bikeWeightKg: parseNum(fields.bikeWeightKg),
      });
      setUser(next);
      setAuthMessage(t('auth.profileSaved'));
    } catch (error) {
      setAuthMessage(withAuthError(error));
    } finally {
      setAuthBusy(false);
    }
  };

  const onSaveToProfile = async () => {
    const ride = engineRef.current.getExport();
    if (!ride || ride.points.length === 0) {
      setSaveMessage(t('route.noSave'));
      return;
    }
    if (!user) {
      setSaveMessage(t('route.loginToSave'));
      return;
    }
    if (savedRideId != null) {
      setSaveMessage(t('route.alreadySaved'));
      return;
    }

    setSaveBusy(true);
    setSaveMessage(null);
    try {
      const powers = ride.points.map((p) => p.powerWatts).filter((v) => v > 0);
      const hrs = ride.points
        .map((p) => p.heartRateBpm)
        .filter((v): v is number => v != null && v > 0);
      const speeds = ride.points.map((p) => p.speedKmh).filter((v) => v > 0);
      const km = (ride.distanceMeters / 1000).toFixed(1);
      const routeLabel = `A→B · ${km} km`;
      const avgPower = avg(powers);
      const maxPower = maxOf(powers);
      const avgHr = avg(hrs);
      const maxHr = maxOf(hrs);
      const avgSpeed = avg(speeds);
      const maxSpeed = maxOf(speeds);

      const saved = await saveRide({
        routeName: routeLabel,
        startedAt: new Date(ride.startedAtMs).toISOString(),
        endedAt: new Date(ride.finishedAtMs).toISOString(),
        distanceM: ride.distanceMeters,
        durationS: Math.round(ride.elapsedSeconds),
        avgPower: avgPower != null ? Math.round(avgPower) : null,
        maxPower: maxPower != null ? Math.round(maxPower) : null,
        avgHr: avgHr != null ? Math.round(avgHr) : null,
        maxHr: maxHr != null ? Math.round(maxHr) : null,
        avgSpeedKmh: avgSpeed != null ? Math.round(avgSpeed * 10) / 10 : null,
        maxSpeedKmh: maxSpeed != null ? Math.round(maxSpeed * 10) / 10 : null,
        elevationGainM: elevationGainMeters(ride.points),
      });
      setSavedRideId(saved.id);
      setRideHistoryRevision((n) => n + 1);
      setSaveMessage(t('route.saved', { id: saved.id }));
    } catch (error) {
      setSaveMessage(withAuthError(error));
    } finally {
      setSaveBusy(false);
    }
  };

  const canSaveToProfile = Boolean(user && isCloudApiEnabled() && savedRideId == null);
  const ftpWatts = user?.profile?.ftp && user.profile.ftp > 0 ? user.profile.ftp : 250;

  const mapPeers: MapPeer[] = useMemo(() => {
    if (!user || !groupMode) return [];
    return peers
      .filter(
        (p) =>
          p.userId !== user.id &&
          p.lat != null &&
          p.lng != null &&
          Number.isFinite(p.lat) &&
          Number.isFinite(p.lng),
      )
      .map((p) => ({
        userId: p.userId,
        displayName: p.displayName,
        position: { lat: p.lat as number, lng: p.lng as number },
      }));
  }, [groupMode, peers, user]);

  const hideSoloStart = Boolean(room && room.status === 'lobby');

  const elevByAlternative = useMemo(() => {
    const out: Record<number, { elevGainMeters: number; elevLossMeters: number }> =
      {};
    for (const [key, enriched] of Object.entries(enrichedByAlt)) {
      out[Number(key)] = {
        elevGainMeters: enriched.elevGainMeters,
        elevLossMeters: enriched.elevLossMeters,
      };
    }
    return out;
  }, [enrichedByAlt]);

  const showRoutePanel = !immersiveRide || routePeekOpen;
  const toggleVideoPanel = () => setVideoPanelOpen((open) => !open);
  const followRoad =
    telemetry.phase === 'riding' || telemetry.phase === 'paused';
  const showMapStylePicker = !followRoad;
  const onMapStyleChange = (id: MapStyleId) => {
    storeMapStyleId(id);
    setMapStyleId(id);
  };

  const shellClass = [
    'app-shell',
    panelOpen ? 'panel-open' : '',
    immersiveRide ? 'app-shell-immersive' : '',
    videoPanelOpen ? 'app-shell-video' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={shellClass} data-phase={telemetry.phase}>
      <button
        type="button"
        className="shell-backdrop"
        aria-label={t('shell.closeControls')}
        tabIndex={panelOpen ? 0 : -1}
        onClick={closePanel}
      />

      <header className="mobile-chrome">
        {panelOpen ? (
          <button
            type="button"
            className="btn btn-secondary mobile-chrome-btn"
            aria-expanded={true}
            aria-controls="connection-panel"
            onClick={closePanel}
          >
            {t('shell.close')}
          </button>
        ) : (
          <span className="mobile-chrome-spacer" aria-hidden="true" />
        )}
        <div className="mobile-chrome-brand">
          <span className="brand-mark">ROADLAB</span>
          <div className="live-pill" data-phase={telemetry.phase}>
            <span className="live-dot" />
            {rideLabel}
          </div>
        </div>
        <button
          type="button"
          className="btn btn-ghost mobile-chrome-btn"
          onClick={onOpenAccount}
        >
          {t('shell.account')}
        </button>
      </header>

      {!panelOpen && (
        <div className="shell-map-chrome" role="group" aria-label={t('shell.controls')}>
          <button
            type="button"
            className="shell-open-panel-btn"
            aria-expanded={false}
            aria-controls="connection-panel"
            aria-label={t('shell.menu')}
            onClick={openPanel}
          >
            <Menu className="icon-sm" aria-hidden="true" />
            <span>{t('shell.menu')}</span>
          </button>
          <div className="shell-chrome-chips" role="group">
            <div className="live-pill shell-chrome-status" data-phase={telemetry.phase}>
              <span className="live-dot" />
              {rideLabel}
            </div>
            {showMapStylePicker && (
              <MapStylePicker
                className="shell-chrome-styles"
                styleId={mapStyleId}
                onChange={onMapStyleChange}
              />
            )}
          </div>
        </div>
      )}

      <ConnectionPanel
        devicesEnabled={canUseDevices}
        deviceGateMessage={deviceGateMessage}
        trainerState={trainerState}
        trainerName={trainerName}
        trainerErrorMessage={trainerErrorMessage}
        hrState={hrState}
        hrName={hrName}
        hrErrorMessage={hrErrorMessage}
        hrBpm={hrBpm}
        usingMock={usingMock}
        wifiMessage={t(wifiCode)}
        mockEffort={mockEffort}
        ftpWatts={ftpWatts}
        powerMode={telemetry.powerMode}
        targetPowerWatts={telemetry.targetPowerWatts}
        supportsTargetPower={telemetry.supportsTargetPower}
        ergHardwareActive={telemetry.ergHardwareActive}
        onConnectTrainer={() => void connectFtms()}
        onDisconnectTrainer={() => void disconnectTrainer()}
        onUseMock={() => void enableMockTrainer()}
        onConnectHr={() => void connectHr()}
        onDisconnectHr={() => void disconnectHr()}
        onProbeWifi={() => void onProbeWifi()}
        onMockEffort={setMockEffort}
        onPowerModeChange={onPowerModeChange}
        onTargetPowerChange={onTargetPowerChange}
        onOpenAccount={onOpenAccount}
        onClosePanel={closePanel}
      >
        <AuthPanel
          user={user}
          busy={authBusy}
          message={authMessage}
          historyRevision={rideHistoryRevision}
          onLogin={onLogin}
          onRegister={onRegister}
          onLogout={onLogout}
          onSaveProfile={onSaveProfile}
        />
        <GroupRidePanel
          cloudEnabled={cloudEnabled}
          userId={user?.id ?? null}
          room={room}
          joinCode={joinCode}
          busy={groupBusy}
          message={groupMessage}
          canCreate={Boolean(route && user)}
          routePending={Boolean(!route && (loadingRoute || elevatingAlt))}
          onJoinCodeChange={setJoinCode}
          onCreate={() => void onCreateRoom()}
          onJoin={() => void onJoinRoom()}
          onStart={() => void onStartGroup()}
          onLeave={() => void onLeaveGroup()}
          onEnd={() => void onEndGroup()}
        />
      </ConnectionPanel>

      <main className="main-stage" id="ride-viewer" tabIndex={-1}>
        <div className="stage-top">
          {panelOpen && (
            <div className="live-pill stage-live-pill" data-phase={telemetry.phase}>
              <span className="live-dot" />
              {rideLabel}
            </div>
          )}
          {immersiveRide && (
            <RideChrome
              phase={telemetry.phase}
              routePeekOpen={routePeekOpen}
              videoPanelOpen={videoPanelOpen}
              onPause={() => void engineRef.current.pause()}
              onResume={() => void engineRef.current.resume()}
              onStop={() => void engineRef.current.stop()}
              onToggleRoutePeek={() => setRoutePeekOpen((open) => !open)}
              onToggleVideo={toggleVideoPanel}
            />
          )}
          {showRoutePanel && (
            <RouteControls
              waypoints={waypoints}
              pickMode={pickMode}
              route={route}
              routeAlternatives={routeAlternatives}
              selectedAlternativeIndex={selectedAltIndex}
              elevByAlternative={elevByAlternative}
              elevatingAlternative={elevatingAlt}
              onSelectAlternative={onSelectAlternative}
              loading={loadingRoute}
              error={routeError}
              phase={telemetry.phase}
              hasExport={telemetry.hasExport}
              completedDistanceMeters={telemetry.distanceMeters}
              completedElapsedSeconds={telemetry.elapsedSeconds}
              routePlanningEnabled={canPlanRoute && !inGroup}
              gateMessage={gateMessage}
              isRoundTrip={isRoundTrip}
              onOpenAccount={onOpenAccount}
              onSetPickMode={onSetPickMode}
              onAddWaypoint={addWaypoint}
              onRemoveLastWaypoint={removeLastWaypoint}
              onToggleRoundTrip={(nextRoundTrip) => {
                setIsRoundTrip(nextRoundTrip);
                if (canBuildRoute(waypoints)) void buildRoute(nextRoundTrip);
              }}
              onBuildRoute={() => void buildRoute()}
              onClear={() => void clearRoute()}
              onStart={() => void engineRef.current.start()}
              onPause={() => void engineRef.current.pause()}
              onResume={() => void engineRef.current.resume()}
              onStop={() => void engineRef.current.stop()}
              onDownloadFit={onDownloadFit}
              onDownloadGpx={onDownloadGpx}
              canSaveToProfile={canSaveToProfile}
              saveBusy={saveBusy}
              saveMessage={saveMessage}
              onSaveToProfile={() => void onSaveToProfile()}
              hideStart={hideSoloStart}
              onSelectPresetRoute={(pts) => void handleSelectPreset(pts)}
              videoPanelOpen={videoPanelOpen}
              onToggleVideoPanel={toggleVideoPanel}
              hideRideActions={immersiveRide}
            />
          )}
        </div>

        <div
          className={['viewer-stage', videoPanelOpen ? 'viewer-stage-split' : '']
            .filter(Boolean)
            .join(' ')}
        >
          <div className="viewer-map-pane">
            <RouteMap
              waypoints={waypoints}
              nextWaypointLabel={
                canAddWaypoint(waypoints.length)
                  ? nextWaypointLabel(waypoints.length)
                  : null
              }
              route={route}
              routeAlternatives={routeAlternatives}
              selectedAlternativeIndex={selectedAltIndex}
              onSelectAlternative={
                canPlanRoute && !inGroup ? onSelectAlternative : undefined
              }
              rider={telemetry.position}
              ridePhase={telemetry.phase}
              distanceMeters={telemetry.distanceMeters}
              onPick={onPick}
              pickMode={pickMode}
              pickingEnabled={canPlanRoute && !inGroup}
              peers={mapPeers}
              groupMode={groupMode}
              styleId={mapStyleId}
              onStyleIdChange={onMapStyleChange}
              showStylePicker={panelOpen && showMapStylePicker}
            />
            {immersiveRide && (
              <div className="bottom-dashboard-deck">
                <ElevationProfile
                  route={route}
                  currentDistanceMeters={telemetry.distanceMeters}
                  currentElevationMeters={telemetry.elevationMeters}
                />
                <RideHUD
                  telemetry={telemetry}
                  riderWeightKg={user?.profile?.weightKg ?? 75}
                  ftpWatts={ftpWatts}
                />
              </div>
            )}
          </div>
          <VideoPanel
            enabled={videoPanelOpen}
            url={youtubeUrl}
            onUrlChange={setYoutubeUrl}
          />
        </div>

        <footer className="app-footer">
          <span>{t('footer.protocols')}</span>
          <span>{t('footer.test')}</span>
        </footer>
      </main>
    </div>
  );
}
