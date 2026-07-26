import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { buildFit, buildGpx, downloadRideFit, downloadRideGpx } from './export';
import { useT, type MessageKey } from './i18n';
import { RouteMap, type MapPeer } from './map/RouteMap';
import { parseRoomRoute } from './routing/fromRoomRoute';
import { fetchRoute } from './routing/osrm';
import type { EnrichedRoute, LatLng } from './routing/types';
import { RideEngine, type RideTelemetry } from './simulation/rideEngine';
import { AuthPanel } from './ui/AuthPanel';
import { ConnectionPanel } from './ui/ConnectionPanel';
import { GroupRidePanel } from './ui/GroupRidePanel';
import { RideHUD } from './ui/RideHUD';
import { RouteControls } from './ui/RouteControls';

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
  hasExport: false,
};

function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
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
  const [hrState, setHrState] = useState<ConnectionState>('disconnected');
  const [hrName, setHrName] = useState('Heart Rate');
  const [hrBpm, setHrBpm] = useState<number | null>(null);
  const [mockEffort, setMockEffort] = useState(0.72);
  const [wifiCode, setWifiCode] = useState<MessageKey>('wifi.default');

  const [pointA, setPointA] = useState<LatLng | null>(null);
  const [pointB, setPointB] = useState<LatLng | null>(null);
  const [pickMode, setPickMode] = useState<'A' | 'B' | null>(null);
  const [route, setRoute] = useState<EnrichedRoute | null>(null);
  const [loadingRoute, setLoadingRoute] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [telemetry, setTelemetry] = useState<RideTelemetry>(idleTelemetry);

  const [user, setUser] = useState<User | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [savedRideId, setSavedRideId] = useState<number | null>(null);

  const [room, setRoom] = useState<Room | null>(null);
  const [peers, setPeers] = useState<PeerRider[]>([]);
  const [joinCode, setJoinCode] = useState('');
  const [groupBusy, setGroupBusy] = useState(false);
  const [groupMessage, setGroupMessage] = useState<string | null>(null);
  const roomSocketRef = useRef<RoomSocket | null>(null);
  const roomRef = useRef<Room | null>(null);
  const groupStartRef = useRef(false);
  const telemetryPhaseRef = useRef(idleTelemetry.phase);

  const cloudEnabled = isCloudApiEnabled();
  const canPlanRoute = Boolean(cloudEnabled && user);
  const inGroup = Boolean(room && room.status !== 'ended');
  const groupMode = inGroup;

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
    const offConn = hr.onConnection((state) => {
      setHrState(state);
      setHrName(hr.name);
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
    if (!canPlanRoute) {
      setPickMode(null);
      return;
    }
    setPickMode((prev) => prev ?? 'A');
  }, [canPlanRoute]);

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
      setRoute(parsed);
      engineRef.current.setRoute(parsed);
      const first = parsed.coordinates[0] ?? null;
      const last = parsed.coordinates[parsed.coordinates.length - 1] ?? null;
      setPointA(first);
      setPointB(last);
      setPickMode(null);
      setRouteError(null);
      return true;
    },
    [t],
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
    trainerUnsubRef.current = next.onConnection((state) => {
      setTrainerState(state);
      setTrainerName(next.name);
    });
  }, []);

  const connectFtms = async () => {
    try {
      setRouteError(null);
      if (usingMock && mockRef.current.getState() === 'connected') {
        await mockRef.current.disconnect();
      }
      const ftms = new FtmsTrainer();
      attachTrainer(ftms, false);
      await ftms.connect();
    } catch (error) {
      setRouteError(error instanceof Error ? error.message : t('trainer.connectFailed'));
    }
  };

  const useMock = async () => {
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
  };

  const connectHr = async () => {
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
  };

  const onPick = useCallback(
    (point: LatLng) => {
      if (!canPlanRoute) return;
      if (pickMode === 'A') {
        setPointA(point);
        setPickMode(pointB ? null : 'B');
      } else if (pickMode === 'B') {
        setPointB(point);
        setPickMode(null);
      }
    },
    [canPlanRoute, pickMode, pointB],
  );

  const onSetPickMode = useCallback(
    (mode: 'A' | 'B' | null) => {
      if (!canPlanRoute) return;
      setPickMode(mode);
    },
    [canPlanRoute],
  );

  const buildRoute = async () => {
    if (!canPlanRoute || !pointA || !pointB) return;
    setLoadingRoute(true);
    setRouteError(null);
    try {
      const base = await fetchRoute(pointA, pointB);
      const enriched = await enrichRouteWithElevation(base);
      setRoute(enriched);
      engineRef.current.setRoute(enriched);
    } catch (error) {
      setRouteError(error instanceof Error ? error.message : t('route.buildFailed'));
    } finally {
      setLoadingRoute(false);
    }
  };

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
    setRoute(null);
    setPointA(null);
    setPointB(null);
    setPickMode(canPlanRoute ? 'A' : null);
    engineRef.current.setRoute(null);
    setTelemetry(idleTelemetry);
    setSavedRideId(null);
    setSaveMessage(null);
  };

  const onProbeWifi = async () => {
    const status = await probeWifiBridge();
    setWifiCode(status.code);
  };

  const onOpenAccount = () => {
    document.getElementById('account-panel')?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
    });
  };

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
    if (!user || !route) return;
    setGroupBusy(true);
    setGroupMessage(null);
    try {
      const created = await createRoom(route);
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
    if (!user) return;
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
      const fitBytes = buildFit(ride);
      const gpxText = buildGpx(ride);
      const fitCopy = new Uint8Array(fitBytes.byteLength);
      fitCopy.set(fitBytes);
      const fitBlob = new Blob([fitCopy], { type: 'application/octet-stream' });
      const gpxBlob = new Blob([gpxText], { type: 'application/gpx+xml' });

      const km = (ride.distanceMeters / 1000).toFixed(1);
      const saved = await saveRide({
        routeName: `ROADLAB ${km} km`,
        startedAt: new Date(ride.startedAtMs).toISOString(),
        endedAt: new Date(ride.finishedAtMs).toISOString(),
        distanceM: ride.distanceMeters,
        durationS: Math.round(ride.elapsedSeconds),
        avgPower: avg(powers),
        avgHr: avg(hrs),
        fit: fitBlob,
        gpx: gpxBlob,
      });
      setSavedRideId(saved.id);
      setSaveMessage(t('route.saved', { id: saved.id }));
    } catch (error) {
      setSaveMessage(withAuthError(error));
    } finally {
      setSaveBusy(false);
    }
  };

  const canSaveToProfile = Boolean(user && isCloudApiEnabled() && savedRideId == null);

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

  return (
    <div className="app-shell">
      <ConnectionPanel
        trainerState={trainerState}
        trainerName={trainerName}
        hrState={hrState}
        hrName={hrName}
        hrBpm={hrBpm}
        usingMock={usingMock}
        wifiMessage={t(wifiCode)}
        mockEffort={mockEffort}
        onConnectTrainer={() => void connectFtms()}
        onDisconnectTrainer={() => void disconnectTrainer()}
        onUseMock={() => void useMock()}
        onConnectHr={() => void connectHr()}
        onDisconnectHr={() => void disconnectHr()}
        onProbeWifi={() => void onProbeWifi()}
        onMockEffort={setMockEffort}
      >
        <AuthPanel
          user={user}
          busy={authBusy}
          message={authMessage}
          onLogin={onLogin}
          onRegister={onRegister}
          onLogout={onLogout}
          onSaveProfile={onSaveProfile}
        />
        <GroupRidePanel
          enabled={Boolean(cloudEnabled && user)}
          userId={user?.id ?? null}
          room={room}
          joinCode={joinCode}
          busy={groupBusy}
          message={groupMessage}
          canCreate={Boolean(route && user)}
          onJoinCodeChange={setJoinCode}
          onCreate={() => void onCreateRoom()}
          onJoin={() => void onJoinRoom()}
          onStart={() => void onStartGroup()}
          onLeave={() => void onLeaveGroup()}
          onEnd={() => void onEndGroup()}
        />
      </ConnectionPanel>

      <main className="main-stage">
        <div className="stage-top">
          <div className="live-pill" data-phase={telemetry.phase}>
            <span className="live-dot" />
            {rideLabel}
          </div>
          <RouteControls
            pointA={pointA}
            pointB={pointB}
            pickMode={pickMode}
            route={route}
            loading={loadingRoute}
            error={routeError}
            phase={telemetry.phase}
            hasExport={telemetry.hasExport}
            completedDistanceMeters={telemetry.distanceMeters}
            completedElapsedSeconds={telemetry.elapsedSeconds}
            routePlanningEnabled={canPlanRoute && !inGroup}
            gateMessage={gateMessage}
            onOpenAccount={onOpenAccount}
            onSetPickMode={onSetPickMode}
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
          />
        </div>

        <RouteMap
          pointA={pointA}
          pointB={pointB}
          route={route}
          rider={telemetry.position}
          ridePhase={telemetry.phase}
          distanceMeters={telemetry.distanceMeters}
          onPick={onPick}
          pickMode={pickMode}
          pickingEnabled={canPlanRoute && !inGroup}
          peers={mapPeers}
          groupMode={groupMode}
        />

        <RideHUD telemetry={telemetry} />

        <footer className="app-footer">
          <span>{t('footer.protocols')}</span>
          <span>{t('footer.test')}</span>
        </footer>
      </main>
    </div>
  );
}
