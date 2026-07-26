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
} from 'lucide-react';

type Props = {
  telemetry: RideTelemetry;
  riderWeightKg?: number;
};

// Power Zone Calculator (based on typical FTP ~250W or relative ratios)
function getPowerZone(watts: number, ftp = 250): { zone: string; colorClass: string; label: string } {
  const ratio = watts / ftp;
  if (watts <= 0) return { zone: 'Z0', colorClass: 'pz-0', label: 'IDLE' };
  if (ratio < 0.55) return { zone: 'Z1', colorClass: 'pz-1', label: 'RECOVERY' };
  if (ratio < 0.75) return { zone: 'Z2', colorClass: 'pz-2', label: 'ENDURANCE' };
  if (ratio < 0.90) return { zone: 'Z3', colorClass: 'pz-3', label: 'TEMPO' };
  if (ratio < 1.05) return { zone: 'Z4', colorClass: 'pz-4', label: 'THRESHOLD' };
  if (ratio < 1.20) return { zone: 'Z5', colorClass: 'pz-5', label: 'VO2 MAX' };
  return { zone: 'Z6', colorClass: 'pz-6', label: 'ANAEROBIC' };
}

// Heart Rate Zone Calculator (based on Max HR ~185)
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

export function RideHUD({ telemetry, riderWeightKg = 75 }: Props) {
  const t = useT();

  const watts = Math.max(0, Math.round(telemetry.powerWatts || 0));
  const wKg = (watts / riderWeightKg).toFixed(1);
  const pZone = getPowerZone(watts);

  const bpm = telemetry.heartRateBpm;
  const hrZone = bpm ? getHrZone(bpm) : null;

  const gradePercent = telemetry.gradePercent || 0;
  const gradeClass =
    gradePercent > 1.5
      ? 'grade-up'
      : gradePercent < -1.5
        ? 'grade-down'
        : 'grade-flat';

  return (
    <section className="ride-hud" aria-label={t('hud.aria')}>
      <div className="hud-progress-track">
        <div
          className="hud-progress-fill"
          style={{ width: `${Math.min(1, Math.max(0, telemetry.progress)) * 100}%` }}
        />
      </div>

      <div className="hud-grid">
        {/* Speed */}
        <Stat
          icon={<Compass className="icon-xs" />}
          label={t('hud.speed')}
          value={(telemetry.speedKmh || 0).toFixed(1)}
          unit="km/h"
          accent
        />

        {/* Power (Watts + W/kg + Zone) */}
        <Stat
          icon={<Zap className="icon-xs icon-zap" />}
          label={t('hud.power')}
          value={String(watts)}
          unit={`W (${wKg} W/kg)`}
          accent
          badge={watts > 0 ? pZone.zone : undefined}
          badgeClass={pZone.colorClass}
        />

        {/* Cadence (RPM) */}
        <Stat
          icon={<Activity className="icon-xs" />}
          label={t('hud.cadence')}
          value={String(Math.round(telemetry.cadenceRpm || 0))}
          unit="rpm"
        />

        {/* Heart Rate */}
        <Stat
          icon={<Heart className="icon-xs icon-heart" />}
          label={t('hud.heartRate')}
          value={bpm != null ? String(bpm) : '—'}
          unit={bpm != null ? 'bpm' : undefined}
          badge={hrZone ? hrZone.zone : undefined}
          badgeClass={hrZone?.colorClass}
        />

        {/* Grade % */}
        <Stat
          icon={<TrendingUp className="icon-xs" />}
          label={t('hud.grade')}
          value={formatGrade(gradePercent)}
        />

        {/* Elevation */}
        <Stat
          icon={<Mountain className="icon-xs" />}
          label={t('hud.elevation')}
          value={String(Math.round(telemetry.elevationMeters))}
          unit="m"
        />

        {/* Distance */}
        <Stat
          icon={<Ruler className="icon-xs" />}
          label={t('hud.distance')}
          value={formatDistance(telemetry.distanceMeters)}
        />

        {/* Time */}
        <Stat
          icon={<Clock className="icon-xs" />}
          label={t('hud.time')}
          value={formatDuration(telemetry.elapsedSeconds)}
        />
      </div>

      <div className={`hud-grade-chip ${gradeClass}`}>
        {t('hud.resistance', {
          value: telemetry.trainerResistanceHint.toFixed(0),
          load: gradePercent >= 0 ? t('hud.climb') : t('hud.descent'),
        })}
      </div>
    </section>
  );
}
