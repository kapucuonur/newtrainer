import type { ReactNode } from 'react';
import type { ConnectionState } from '../bluetooth/types';
import { getBluetoothSupportCode, isWebBluetoothSupported } from '../bluetooth/webBluetooth';
import { useT } from '../i18n';
import type { MessageKey } from '../i18n';
import { LanguageSwitcher } from './LanguageSwitcher';

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
  children,
}: Props) {
  const t = useT();
  const btOk = isWebBluetoothSupported();
  const trainerLabel = usingMock ? t('trainer.demoName') : trainerName;
  const trainerStatus = t(CONN_KEYS[trainerState]);
  const hrStatus = t(CONN_KEYS[hrState]);

  return (
    <aside className="connection-panel">
      <header className="panel-header">
        <p className="brand-mark">ROADLAB</p>
        <h1>{t('app.title')}</h1>
        <p className="panel-sub">{t('app.subtitle')}</p>
        <LanguageSwitcher />
      </header>

      <div className="support-card">
        <strong>{t('browser.title')}</strong>
        <p>{t(getBluetoothSupportCode())}</p>
      </div>

      <section className="device-card">
        <div className="device-card-head">
          <StatusDot state={trainerState} />
          <div>
            <h2>{t('trainer.title')}</h2>
            <p>
              {trainerLabel} · {trainerStatus}
            </p>
          </div>
        </div>
        <div className="btn-row">
          {trainerState === 'connected' ? (
            <button type="button" className="btn btn-ghost" onClick={onDisconnectTrainer}>
              {t('trainer.disconnect')}
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              onClick={onConnectTrainer}
              disabled={!btOk || trainerState === 'connecting'}
            >
              {trainerState === 'connecting' ? t('trainer.connecting') : t('trainer.connect')}
            </button>
          )}
          <button type="button" className="btn btn-secondary" onClick={onUseMock}>
            {t('trainer.useDemo')}
          </button>
        </div>
        {usingMock && (
          <label className="effort-slider">
            <span>{t('trainer.demoEffort')}</span>
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
            <h2>{t('hr.title')}</h2>
            <p>
              {hrName} · {hrStatus}
              {hrBpm != null ? ` · ${hrBpm} bpm` : ''}
            </p>
          </div>
        </div>
        <div className="btn-row">
          {hrState === 'connected' ? (
            <button type="button" className="btn btn-ghost" onClick={onDisconnectHr}>
              {t('hr.disconnect')}
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onConnectHr}
              disabled={!btOk || hrState === 'connecting'}
            >
              {hrState === 'connecting' ? t('hr.connecting') : t('hr.connect')}
            </button>
          )}
        </div>
      </section>

      <section className="device-card device-card-muted">
        <h2>{t('wifi.title')}</h2>
        <p>{wifiMessage}</p>
        <button type="button" className="btn btn-ghost" onClick={onProbeWifi}>
          {t('wifi.probe')}
        </button>
      </section>

      {children}
    </aside>
  );
}
