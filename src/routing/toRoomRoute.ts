import type { EnrichedRoute } from './types';

/**
 * Compact route JSON for POST /api/rooms.
 * Drops dense OSRM geometry + duplicate coordinates; samples alone drive the ride.
 */
export function toRoomRoutePayload(route: EnrichedRoute): Record<string, unknown> {
  const coordinates = route.samples.map((s) => [s.lng, s.lat]);
  return {
    distanceMeters: route.distanceMeters,
    durationSeconds: route.durationSeconds,
    source: route.source,
    geometry: {
      type: 'LineString',
      coordinates,
    },
    samples: route.samples,
    elevGainMeters: route.elevGainMeters,
    elevLossMeters: route.elevLossMeters,
    minElevMeters: route.minElevMeters,
    maxElevMeters: route.maxElevMeters,
  };
}
