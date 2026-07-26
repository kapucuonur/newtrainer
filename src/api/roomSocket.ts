import { getApiBaseUrl } from './config';
import { getStoredToken } from './client';
import type { PeerRider, Room } from './types';

export type RoomSocketEvent =
  | { type: 'hello'; room: Room; peers: PeerRider[] }
  | { type: 'peers'; riders: PeerRider[] }
  | {
      type: 'member_join';
      member?: { userId: number; displayName: string; isHost?: boolean };
      room?: Room;
    }
  | { type: 'member_leave'; userId: number; room?: Room }
  | { type: 'start'; room?: Room }
  | { type: 'end'; room?: Room }
  | { type: 'pong' };

export type TelemetryFrame = {
  lat: number;
  lng: number;
  distance_m: number;
  speed_kmh: number;
  power: number | null;
  hr: number | null;
  cadence: number | null;
};

type RoomSocketHandlers = {
  onEvent: (event: RoomSocketEvent) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: () => void;
};

function wsBaseUrl(): string {
  const base = getApiBaseUrl();
  if (!base) return '';
  if (base.startsWith('https://')) return `wss://${base.slice('https://'.length)}`;
  if (base.startsWith('http://')) return `ws://${base.slice('http://'.length)}`;
  return '';
}

export class RoomSocket {
  private socket: WebSocket | null = null;
  private lastTelemetryAt = 0;
  private closed = false;
  private roomId: number;
  private handlers: RoomSocketHandlers;

  constructor(roomId: number, handlers: RoomSocketHandlers) {
    this.roomId = roomId;
    this.handlers = handlers;
  }

  connect(): void {
    const base = wsBaseUrl();
    const token = getStoredToken();
    if (!base || !token) {
      this.handlers.onError?.();
      return;
    }

    const url = `${base}/ws/rooms/${this.roomId}?token=${encodeURIComponent(token)}`;
    const socket = new WebSocket(url);
    this.socket = socket;

    socket.addEventListener('open', () => {
      if (!this.closed) this.handlers.onOpen?.();
    });

    socket.addEventListener('message', (ev) => {
      try {
        const data = JSON.parse(String(ev.data)) as RoomSocketEvent;
        if (data && typeof data === 'object' && 'type' in data) {
          this.handlers.onEvent(data);
        }
      } catch {
        // ignore malformed frames
      }
    });

    socket.addEventListener('close', () => {
      if (!this.closed) this.handlers.onClose?.();
    });

    socket.addEventListener('error', () => {
      if (!this.closed) this.handlers.onError?.();
    });
  }

  sendTelemetry(frame: TelemetryFrame): void {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    const now = Date.now();
    if (now - this.lastTelemetryAt < 500) return;
    this.lastTelemetryAt = now;
    socket.send(JSON.stringify({ type: 'telemetry', ...frame }));
  }

  close(): void {
    this.closed = true;
    try {
      this.socket?.close();
    } catch {
      // ignore
    }
    this.socket = null;
  }
}
