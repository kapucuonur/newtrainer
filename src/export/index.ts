import { downloadBytes, downloadText } from './download';
import { rideExportFilename } from './filename';
import { buildFit } from './fit';
import { buildGpx } from './gpx';
import type { RideExport } from './types';

export type { RideExport, TrackPoint } from './types';
export { rideExportFilename } from './filename';
export { buildFit } from './fit';
export { buildGpx } from './gpx';

export function downloadRideFit(ride: RideExport): void {
  const bytes = buildFit(ride);
  downloadBytes(rideExportFilename(ride.startedAtMs, 'fit'), bytes, 'application/octet-stream');
}

export function downloadRideGpx(ride: RideExport): void {
  const xml = buildGpx(ride);
  downloadText(rideExportFilename(ride.startedAtMs, 'gpx'), xml, 'application/gpx+xml');
}
