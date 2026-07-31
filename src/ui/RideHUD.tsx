import type { ReactNode } from 'react';
import type { RideTelemetry } from '../simulation/rideEngine';
import { useT } from '../i18n';
import { formatDistance, formatDuration, formatGrade } from './format';
import {
  Zap,
  Heart,
  Activity,
  Compass,
  TrendingUp,
  Clock,
  Ruler,
  Mountain,
  Crosshair,
} from 'lucide-react';

type Props = {
  telemetry: RideTelemetry;
  riderWeightKg?: number;
  ftpWatts?: number;
};

function getPowerZone(
  watts: number,
  ftp: number,
): { zone: string; colorClass: string; label: string } {
  const safeFtp = Math.max(1, ftp);
  const ratio = watts / safeFtp;
  if (watts <= 0) return { zone: 'Z0', colorClass: 'pz-0', label: 'IDLE' };
  if (ratio < 0.55) return { zone: 'Z1', colorClass: 'pz-1', label: 'RECOVERY' };
  if (ratio < 0.75) return { zone: 'Z2', colorClass: 'pz-2', label: 'ENDURANCE' };
  if (ratio < 0.9) return { zone: 'Z3', colorClass: 'pz-3', label: 'TEMPO' };
  if (ratio < 1.05) return { zone: 'Z4', colorClass: 'pz-4', label: 'THRESHOLD' };
  if (ratio < 1.2) return { zone: 'Z5', colorClass: 'pz-5', label: 'VO2 MAX' };
  return { zone: 'Z6', colorClass: 'pz-6', label: 'ANAEROBIC' };
}

function getHrZone(bpm: number, maxHr = 185): { zone: string; colorClass: string } {
  const ratio = bpm / maxHr;
  if (ratio < 0.6) return { zone: 'Z1', colorClass: 'hrz-1' };
  if (ratio < 0.7) return { zone: 'Z2', colorClass: 'hrz-2' };
  if (ratio < 0.8) return { zone: 'Z3', colorClass: 'hrz-3' };
  if (ratio < 0.9) return { zone: 'Z4', colorClass: 'hrz-4' };
  return { zone: 'Z5', colorClass: 'hrz-5' };
}

function Stat({
  label,
  value,
  unit,
  icon,
  accent,
  badge,
  badgeClass,
}: {
  label: string;
  value: string;
  unit?: string;
  icon?: ReactNode;
  accent?: boolean;
  badge?: string;
  badgeClass?: string;
}) {
  return (
    <div className={`hud-stat ${accent ? 'hud-stat-accent' : ''}`}>
      <div className="hud-stat-header">
        <span className="hud-label">
          {icon}
          {label}
        </span>
        {badge && <span className={`hud-badge ${badgeClass ?? ''}`}>{badge}</span>}
      </div>
      <span className="hud-value">
        {value}
        {unit ? <small>{unit}</small> : null}
      </span>
    </div>
  );
}

