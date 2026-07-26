/**
 * WiFi / network smart trainers (e.g. some Tacx, Elite, Wahoo over local network)
 * cannot be controlled directly from a sandboxed browser tab without a local bridge.
 *
 * Architecture (best-effort path):
 * 1. Browser talks to a local WebSocket bridge (ws://127.0.0.1:8787)
 * 2. Bridge speaks the trainer's native protocol (ANT+ FE-C over USB stick,
 *    Tacx FEC over BLE already covered by FTMS, or vendor WiFi APIs)
 * 3. Bridge exposes the same FTMS-like control surface used by FtmsTrainer
 *
 * This stub documents the contract and provides a connect attempt that fails
 * gracefully when no bridge is running — without inventing paid cloud services.
 */

export type WifiBridgeMessageCode =
  | 'wifi.wsUnavailable'
  | 'wifi.openFailed'
  | 'wifi.noBridge'
  | 'wifi.online'
  | 'wifi.browserLimited';

export interface WifiBridgeStatus {
  available: boolean;
  url: string;
  code: WifiBridgeMessageCode;
}

export const DEFAULT_WIFI_BRIDGE_URL = 'ws://127.0.0.1:8787';

export async function probeWifiBridge(
  url = DEFAULT_WIFI_BRIDGE_URL,
  timeoutMs = 1200,
): Promise<WifiBridgeStatus> {
  if (typeof WebSocket === 'undefined') {
    return {
      available: false,
      url,
      code: 'wifi.wsUnavailable',
    };
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (status: WifiBridgeStatus) => {
      if (settled) return;
      settled = true;
      try {
        socket.close();
      } catch {
        // ignore
      }
      resolve(status);
    };

    let socket: WebSocket;
    try {
      socket = new WebSocket(url);
    } catch {
      finish({
        available: false,
        url,
        code: 'wifi.openFailed',
      });
      return;
    }

    const timer = window.setTimeout(() => {
      finish({
        available: false,
        url,
        code: 'wifi.noBridge',
      });
    }, timeoutMs);

    socket.onopen = () => {
      window.clearTimeout(timer);
      finish({
        available: true,
        url,
        code: 'wifi.online',
      });
    };

    socket.onerror = () => {
      window.clearTimeout(timer);
      finish({
        available: false,
        url,
        code: 'wifi.browserLimited',
      });
    };
  });
}
