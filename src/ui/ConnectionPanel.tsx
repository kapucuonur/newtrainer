import { useState, type ReactNode } from 'react';
import type { ConnectionState } from '../bluetooth/types';
import {
  describeBluetoothError,
  getBluetoothSupportCode,
  isWebBluetoothSupported,
} from '../bluetooth/webBluetooth';
import { useT } from '../i18n';
import type { MessageKey } from '../i18n';
import { LanguageSwitcher } from './LanguageSwitcher';
import {
  Bluetooth,
  Wifi,
  Heart,
  Sliders,
  X,
  ShieldCheck,
  Zap,
  Radio,
} from 'lucide-react';

type Props = {
  devicesEnabled: boolean;
  deviceGateMessage: string | null;
  trainerState: ConnectionState;
  trainerName: string;
  trainerErrorMessage: string | null;
  hrState: ConnectionState;
  hrName: string;
  hrErrorMessage: string | null;
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
  onOpenAccount: () => void;
  onClosePanel?: () => void;
  children?: ReactNode;
};

const CONN_KEYS: Record<ConnectionState, MessageKey> = {
  unsupported: 'conn.unsupported',
  disconnected: 'conn.disconnected',
  connecting: 'conn.connecting',
  connected: 'conn.connected',
  error: 'conn.error',
};

function StatusDot({ state }: { state: ConnectionState }) {
  return <span className={`status-dot status-${state}`} title={state} />;
}

