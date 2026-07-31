import { useEffect, useState } from 'react';
import type { RidePowerMode } from '../simulation/rideEngine';
import { useT } from '../i18n';
import { Target } from 'lucide-react';

const FTP_PRESETS = [55, 75, 90, 100, 105, 120] as const;

type Props = {
  ftpWatts: number;
  powerMode: RidePowerMode;
  targetPowerWatts: number | null;
  supportsTargetPower: boolean | null;
  ergHardwareActive: boolean;
  trainerConnected: boolean;
  onPowerModeChange: (mode: RidePowerMode) => void;
  onTargetPowerChange: (watts: number | null) => void;
};

export function ErgControls({
  ftpWatts,
  powerMode,
  targetPowerWatts,
  supportsTargetPower,
  ergHardwareActive,
  trainerConnected,
  onPowerModeChange,
  onTargetPowerChange,
}: Props) {
  const t = useT();
  const [wattsInput, setWattsInput] = useState(
    targetPowerWatts != null ? String(targetPowerWatts) : '',
  );

  useEffect(() => {
    setWattsInput(targetPowerWatts != null ? String(Math.round(targetPowerWatts)) : '');
  }, [targetPowerWatts]);

  const hardwareOk = supportsTargetPower === true;
  const degraded = powerMode === 'erg' && trainerConnected && supportsTargetPower === false;

  const applyPreset = (pct: number) => {
    const watts = Math.round((ftpWatts * pct) / 100);
    onTargetPowerChange(watts);
    if (powerMode !== 'erg') onPowerModeChange('erg');
  };

  const commitWattsInput = () => {
    const parsed = Number.parseInt(wattsInput, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      onTargetPowerChange(null);
      return;
    }
    onTargetPowerChange(parsed);
  };

  return (
    <article className="device-card erg-controls" aria-label={t('erg.aria')}>
      <div className="device-card-head">
        <div className="device-title">
          <Target className="icon-sm icon-accent" />
          <div>
            <h3>{t('erg.title')}</h3>
            <p className="device-name">
              {t('erg.ftpLabel')}: {ftpWatts} W
            </p>
          </div>
        </div>
      </div>

      <div className="btn-row erg-mode-row" role="group" aria-label={t('erg.mode')}>
        <button
          type="button"
          className={`btn btn-sm ${powerMode === 'free' ? 'btn-accent' : 'btn-ghost'}`}
          onClick={() => onPowerModeChange('free')}
        >
          {t('erg.modeFree')}
        </button>
        <button
          type="button"
          className={`btn btn-sm ${powerMode === 'erg' ? 'btn-accent' : 'btn-ghost'}`}
          onClick={() => onPowerModeChange('erg')}
          title={
            trainerConnected && !hardwareOk ? t('erg.unsupportedHint') : undefined
          }
        >
          {t('erg.modeErg')}
        </button>
      </div>

      {degraded ? (
        <p className="device-info-text erg-degraded" role="status">
          {t('erg.unsupported')}
        </p>
      ) : null}

      {powerMode === 'erg' && ergHardwareActive ? (
        <p className="device-info-text" role="status">
          {t('erg.hardwareActive')}
        </p>
      ) : null}

      {powerMode === 'erg' && !trainerConnected ? (
        <p className="device-info-text" role="status">
          {t('erg.noTrainer')}
        </p>
      ) : null}

      <div className="erg-presets" role="group" aria-label={t('erg.presets')}>
        {FTP_PRESETS.map((pct) => {
          const watts = Math.round((ftpWatts * pct) / 100);
          const active =
            powerMode === 'erg' &&
            targetPowerWatts != null &&
            Math.abs(targetPowerWatts - watts) <= 1;
          return (
            <button
              key={pct}
              type="button"
              className={`btn btn-sm ${active ? 'btn-accent' : 'btn-ghost'}`}
              onClick={() => applyPreset(pct)}
            >
              {pct}%
              <span className="erg-preset-w">{watts}W</span>
            </button>
          );
        })}
      </div>

      <div className="erg-watts-row">
        <label htmlFor="erg-target-watts">{t('erg.targetWatts')}</label>
        <div className="erg-watts-input">
          <input
            id="erg-target-watts"
            type="number"
            min={0}
            max={4000}
            step={5}
            inputMode="numeric"
            value={wattsInput}
            onChange={(e) => setWattsInput(e.target.value)}
            onBlur={commitWattsInput}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.currentTarget.blur();
              }
            }}
          />
          <span>W</span>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              commitWattsInput();
              if (powerMode !== 'erg') onPowerModeChange('erg');
            }}
          >
            {t('erg.apply')}
          </button>
        </div>
      </div>
    </article>
  );
}
