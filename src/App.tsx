import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FtmsTrainer } from './bluetooth/ftms';
import { HeartRateMonitor } from './bluetooth/heartRate';
import { MockTrainer } from './bluetooth/mockTrainer';
import type { BikeTrainer, ConnectionState } from './bluetooth/types';
import { probeWifiBridge } from './bluetooth/wifiBridge';
import { enrichRouteWithElevation } from './elevation/service';
import { RouteMap } from './map/RouteMap';
import { fetchRoute } from './routing/osrm';
import type { EnrichedRoute, LatLng } from './routing/types';
import { RideEngine, type RideTelemetry } from './simulation/rideEngine';
import { ConnectionPanel } from './ui/ConnectionPanel';
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
};

export default function App() {
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
  const [wifiMessage, setWifiMessage] = useState(
    'WiFi/ANT+ trainers need a local bridge (browser sandbox). Bluetooth FTMS works natively in Chrome/Edge.',
  );

  const [pointA, setPointA] = useState<LatLng | null>(null);
  const [pointB, setPointB] = useState<LatLng | null>(null);
  const [pickMode, setPickMode] = useState<'A' | 'B' | null>('A');
  const [route, setRoute] = useState<EnrichedRoute | null>(null);
  const [loadingRoute, setLoadingRoute] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [telemetry, setTelemetry] = useState<RideTelemetry>(idleTelemetry);

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
      setRouteError(error instanceof Error ? error.message : 'Trainer connection failed');
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
      setRouteError(error instanceof Error ? error.message : 'Mock trainer failed');
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
    setTrainerName('FTMS Trainer');
  };

  const connectHr = async () => {
    try {
      setRouteError(null);
      await hrRef.current.connect();
    } catch (error) {
      setRouteError(error instanceof Error ? error.message : 'HR connection failed');
    }
  };

  const disconnectHr = async () => {
    await hrRef.current.disconnect();
    setHrBpm(null);
    engineRef.current.setHeartRate(null);
  };

  const onPick = useCallback(
    (point: LatLng) => {
      if (pickMode === 'A') {
        setPointA(point);
        setPickMode(pointB ? null : 'B');
      } else if (pickMode === 'B') {
        setPointB(point);
        setPickMode(null);
      }
    },
    [pickMode, pointB],
  );

  const buildRoute = async () => {
    if (!pointA || !pointB) return;
    setLoadingRoute(true);
    setRouteError(null);
    try {
      const base = await fetchRoute(pointA, pointB);
      const enriched = await enrichRouteWithElevation(base);
      setRoute(enriched);
      engineRef.current.setRoute(enriched);
    } catch (error) {
      setRouteError(error instanceof Error ? error.message : 'Route build failed');
    } finally {
      setLoadingRoute(false);
    }
  };

  const clearRoute = async () => {
    await engineRef.current.stop();
    setRoute(null);
    setPointA(null);
    setPointB(null);
    setPickMode('A');
    engineRef.current.setRoute(null);
    setTelemetry(idleTelemetry);
  };

  const onProbeWifi = async () => {
    const status = await probeWifiBridge();
    setWifiMessage(status.message);
  };

  const rideLabel = useMemo(() => {
    if (telemetry.phase === 'riding') return 'LIVE';
    if (telemetry.phase === 'paused') return 'PAUSED';
    if (telemetry.phase === 'finished') return 'FINISH';
    if (telemetry.phase === 'ready') return 'READY';
    return 'IDLE';
  }, [telemetry.phase]);

  return (
    <div className="app-shell">
      <ConnectionPanel
        trainerState={trainerState}
        trainerName={trainerName}
        hrState={hrState}
        hrName={hrName}
        hrBpm={hrBpm}
        usingMock={usingMock}
        wifiMessage={wifiMessage}
        mockEffort={mockEffort}
        onConnectTrainer={() => void connectFtms()}
        onDisconnectTrainer={() => void disconnectTrainer()}
        onUseMock={() => void useMock()}
        onConnectHr={() => void connectHr()}
        onDisconnectHr={() => void disconnectHr()}
        onProbeWifi={() => void onProbeWifi()}
        onMockEffort={setMockEffort}
      />

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
            onSetPickMode={setPickMode}
            onBuildRoute={() => void buildRoute()}
            onClear={() => void clearRoute()}
            onStart={() => void engineRef.current.start()}
            onPause={() => void engineRef.current.pause()}
            onResume={() => void engineRef.current.resume()}
            onStop={() => void engineRef.current.stop()}
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
        />

        <RideHUD telemetry={telemetry} />

        <footer className="app-footer">
          <span>
            Protocols: FTMS (0x1826) · HR (0x180D) · OSRM · OpenTopoData · MapLibre /
            OpenFreeMap · Mapillary
          </span>
          <span>
            Test: Chrome/Edge + FTMS trainer · Demo trainer works without hardware · iOS Safari: no
            Web Bluetooth
          </span>
        </footer>
      </main>
    </div>
  );
}
