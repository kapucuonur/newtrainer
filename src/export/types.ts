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
