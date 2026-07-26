import type { RideTelemetry } from '../simulation/rideEngine';
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
  const gradeClass =
    telemetry.gradePercent > 1.5
      ? 'grade-up'
      : telemetry.gradePercent < -1.5
        ? 'grade-down'
        : 'grade-flat';

  return (
    <section className="ride-hud" aria-label="Ride metrics">
      <div className="hud-progress-track">
        <div
          className="hud-progress-fill"
          style={{ width: `${telemetry.progress * 100}%` }}
        />
      </div>
      <div className="hud-grid">
        <Stat
          label="Speed"
          value={(telemetry.speedKmh || 0).toFixed(1)}
          unit="km/h"
          accent
        />
        <Stat label="Power" value={String(Math.round(telemetry.powerWatts || 0))} unit="W" accent />
        <Stat label="Cadence" value={String(Math.round(telemetry.cadenceRpm || 0))} unit="rpm" />
        <Stat
          label="Heart rate"
          value={telemetry.heartRateBpm != null ? String(telemetry.heartRateBpm) : '—'}
          unit={telemetry.heartRateBpm != null ? 'bpm' : undefined}
        />
        <Stat
          label="Grade"
          value={formatGrade(telemetry.gradePercent)}
        />
        <Stat
          label="Elevation"
          value={String(Math.round(telemetry.elevationMeters))}
          unit="m"
        />
        <Stat label="Distance" value={formatDistance(telemetry.distanceMeters)} />
        <Stat label="Time" value={formatDuration(telemetry.elapsedSeconds)} />
      </div>
      <div className={`hud-grade-chip ${gradeClass}`}>
        Resistance target ≈ {telemetry.trainerResistanceHint.toFixed(0)} ·{' '}
        {telemetry.gradePercent >= 0 ? 'Climb' : 'Descent'} load
      </div>
    </section>
  );
}
