export function isSecureContextAvailable(): boolean {
  return typeof window !== 'undefined' && window.isSecureContext;
}

export function isWebBluetoothSupported(): boolean {
  return (
    isSecureContextAvailable() &&
    typeof navigator !== 'undefined' &&
    typeof navigator.bluetooth !== 'undefined'
  );
}

export async function isBluetoothAvailable(): Promise<boolean> {
  if (!isWebBluetoothSupported() || !navigator.bluetooth) return false;
  try {
    return await navigator.bluetooth.getAvailability();
  } catch {
    return false;
  }
}

export type BluetoothSupportCode =
  | 'bt.noBrowser'
  | 'bt.iosSafari'
  | 'bt.needsHttps'
  | 'bt.unsupported'
  | 'bt.available';

export function getBluetoothSupportCode(): BluetoothSupportCode {
  if (typeof navigator === 'undefined') {
    return 'bt.noBrowser';
  }

  const ua = navigator.userAgent;
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (typeof navigator !== 'undefined' && navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  if (!isSecureContextAvailable()) return 'bt.needsHttps';
  if (!navigator.bluetooth) return isIOS ? 'bt.iosSafari' : 'bt.unsupported';
  return 'bt.available';
}

