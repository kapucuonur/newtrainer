import type { LatLng } from './types';

/** Soft cap for map-click / search waypoints (OSRM path length). */
export const MAX_WAYPOINTS = 15;
export const MIN_WAYPOINTS = 2;

/** A, B, C… (supports up to 26; clamp callers to MAX_WAYPOINTS). */
export function waypointLabel(index: number): string {
  if (index < 0 || index > 25) return String(index + 1);
  return String.fromCharCode(65 + index);
}

export function nextWaypointLabel(count: number): string {
  return waypointLabel(count);
}

export function canAddWaypoint(count: number): boolean {
  return count < MAX_WAYPOINTS;
}

export function canBuildRoute(waypoints: LatLng[]): boolean {
  return waypoints.length >= MIN_WAYPOINTS;
}
