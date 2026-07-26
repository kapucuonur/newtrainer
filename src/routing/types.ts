export type LatLng = {
  lat: number;
  lng: number;
};

export type RoutePoint = LatLng & {
  elevationMeters: number;
  /** Cumulative distance from route start (meters) */
  distanceMeters: number;
  /** Local grade percent toward next sample */
  gradePercent: number;
};

export interface RouteLineString {
  type: 'LineString';
  coordinates: number[][];
}

export interface RouteResult {
  coordinates: LatLng[];
  distanceMeters: number;
  durationSeconds: number;
  geometry: RouteLineString;
  source: 'osrm' | 'straight';
}

export type ElevationSource =
  | 'open-meteo'
  | 'opentopo'
  | 'proxy'
  | 'unavailable';

export interface EnrichedRoute extends RouteResult {
  samples: RoutePoint[];
  elevGainMeters: number;
  elevLossMeters: number;
  minElevMeters: number;
  maxElevMeters: number;
  /** DEM provider used for samples; unavailable = honest flat (no synthetic terrain). */
  elevationSource?: ElevationSource;
  /** Set when real DEM lookup failed — show in UI, do not invent hills. */
  elevationWarning?: string;
}
