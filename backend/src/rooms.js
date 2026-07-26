/** Max riders per group-ride room (product rule). */
export const MAX_ROOM_MEMBERS = 20;

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * @param {number} [length]
 */
export function generateRoomCode(length = 6) {
  let code = '';
  for (let i = 0; i < length; i += 1) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {string} code
 */
export function findRoomByCode(db, code) {
  return db
    .prepare(`SELECT * FROM rooms WHERE code = ? COLLATE NOCASE`)
    .get(String(code || '').trim().toUpperCase());
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {number} roomId
 */
export function getRoomRow(db, roomId) {
  return db.prepare('SELECT * FROM rooms WHERE id = ?').get(roomId);
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {number} roomId
 */
export function listRoomMembers(db, roomId) {
  return db
    .prepare(
      `SELECT room_id, user_id, display_name, joined_at, last_seen
       FROM room_members
       WHERE room_id = ?
       ORDER BY joined_at ASC, user_id ASC`,
    )
    .all(roomId);
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {number} roomId
 */
export function countRoomMembers(db, roomId) {
  const row = db
    .prepare('SELECT COUNT(*) AS n FROM room_members WHERE room_id = ?')
    .get(roomId);
  return Number(row?.n ?? 0);
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {number} roomId
 * @param {number} userId
 */
export function getRoomMember(db, roomId, userId) {
  return db
    .prepare('SELECT * FROM room_members WHERE room_id = ? AND user_id = ?')
    .get(roomId, userId);
}

/**
 * @param {Record<string, unknown>} room
 * @param {Record<string, unknown>[]} members
 */
export function toPublicRoom(room, members) {
  let route = null;
  try {
    route = typeof room.route_json === 'string' ? JSON.parse(room.route_json) : null;
  } catch {
    route = null;
  }

  return {
    id: room.id,
    code: room.code,
    hostUserId: room.host_user_id,
    status: room.status,
    route,
    createdAt: room.created_at,
    maxMembers: room.max_members ?? MAX_ROOM_MEMBERS,
    members: members.map((m) => ({
      userId: m.user_id,
      displayName: m.display_name || `Rider ${m.user_id}`,
      joinedAt: m.joined_at,
      lastSeen: m.last_seen,
      isHost: m.user_id === room.host_user_id,
    })),
  };
}

/**
 * Validate a route payload large enough for the ride engine.
 * @param {unknown} route
 */
export function validateRoutePayload(route) {
  if (!route || typeof route !== 'object') return 'route is required';
  const r = /** @type {Record<string, unknown>} */ (route);
  if (!r.geometry || typeof r.geometry !== 'object') return 'route.geometry is required';
  const geometry = /** @type {Record<string, unknown>} */ (r.geometry);
  if (geometry.type !== 'LineString') return 'route.geometry must be a LineString';
  if (!Array.isArray(geometry.coordinates) || geometry.coordinates.length < 2) {
    return 'route.geometry.coordinates must have at least 2 points';
  }
  if (!Array.isArray(r.samples) || r.samples.length < 2) {
    return 'route.samples must have at least 2 points';
  }
  const distance = Number(r.distanceMeters);
  if (!Number.isFinite(distance) || distance <= 0) {
    return 'route.distanceMeters must be a positive number';
  }
  return null;
}
