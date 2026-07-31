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

/** iPad/iPhone (incl. iPadOS desktop UA). */
export function isAppleTouchDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

/**
 * Bluefy (and similar iOS WebBLE wrappers) expose navigator.bluetooth; Safari does not.
 * Their native bridge often fails on complex Chrome-style filters and returns bare codes.
 */
export function isBluefyBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  if (/Bluefy/i.test(navigator.userAgent)) return true;
  return isAppleTouchDevice() && typeof navigator.bluetooth !== 'undefined';
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

/** Canonical 128-bit UUID — Bluefy’s bridge is unreliable with bare 16-bit numbers. */
export function toBluetoothUuid(uuid: number | string): string {
  if (typeof uuid === 'number') {
    const hex = (uuid & 0xffff).toString(16).padStart(4, '0');
    return `0000${hex}-0000-1000-8000-00805f9b34fb`;
  }
  const trimmed = uuid.trim().toLowerCase();
  if (/^[0-9a-f]{4}$/i.test(trimmed) || /^0x[0-9a-f]{1,4}$/i.test(trimmed)) {
    return toBluetoothUuid(Number.parseInt(trimmed.replace(/^0x/i, ''), 16));
  }
  return trimmed;
}

function uniqUuids(uuids: Array<number | string>): string[] {
  return [...new Set(uuids.map(toBluetoothUuid))];
}

/**
 * Bluefy often cannot parse multi-filter / mixed-UUID requestDevice payloads
 * (“Request payload could not parsed”) and never shows the picker — reject with
 * a bare numeric code (commonly 2). On Bluefy use acceptAllDevices + optionalServices.
 */
export async function requestBluetoothDevice(
  options: RequestDeviceOptions,
): Promise<BluetoothDevice> {
  if (!navigator.bluetooth) {
    throw new Error('Web Bluetooth is not available');
  }

  const fromFilters = (options.filters ?? []).flatMap((filter) => filter.services ?? []);
  const optionalServices = uniqUuids([
    ...(options.optionalServices ?? []),
    ...fromFilters,
  ]);

  if (isBluefyBrowser() || options.acceptAllDevices) {
    return navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices,
    });
  }

  return navigator.bluetooth.requestDevice({
    filters: options.filters?.map((filter) => ({
      ...filter,
      services: filter.services?.map(toBluetoothUuid),
    })),
    optionalServices,
  });
}

function describeNumericBluetoothCode(code: number): string {
  if (code === 2 && isBluefyBrowser()) {
    return (
      'Bluefy Bluetooth request failed (code 2). ' +
      'Allow Bluetooth for Bluefy in iOS Settings, keep the trainer nearby/awake, then tap Connect again.'
    );
  }
  return `Bluetooth error code ${code}`;
}

/**
 * Some in-app browsers (e.g. Bluefy on iOS) implement navigator.bluetooth via
 * their own bridge and reject requestDevice()/connect() with plain objects,
 * numbers, or strings instead of a real Error.
 */
export function describeBluetoothError(error: unknown): string {
  if (typeof error === 'number') return describeNumericBluetoothCode(error);
  if (typeof error === 'string') {
    if (/^\d+$/.test(error)) return describeNumericBluetoothCode(Number(error));
    return error;
  }
  if (error instanceof Error) return error.message || error.name || String(error);
  if (error && typeof error === 'object') {
    const withMessage = error as { message?: unknown; name?: unknown; code?: unknown };
    if (typeof withMessage.message === 'string' && withMessage.message) {
      if (/^\d+$/.test(withMessage.message)) {
        return describeNumericBluetoothCode(Number(withMessage.message));
      }
      return withMessage.message;
    }
    if (typeof withMessage.message === 'number') {
      return describeNumericBluetoothCode(withMessage.message);
    }
    if (typeof withMessage.code === 'number') {
      return describeNumericBluetoothCode(withMessage.code);
    }
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

  if (!isSecureContextAvailable()) return 'bt.needsHttps';
  if (!navigator.bluetooth) return isAppleTouchDevice() ? 'bt.iosSafari' : 'bt.unsupported';
  return 'bt.available';
}

/** Bluefy/CoreBluetooth needs breathing room between GATT ops or the link drops. */
export function gattSettleMs(): number {
  return isBluefyBrowser() ? 450 : 40;
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function gattSettle(): Promise<void> {
  await delay(gattSettleMs());
}

