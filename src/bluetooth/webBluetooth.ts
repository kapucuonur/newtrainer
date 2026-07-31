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

/**
 * Some in-app browsers (e.g. Bluefy on iOS) implement navigator.bluetooth via
 * their own bridge and reject requestDevice()/connect() with plain objects or
 * strings instead of a real Error, so `error instanceof Error` misses the
 * actual reason and callers fall back to a generic message.
 */
export function describeBluetoothError(error: unknown): string {
  if (error instanceof Error) return error.message || error.name || String(error);
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const withMessage = error as { message?: unknown; name?: unknown; code?: unknown };
    if (typeof withMessage.message === 'string' && withMessage.message) return withMessage.message;
    if (typeof withMessage.name === 'string' && withMessage.name) return withMessage.name;
    try {
      const json = JSON.stringify(error);
      if (json && json !== '{}') return json;
    } catch {
      // Circular or non-serializable — fall through to String().
    }
  }
  return String(error);
}

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