export function ConnectionPanel({
  devicesEnabled,
  deviceGateMessage,
  trainerState,
  trainerName,
  trainerErrorMessage,
  hrState,
  hrName,
  hrErrorMessage,
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
  onOpenAccount,
  onClosePanel,
  children,
}: Props) {
  const t = useT();
  const btOk = isWebBluetoothSupported();
  const trainerLabel = usingMock ? t('trainer.demoName') : trainerName;
  const trainerStatus = t(CONN_KEYS[trainerState]);
  const hrStatus = t(CONN_KEYS[hrState]);
  const [debugResult, setDebugResult] = useState<string | null>(null);
  const [debugBusy, setDebugBusy] = useState(false);

  const runBareBluetoothTest = async () => {
    setDebugBusy(true);
    setDebugResult(null);
    try {
      const device = await navigator.bluetooth!.requestDevice({ acceptAllDevices: true });
      setDebugResult(`OK: picker opened, chose "${device.name ?? device.id}"`);
    } catch (error) {
      setDebugResult(`FAIL: ${describeBluetoothError(error)}`);
    } finally {
      setDebugBusy(false);
    }
  };

  return (
    <aside className="connection-panel" id="connection-panel" aria-label={t('shell.controls')}>
      <div className="panel-sheet-handle" aria-hidden="true" />

      <header className="panel-header">
        <div className="panel-header-row">
          <div className="brand-badge">
            <Zap className="icon-sm icon-accent" />
            <span className="brand-mark">ROADLAB</span>
            <span className="brand-tag">PRO</span>
          </div>
          {onClosePanel ? (
            <button
              type="button"
              className="btn btn-ghost panel-close-btn"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onClosePanel();
              }}
              aria-label={t('shell.closeControls')}
            >
              <X className="icon-xs" />
              {t('shell.close')}
            </button>
          ) : null}
        </div>
        <h1>{t('app.title')}</h1>
        <p className="panel-sub">{t('app.subtitle')}</p>
        <LanguageSwitcher />
      </header>

      <div className="support-card">
        <ShieldCheck className="icon-sm icon-ok" />
        <div>
          <strong>{t('browser.title')}</strong>
          <p>{t(getBluetoothSupportCode())}</p>
        </div>
      </div>

      {btOk && (
        <div className="support-card">
          <Bluetooth className="icon-sm icon-accent" />
          <div>
            <strong>Debug: bare Bluetooth test</strong>
            <p>Opens the picker with no filters — isolates whether requestDevice() itself works here.</p>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={debugBusy}
              onClick={() => void runBareBluetoothTest()}
            >
              {debugBusy ? '…' : 'Run test'}
            </button>
            {debugResult && <p className="device-error-text">{debugResult}</p>}
          </div>
        </div>
      )}

      {deviceGateMessage && (
        <div className="auth-gate-banner" role="status">
          <p>{deviceGateMessage}</p>
          <button type="button" className="btn btn-accent" onClick={onOpenAccount}>
            {t('route.gateCta')}
          </button>
        </div>
      )}

      {/* Hardware Device Section */}
      <section className="device-section">
        <h2>
          <Radio className="icon-xs" />
          Hardware & Sensors
        </h2>

        {/* FTMS Smart Trainer Card */}
        <article className="device-card">
          <div className="device-card-head">
            <div className="device-title">
              <Bluetooth className="icon-sm icon-accent" />
              <div>
                <h3>{t('trainer.title')}</h3>
                <p className="device-name">{trainerLabel}</p>
              </div>
            </div>
            <StatusDot state={usingMock ? 'connected' : trainerState} />
          </div>

          <div className="device-status-row">
            <span className="status-label">{trainerStatus}</span>
          </div>

          {trainerState === 'error' && trainerErrorMessage && (
            <p className="device-error-text">{trainerErrorMessage}</p>
          )}

          <div className="btn-row">
            {trainerState === 'connected' && !usingMock ? (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={onDisconnectTrainer}
              >
                {t('trainer.disconnect')}
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={!devicesEnabled || !btOk || trainerState === 'connecting'}
                onClick={onConnectTrainer}
              >
                {trainerState === 'connecting' ? t('trainer.connecting') : t('trainer.connect')}
              </button>
            )}

            <button
              type="button"
              className={`btn btn-sm ${usingMock ? 'btn-accent' : 'btn-ghost'}`}
              disabled={!devicesEnabled}
              onClick={onUseMock}
            >
              {t('trainer.useDemo')}
            </button>
          </div>

          {usingMock && (
            <div className="mock-control">
              <label htmlFor="mock-effort-slider">
                <Sliders className="icon-xs" />
                {t('trainer.demoEffort')} ({ (mockEffort * 100).toFixed(0) }%)
              </label>
              <input
                id="mock-effort-slider"
                type="range"
                min="0.3"
                max="1.5"
                step="0.05"
                value={mockEffort}
                onChange={(e) => onMockEffort(Number.parseFloat(e.target.value))}
              />
            </div>
          )}
        </article>

        {/* Heart Rate Monitor Card */}
        <article className="device-card">
          <div className="device-card-head">
            <div className="device-title">
              <Heart className="icon-sm icon-heart" />
              <div>
                <h3>{t('hr.title')}</h3>
                <p className="device-name">{hrName}</p>
              </div>
            </div>
            <StatusDot state={hrState} />
          </div>

          <div className="device-status-row">
            <span className="status-label">
              {hrStatus} {hrBpm != null ? `(${hrBpm} bpm)` : ''}
            </span>
          </div>

          {hrState === 'error' && hrErrorMessage && (
            <p className="device-error-text">{hrErrorMessage}</p>
          )}

          <div className="btn-row">
            {hrState === 'connected' ? (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={onDisconnectHr}
              >
                {t('hr.disconnect')}
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={!devicesEnabled || !btOk || hrState === 'connecting'}
                onClick={onConnectHr}
              >
                {t('hr.connect')}
              </button>
            )}
          </div>
        </article>

        {/* Wi-Fi Bridge Card */}
        <article className="device-card">
          <div className="device-card-head">
            <div className="device-title">
              <Wifi className="icon-sm icon-accent" />
              <div>
                <h3>{t('wifi.title')}</h3>
              </div>
            </div>
          </div>
          <p className="device-info-text">{wifiMessage}</p>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={!devicesEnabled}
            onClick={onProbeWifi}
          >
            {t('wifi.probe')}
          </button>
        </article>
      </section>

      {/* Account & Group Ride Children */}
      {children}
    </aside>
  );
}
