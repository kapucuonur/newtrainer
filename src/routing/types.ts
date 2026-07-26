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

export interface EnrichedRoute extends RouteResult {
  samples: RoutePoint[];
  elevGainMeters: number;
  elevLossMeters: number;
  minElevMeters: number;
  maxElevMeters: number;
}
