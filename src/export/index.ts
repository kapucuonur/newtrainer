import { downloadBytes, downloadText, type DownloadResult } from './download';
import { rideExportFilename } from './filename';
import { buildFit, buildFitFromSummary } from './fit';
import { buildGpx } from './gpx';
import { rideSummaryToFitInput } from './summaryFit';
import type { RideExport, RideSummaryFitInput } from './types';
import type { RideSummary } from '../api/types';

export type { RideExport, TrackPoint, RideSummaryFitInput } from './types';
export type { DownloadMethod, DownloadResult } from './download';
export { rideExportFilename } from './filename';
export { buildFit, buildFitFromSummary } from './fit';
export { buildGpx } from './gpx';
export { rideSummaryToFitInput } from './summaryFit';

export async function downloadRideFit(ride: RideExport): Promise<DownloadResult> {
  if (ride.points.length === 0) {
    throw new Error('No track points');
  }
  const bytes = buildFit(ride);
  if (bytes.byteLength === 0) {
    throw new Error('FIT encoder produced empty file');
  }
  return downloadBytes(
    rideExportFilename(ride.startedAtMs, 'fit'),
    bytes,
    'application/octet-stream',
  );
}

/** Download a session-only FIT from saved summary averages (no GPS track). */
export async function downloadRideSummaryFit(
  ride: RideSummary | RideSummaryFitInput,
): Promise<DownloadResult> {
  const input =
    'startedAtMs' in ride ? ride : rideSummaryToFitInput(ride);
  const bytes = buildFitFromSummary(input);
  if (bytes.byteLength === 0) {
    throw new Error('FIT encoder produced empty file');
  }
  return downloadBytes(
    rideExportFilename(input.startedAtMs, 'fit'),
    bytes,
    'application/octet-stream',
  );
}

export async function downloadRideGpx(ride: RideExport): Promise<DownloadResult> {
  if (ride.points.length === 0) {
    throw new Error('No track points');
  }
  const xml = buildGpx(ride);
  if (!xml.trim()) {
    throw new Error('GPX encoder produced empty file');
  }
  return downloadText(
    rideExportFilename(ride.startedAtMs, 'gpx'),
    xml,
    'application/gpx+xml',
  );
}
