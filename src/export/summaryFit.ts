import type { RideSummary } from '../api/types';
import type { RideSummaryFitInput } from './types';

/** Map API/DB ride summary → FIT summary input. */
export function rideSummaryToFitInput(ride: RideSummary): RideSummaryFitInput {
  const startedAtMs = Date.parse(ride.startedAt);
  if (Number.isNaN(startedAtMs)) {
    throw new Error('Invalid ride startedAt');
  }

  let finishedAtMs =
    ride.endedAt != null ? Date.parse(ride.endedAt) : Number.NaN;
  if (Number.isNaN(finishedAtMs)) {
    finishedAtMs = startedAtMs + Math.max(1, ride.durationS) * 1000;
  }

  return {
    startedAtMs,
    finishedAtMs,
    elapsedSeconds: Math.max(1, ride.durationS),
    distanceMeters: Math.max(0, ride.distanceM),
    avgPowerWatts: ride.avgPower,
    maxPowerWatts: ride.maxPower,
    avgHeartRateBpm: ride.avgHr,
    maxHeartRateBpm: ride.maxHr,
    avgSpeedKmh: ride.avgSpeedKmh,
    maxSpeedKmh: ride.maxSpeedKmh,
    elevationGainMeters: ride.elevationGainM,
    routeName: ride.routeName,
  };
}
