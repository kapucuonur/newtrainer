export type TrackPoint = {
  /** Wall-clock / activity timestamp (ms since epoch). */
  timestampMs: number;
  lat: number;
  lng: number;
  elevationMeters: number;
  distanceMeters: number;
  speedKmh: number;
  powerWatts: number;
  cadenceRpm: number;
  heartRateBpm: number | null;
};

export type RideExport = {
  startedAtMs: number;
  finishedAtMs: number;
  elapsedSeconds: number;
  distanceMeters: number;
  points: TrackPoint[];
};

/**
 * Summary-only FIT input (no GPS track). Used when regenerating from
 * server-stored RideSummary after the client track is gone.
 */
export type RideSummaryFitInput = {
  startedAtMs: number;
  finishedAtMs: number;
  elapsedSeconds: number;
  distanceMeters: number;
  avgPowerWatts?: number | null;
  maxPowerWatts?: number | null;
  avgHeartRateBpm?: number | null;
  maxHeartRateBpm?: number | null;
  avgSpeedKmh?: number | null;
  maxSpeedKmh?: number | null;
  elevationGainMeters?: number | null;
  routeName?: string | null;
};