export function RideHUD({ telemetry, riderWeightKg = 75, ftpWatts = 250 }: Props) {
  const t = useT();

  const watts = Math.max(0, Math.round(telemetry.powerWatts || 0));
  const wKg = (watts / riderWeightKg).toFixed(1);
  const pZone = getPowerZone(watts, ftpWatts);

  const bpm = telemetry.heartRateBpm;
  const hrZone = bpm ? getHrZone(bpm) : null;

  const gradePercent = telemetry.gradePercent || 0;
  const gradeClass =
    gradePercent > 1.5
      ? 'grade-up'
      : gradePercent < -1.5
        ? 'grade-down'
        : 'grade-flat';

  const targetW =
    telemetry.targetPowerWatts != null
      ? Math.round(telemetry.targetPowerWatts)
      : null;
  const showTarget = targetW != null && telemetry.powerMode === 'erg';

  const controlLabel =
    telemetry.trainerControlMode === 'erg'
      ? t('hud.trainerErg')
      : telemetry.trainerControlMode === 'resistance'
        ? t('hud.trainerRes')
        : t('hud.trainerSim');

  const controlValue =
    telemetry.trainerControlMode === 'erg'
      ? targetW != null
        ? `${targetW} W`
        : '—'
      : telemetry.trainerControlMode === 'resistance'
        ? telemetry.trainerResistanceHint.toFixed(0)
        : formatGrade(telemetry.trainerGradeSent ?? gradePercent);

  return (
    <section className="ride-hud" aria-label={t('hud.aria')}>
      <div className="hud-progress-track">
        <div
          className="hud-progress-fill"
          style={{ width: `${Math.min(1, Math.max(0, telemetry.progress)) * 100}%` }}
        />
      </div>

      <div className="hud-grid">
        <Stat
          icon={<Compass className="icon-sm" />}
          label={t('hud.speed')}
          value={(telemetry.speedKmh || 0).toFixed(1)}
          unit="km/h"
          accent
        />

        <Stat
          icon={<Zap className="icon-sm icon-zap" />}
          label={t('hud.power')}
          value={String(watts)}
          unit={`W (${wKg} W/kg)`}
          accent
          badge={watts > 0 ? pZone.zone : undefined}
          badgeClass={pZone.colorClass}
        />

        <Stat
          icon={<Activity className="icon-sm" />}
          label={t('hud.cadence')}
          value={String(Math.round(telemetry.cadenceRpm || 0))}
          unit="rpm"
        />

        <Stat
          icon={<Heart className="icon-sm icon-heart" />}
          label={t('hud.heartRate')}
          value={bpm != null ? String(bpm) : '—'}
          unit={bpm != null ? 'bpm' : undefined}
          badge={hrZone ? hrZone.zone : undefined}
          badgeClass={hrZone?.colorClass}
        />

        <Stat
          icon={<TrendingUp className="icon-sm" />}
          label={t('hud.grade')}
          value={formatGrade(gradePercent)}
          accent
        />

        <Stat
          icon={<Mountain className="icon-sm" />}
          label={t('hud.elevation')}
          value={String(Math.round(telemetry.elevationMeters))}
          unit="m"
        />

        <Stat
          icon={<Ruler className="icon-sm" />}
          label={t('hud.distance')}
          value={formatDistance(telemetry.distanceMeters)}
        />

        <Stat
          icon={<Clock className="icon-sm" />}
          label={t('hud.time')}
          value={formatDuration(telemetry.elapsedSeconds)}
        />
      </div>

      <div className={`hud-grade-chip ${gradeClass}`} aria-label={t('hud.trainerTargetAria')}>
        <div className="hud-grade-chip-metrics">
          <div className="hud-grade-chip-metric">
            <span className="hud-grade-chip-k">{t('hud.grade')}</span>
            <span className="hud-grade-chip-v">{formatGrade(gradePercent)}</span>
          </div>
          <div className="hud-grade-chip-metric">
            <span className="hud-grade-chip-k">{controlLabel}</span>
            <span className="hud-grade-chip-v">{controlValue}</span>
          </div>
          {showTarget ? (
            <div className="hud-grade-chip-metric">
              <span className="hud-grade-chip-k">
                {telemetry.ergHardwareActive
                  ? t('hud.targetPower')
                  : t('hud.effortTarget')}
              </span>
              <span className="hud-grade-chip-v">
                <Crosshair className="icon-xs" aria-hidden="true" />
                {targetW} W
              </span>
            </div>
          ) : null}
          {telemetry.trainerControlMode === 'sim' ? (
            <div className="hud-grade-chip-metric hud-grade-chip-metric-secondary">
              <span className="hud-grade-chip-k">{t('hud.trainerRes')}</span>
              <span className="hud-grade-chip-v">
                {telemetry.trainerResistanceHint.toFixed(0)}
              </span>
            </div>
          ) : null}
        </div>
        <span className="hud-grade-chip-load">
          {telemetry.trainerControlMode === 'erg'
            ? telemetry.ergHardwareActive
              ? t('hud.ergActive')
              : t('hud.effortPace')
            : gradePercent >= 0
              ? t('hud.climb')
              : t('hud.descent')}
        </span>
      </div>
    </section>
  );
}
