import type { ConnectionState } from '../bluetooth/types';
import { getBluetoothSupportMessage, isWebBluetoothSupported } from '../bluetooth/webBluetooth';

type Props = {
  trainerState: ConnectionState;
  trainerName: string;
  hrState: ConnectionState;
  hrName: string;
  hrBpm: number | null;
  usingMock: boolean;
  wifiMessage: string;
  mockEffort: number;
  onConnectTrainer: () => void;
  onDisconnectTrainer: () => void;
  onUseMock: () => void;
  onConnectHr: () => void;
  onDisconnectHr: () => void;
  onProbeWifi: () => void;
  onMockEffort: (value: number) => void;
};

function StatusDot({ state }: { state: ConnectionState }) {
  return <span className={`status-dot status-${state}`} title={state} />;
}

export function ConnectionPanel({
  trainerState,
  trainerName,
  hrState,
  hrName,
  hrBpm,
  usingMock,
  wifiMessage,
  mockEffort,
  onConnectTrainer,
  onDisconnectTrainer,
  onUseMock,
  onConnectHr,
  onDisconnectHr,
  onProbeWifi,
  onMockEffort,
}: Props) {
  const btOk = isWebBluetoothSupported();

  return (
    <aside className="connection-panel">
      <header className="panel-header">
        <p className="brand-mark">ROADLAB</p>
        <h1>Indoor Road Ride</h1>
        <p className="panel-sub">
          Free Zwift-style trainer — FTMS Bluetooth, real-road routes, elevation resistance.
        </p>
      </header>

      <div className="support-card">
        <strong>Browser</strong>
        <p>{getBluetoothSupportMessage()}</p>
      </div>

      <section className="device-card">
        <div className="device-card-head">
          <StatusDot state={trainerState} />
          <div>
            <h2>Bike trainer</h2>
            <p>
              {usingMock ? 'Demo Trainer (Mock)' : trainerName} · {trainerState}
            </p>
          </div>
        </div>
        <div className="btn-row">
          {trainerState === 'connected' ? (
            <button type="button" className="btn btn-ghost" onClick={onDisconnectTrainer}>
              Disconnect
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              onClick={onConnectTrainer}
              disabled={!btOk || trainerState === 'connecting'}
            >
              {trainerState === 'connecting' ? 'Connecting…' : 'Connect FTMS'}
            </button>
          )}
          <button type="button" className="btn btn-secondary" onClick={onUseMock}>
            Use demo trainer
          </button>
        </div>
        {usingMock && (
          <label className="effort-slider">
            <span>Demo effort</span>
            <input
              type="range"
              min={0.3}
              max={1}
              step={0.01}
              value={mockEffort}
              onChange={(e) => onMockEffort(Number(e.target.value))}
            />
          </label>
        )}
      </section>

      <section className="device-card">
        <div className="device-card-head">
          <StatusDot state={hrState} />
          <div>
            <h2>Heart rate</h2>
            <p>
              {hrName} · {hrState}
              {hrBpm != null ? ` · ${hrBpm} bpm` : ''}
            </p>
          </div>
        </div>
        <div className="btn-row">
          {hrState === 'connected' ? (
            <button type="button" className="btn btn-ghost" onClick={onDisconnectHr}>
              Disconnect HR
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onConnectHr}
              disabled={!btOk || hrState === 'connecting'}
            >
              {hrState === 'connecting' ? 'Connecting…' : 'Connect HR strap'}
            </button>
          )}
        </div>
      </section>

      <section className="device-card device-card-muted">
        <h2>WiFi / ANT+</h2>
        <p>{wifiMessage}</p>
        <button type="button" className="btn btn-ghost" onClick={onProbeWifi}>
          Probe local bridge
        </button>
      </section>
    </aside>
  );
}
