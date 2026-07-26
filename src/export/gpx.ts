import type { RideExport } from './types';

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function isoUtc(ms: number): string {
  return new Date(ms).toISOString();
}

/**
 * GPX 1.1 track with optional Garmin TrackPointExtension (HR / cadence / power).
 */
export function buildGpx(ride: RideExport): string {
  const name = `ROADLAB ${isoUtc(ride.startedAtMs)}`;
  const pointsXml = ride.points
    .map((p) => {
      const extensions: string[] = [];
      if (p.heartRateBpm != null && p.heartRateBpm > 0) {
        extensions.push(`<gpxtpx:hr>${Math.round(p.heartRateBpm)}</gpxtpx:hr>`);
      }
      if (p.cadenceRpm > 0) {
        extensions.push(`<gpxtpx:cad>${Math.round(p.cadenceRpm)}</gpxtpx:cad>`);
      }
      if (p.powerWatts > 0) {
        extensions.push(`<gpxtpx:power>${Math.round(p.powerWatts)}</gpxtpx:power>`);
      }
      const extBlock =
        extensions.length > 0
          ? `\n        <extensions>\n          <gpxtpx:TrackPointExtension>\n            ${extensions.join(
              '\n            ',
            )}\n          </gpxtpx:TrackPointExtension>\n        </extensions>`
          : '';

      return `      <trkpt lat="${p.lat.toFixed(7)}" lon="${p.lng.toFixed(7)}">
        <ele>${p.elevationMeters.toFixed(1)}</ele>
        <time>${isoUtc(p.timestampMs)}</time>${extBlock}
      </trkpt>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="ROADLAB"
  xmlns="http://www.topografix.com/GPX/1/1"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1"
  xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd http://www.garmin.com/xmlschemas/TrackPointExtension/v1 http://www.garmin.com/xmlschemas/TrackPointExtensionv1.xsd">
  <metadata>
    <name>${escapeXml(name)}</name>
    <time>${isoUtc(ride.startedAtMs)}</time>
  </metadata>
  <trk>
    <name>${escapeXml(name)}</name>
    <type>cycling</type>
    <trkseg>
${pointsXml}
    </trkseg>
  </trk>
</gpx>
`;
}
