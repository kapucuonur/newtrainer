import type { RideTelemetry } from '../simulation/rideEngine';
import { useT } from '../i18n';
import { formatDistance, formatDuration, formatGrade } from './format';

type Props = {
  telemetry: RideTelemetry;
};

function Stat({
  label,
  value,
  unit,
  accent,
}: {
  label: string;
  value: string;
  unit?: string;
  accent?: boolean;
}) {
  return (
    <div className={`hud-stat ${accent ? 'hud-stat-accent' : ''}`}>
      <span className="hud-label">{label}</span>
      <span className="hud-value">
        {value}
        {unit ? <small>{unit}</small> : null}
      </span>
    </div>
  );
}

export function RideHUD({ telemetry }: Props) {
  const t = useT();
  const gradeClass =
    telemetry.gradePercent > 1.5
      ? 'grade-up'
      : telemetry.gradePercent < -1.5
        ? 'grade-down'
        : 'grade-flat';

  return (
    <section className="ride-hud" aria-label={t('hud.aria')}>
      <div className="hud-progress-track">
        <div
          className="hud-progress-fill"
          style={{ width: `${telemetry.progress * 100}%` }}
        />
      </div>
      <div className="hud-grid">
        <Stat
          label={t('hud.speed')}
          value={(telemetry.speedKmh || 0).toFixed(1)}
          unit="km/h"
          accent
        />
        <Stat
          label={t('hud.power')}
          value={String(Math.round(telemetry.powerWatts || 0))}
          unit="W"
          accent
        />
        <Stat
          label={t('hud.cadence')}
          value={String(Math.round(telemetry.cadenceRpm || 0))}
          unit="rpm"
        />
        <Stat
          label={t('hud.heartRate')}
          value={telemetry.heartRateBpm != null ? String(telemetry.heartRateBpm) : '—'}
          unit={telemetry.heartRateBpm != null ? 'bpm' : undefined}
        />
        <Stat label={t('hud.grade')} value={formatGrade(telemetry.gradePercent)} />
        <Stat
          label={t('hud.elevation')}
          value={String(Math.round(telemetry.elevationMeters))}
          unit="m"
        />
        <Stat label={t('hud.distance')} value={formatDistance(telemetry.distanceMeters)} />
        <Stat label={t('hud.time')} value={formatDuration(telemetry.elapsedSeconds)} />
      </div>
      <div className={`hud-grade-chip ${gradeClass}`}>
        {t('hud.resistance', {
          value: telemetry.trainerResistanceHint.toFixed(0),
          load: telemetry.gradePercent >= 0 ? t('hud.climb') : t('hud.descent'),
        })}
      </div>
    </section>
  );
}
