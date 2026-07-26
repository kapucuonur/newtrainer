/**
 * In-memory WebSocket hub for group-ride telemetry (~1–2 Hz peers broadcast).
 */

/**
 * @typedef {{
 *   socket: import('ws').WebSocket,
 *   userId: number,
 *   displayName: string,
 *   lastTelemetry: null | {
 *     lat: number,
 *     lng: number,
 *     distance_m: number,
 *     speed_kmh: number,
 *     power: number | null,
 *     hr: number | null,
 *     cadence: number | null,
 *     updatedAt: number,
 *   },
 * }} RoomClient
 */

export class RoomHub {
  constructor() {
    /** @type {Map<number, Map<number, RoomClient>>} */
    this.rooms = new Map();
    /** @type {Map<number, ReturnType<typeof setInterval>>} */
    this.tickers = new Map();
  }

  /**
   * @param {number} roomId
   * @param {RoomClient} client
   */
  addClient(roomId, client) {
    let map = this.rooms.get(roomId);
    if (!map) {
      map = new Map();
      this.rooms.set(roomId, map);
      this.#ensureTicker(roomId);
    }
    const prev = map.get(client.userId);
    if (prev && prev.socket !== client.socket) {
      try {
        prev.socket.close(4000, 'Replaced by new connection');
      } catch {
        // ignore
      }
    }
    map.set(client.userId, client);
  }

  /**
   * @param {number} roomId
   * @param {number} userId
   * @param {import('ws').WebSocket} [socket]
   */
  removeClient(roomId, userId, socket) {
    const map = this.rooms.get(roomId);
    if (!map) return;
    const current = map.get(userId);
    if (!current) return;
    if (socket && current.socket !== socket) return;
    map.delete(userId);
    if (map.size === 0) {
      this.rooms.delete(roomId);
      this.#clearTicker(roomId);
    }
  }

  /**
   * @param {number} roomId
   * @param {number} userId
   * @param {RoomClient['lastTelemetry']} telemetry
   */
  setTelemetry(roomId, userId, telemetry) {
    const client = this.rooms.get(roomId)?.get(userId);
    if (!client) return;
    client.lastTelemetry = telemetry;
  }

  /**
   * @param {number} roomId
   * @param {unknown} message
   * @param {number} [exceptUserId]
   */
  broadcast(roomId, message, exceptUserId) {
    const map = this.rooms.get(roomId);
    if (!map) return;
    const payload = JSON.stringify(message);
    for (const [userId, client] of map) {
      if (exceptUserId != null && userId === exceptUserId) continue;
      if (client.socket.readyState === 1) {
        try {
          client.socket.send(payload);
        } catch {
          // ignore broken socket
        }
      }
    }
  }

  /**
   * @param {number} roomId
   * @param {unknown} message
   */
  sendTo(roomId, userId, message) {
    const client = this.rooms.get(roomId)?.get(userId);
    if (!client || client.socket.readyState !== 1) return;
    try {
      client.socket.send(JSON.stringify(message));
    } catch {
      // ignore
    }
  }

  /**
   * @param {number} roomId
   */
  peersPayload(roomId) {
    const map = this.rooms.get(roomId);
    /** @type {Array<Record<string, unknown>>} */
    const riders = [];
    if (!map) return { type: 'peers', riders };
    const now = Date.now();
    for (const [userId, client] of map) {
      const t = client.lastTelemetry;
      if (!t) {
        riders.push({
          userId,
          displayName: client.displayName,
          lat: null,
          lng: null,
          distance_m: null,
          speed_kmh: null,
          power: null,
          hr: null,
          cadence: null,
          stale: true,
        });
        continue;
      }
      riders.push({
        userId,
        displayName: client.displayName,
        lat: t.lat,
        lng: t.lng,
        distance_m: t.distance_m,
        speed_kmh: t.speed_kmh,
        power: t.power,
        hr: t.hr,
        cadence: t.cadence,
        stale: now - t.updatedAt > 5000,
      });
    }
    return { type: 'peers', riders };
  }

  /**
   * @param {number} roomId
   */
  #ensureTicker(roomId) {
    if (this.tickers.has(roomId)) return;
    const id = setInterval(() => {
      const map = this.rooms.get(roomId);
      if (!map || map.size === 0) {
        this.#clearTicker(roomId);
        return;
      }
      this.broadcast(roomId, this.peersPayload(roomId));
    }, 700);
    this.tickers.set(roomId, id);
  }

  /**
   * @param {number} roomId
   */
  #clearTicker(roomId) {
    const id = this.tickers.get(roomId);
    if (id) clearInterval(id);
    this.tickers.delete(roomId);
  }
}
