import { Capacitor } from '@capacitor/core';
import { BleClient, type DisplayStrings } from '@capacitor-community/bluetooth-le';
import { createNativeBluetooth } from './nativeBluetooth';

function isNativeAndroid(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

/**
 * Capacitor Android WebView has no `navigator.bluetooth`. Install the native-backed shim
 * before React renders so FTMS / HR classes see Web Bluetooth as available.
 * No-op in browsers (Chrome keeps its own Web Bluetooth).
 */
export function installNativeBluetooth(): void {
  if (!isNativeAndroid()) return;
  if (typeof navigator === 'undefined' || navigator.bluetooth) return;
  Object.defineProperty(navigator, 'bluetooth', {
    value: createNativeBluetooth(BleClient),
    configurable: true,
  });
}

/** Localize the native device-picker dialog (it defaults to English). */
export function setNativeBluetoothStrings(strings: DisplayStrings): void {
  if (!isNativeAndroid()) return;
  void BleClient.setDisplayStrings(strings).catch(() => undefined);
}
