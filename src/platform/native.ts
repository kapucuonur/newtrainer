/** Lightweight Capacitor / Android detection — no hard dependency on @capacitor/core at runtime. */

type CapacitorBridge = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
};

function getCapacitor(): CapacitorBridge | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as Window & { Capacitor?: CapacitorBridge }).Capacitor;
}

export function isCapacitorNative(): boolean {
  try {
    return Boolean(getCapacitor()?.isNativePlatform?.());
  } catch {
    return false;
  }
}

export function isAndroidDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  if (/Android/i.test(navigator.userAgent)) return true;
  try {
    return getCapacitor()?.getPlatform?.() === 'android';
  } catch {
    return false;
  }
}

export function isAndroidCapacitorApp(): boolean {
  return isCapacitorNative() && isAndroidDevice();
}
