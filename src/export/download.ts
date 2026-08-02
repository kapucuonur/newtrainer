import {
  isAndroidDevice,
  isCapacitorNative,
} from '../platform/native';

export type DownloadMethod = 'anchor' | 'share' | 'open';

export type DownloadResult = {
  method: DownloadMethod;
};

function isAppleTouchDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

/** Bluefy / iOS / Android WebView often ignore `<a download>` for blob URLs. */
function prefersShareOrOpen(): boolean {
  return isAppleTouchDevice() || isAndroidDevice() || isCapacitorNative();
}

function revokeLater(url: string, ms: number): void {
  window.setTimeout(() => URL.revokeObjectURL(url), ms);
}

function triggerAnchorDownload(url: string, filename: string): void {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

async function tryShareFile(filename: string, blob: Blob): Promise<boolean> {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') {
    return false;
  }
  if (typeof File === 'undefined') return false;

  const file = new File([blob], filename, {
    type: blob.type || 'application/octet-stream',
  });
  const payload: ShareData = { files: [file], title: filename };

  try {
    if (typeof navigator.canShare === 'function' && !navigator.canShare(payload)) {
      return false;
    }
  } catch {
    return false;
  }

  try {
    await navigator.share(payload);
    return true;
  } catch (error) {
    // User dismissed the sheet — treat as handled (not a hard failure).
    if (error instanceof DOMException && error.name === 'AbortError') {
      return true;
    }
    return false;
  }
}

function tryOpenBlob(url: string): boolean {
  try {
    const opened = window.open(url, '_blank', 'noopener,noreferrer');
    return Boolean(opened);
  } catch {
    return false;
  }
}

/**
 * Reliable file delivery across Chrome desktop, Bluefy iOS, and Capacitor Android.
 * Anchor click runs synchronously (same turn as the user tap), then mobile prefers
 * Web Share; blob open is a last resort when the download attribute is ignored.
 */
export async function downloadBlob(
  filename: string,
  blob: Blob,
): Promise<DownloadResult> {
  if (blob.size <= 0) {
    throw new Error('Empty export file');
  }

  const url = URL.createObjectURL(blob);
  try {
    // Must stay sync with the click gesture — do not await before this.
    triggerAnchorDownload(url, filename);

    if (prefersShareOrOpen()) {
      if (await tryShareFile(filename, blob)) {
        revokeLater(url, 4_000);
        return { method: 'share' };
      }
      if (tryOpenBlob(url)) {
        revokeLater(url, 60_000);
        return { method: 'open' };
      }
      revokeLater(url, 30_000);
      return { method: 'anchor' };
    }

    revokeLater(url, 4_000);
    return { method: 'anchor' };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error instanceof Error ? error : new Error('Download failed');
  }
}

export async function downloadBytes(
  filename: string,
  bytes: Uint8Array,
  mime: string,
): Promise<DownloadResult> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return downloadBlob(filename, new Blob([copy], { type: mime }));
}

export async function downloadText(
  filename: string,
  text: string,
  mime: string,
): Promise<DownloadResult> {
  return downloadBlob(filename, new Blob([text], { type: mime }));
}
