/** Filename like roadlab-YYYYMMDD-HHMM.fit / .gpx */
export function rideExportFilename(startedAtMs: number, extension: 'fit' | 'gpx'): string {
  const d = new Date(startedAtMs);
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp =
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}`;
  return `roadlab-${stamp}.${extension}`;
}
