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

export function getBluetoothSupportMessage(): string {
  if (typeof navigator === 'undefined') {
    return 'Bluetooth is only available in a browser.';
  }

  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isSafari = /^((?!chrome|android).)*safari/i.test(ua);

  if (isIOS || isSafari) {
    return 'Web Bluetooth is not supported in iOS Safari. Use Chrome or Edge on Android, Windows, or macOS — or install a Bluefy-style browser on iOS.';
  }

  if (!isSecureContextAvailable()) {
    return 'Web Bluetooth requires HTTPS or localhost.';
  }

  if (!navigator.bluetooth) {
    return 'This browser does not support Web Bluetooth. Use Chrome or Edge.';
  }

  return 'Web Bluetooth is available. Pair your FTMS trainer or heart-rate strap when prompted.';
}
