import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import Fastify from 'fastify';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getMeRow,
  openDb,
  toPublicRide,
  toPublicUser,
} from './db.js';
import {
  hashPassword,
  normalizeEmail,
  validatePassword,
  verifyPassword,
} from './auth.js';
import { RoomHub } from './roomHub.js';
import {
  countRoomMembers,
  findRoomByCode,
  generateRoomCode,
  getRoomMember,
  getRoomRow,
  listRoomMembers,
  MAX_ROOM_MEMBERS,
  toPublicRoom,
  validateRoutePayload,
} from './rooms.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const PORT = Number(process.env.PORT || 8788);
const HOST = process.env.HOST || '127.0.0.1';
const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-change-me';
const COOKIE_SECURE = String(process.env.COOKIE_SECURE || 'false') === 'true';
const COOKIE_NAME = 'roadlab_token';
const DATA_DIR = path.resolve(ROOT, process.env.DATA_DIR || './data');

const DEFAULT_ORIGINS = [
  'https://newtrainer.trihonor.com',
  'https://newtrainer.vercel.app',
  'http://localhost:5173',
];

const CORS_ORIGINS = (process.env.CORS_ORIGINS || DEFAULT_ORIGINS.join(','))
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

if (!process.env.JWT_SECRET) {
  console.warn('[roadlab-api] JWT_SECRET not set — using insecure default (dev only)');
}

const db = openDb(DATA_DIR);
const roomHub = new RoomHub();

const app = Fastify({
  logger: true,
  // Summary JSON only — no FIT/GPX uploads (keeps Pi SD card light).
  bodyLimit: 256 * 1024,
});

await app.register(cors, {
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
});

await app.register(cookie);
await app.register(jwt, {
  secret: JWT_SECRET,
  cookie: {
    cookieName: COOKIE_NAME,
    signed: false,
  },
});
await app.register(rateLimit, {
  global: false,
});
await app.register(websocket);

/**
 * @param {import('fastify').FastifyReply} reply
 * @param {string} token
 */
function setAuthCookie(reply, token) {
  reply.setCookie(COOKIE_NAME, token, {
    path: '/',
    httpOnly: true,
    sameSite: COOKIE_SECURE ? 'none' : 'lax',
    secure: COOKIE_SECURE,
    maxAge: 60 * 60 * 24 * 30,
  });
}

/**
 * @param {import('fastify').FastifyReply} reply
 */
function clearAuthCookie(reply) {
  reply.clearCookie(COOKIE_NAME, {
    path: '/',
    httpOnly: true,
    sameSite: COOKIE_SECURE ? 'none' : 'lax',
    secure: COOKIE_SECURE,
  });
}

/**
 * @param {import('fastify').FastifyRequest} request
 * @param {import('fastify').FastifyReply} reply
 */
async function requireAuth(request, reply) {
  try {
    await request.jwtVerify();
  } catch {
    return reply.code(401).send({ error: 'Unauthorized' });
  }
}

app.get('/api/health', async () => ({
  ok: true,
  service: 'roadlab-api',
  time: new Date().toISOString(),
}));

app.post(
  '/api/auth/register',
  {
    config: {
      rateLimit: {
        max: 10,
        timeWindow: '1 minute',
      },
    },
  },
  async (request, reply) => {
    const body = /** @type {{ email?: unknown; password?: unknown; displayName?: unknown }} */ (
      request.body || {}
    );
    const email = normalizeEmail(body.email);
    const passwordError = validatePassword(body.password);
    if (!email) return reply.code(400).send({ error: 'Valid email is required' });
    if (passwordError) return reply.code(400).send({ error: passwordError });

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) return reply.code(409).send({ error: 'Email already registered' });

    const passwordHash = await hashPassword(/** @type {string} */ (body.password));
    const displayName =
      typeof body.displayName === 'string' && body.displayName.trim()
        ? body.displayName.trim().slice(0, 80)
        : null;

    const insert = db.transaction(() => {
      const result = db
        .prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)')
        .run(email, passwordHash);
      const userId = Number(result.lastInsertRowid);
      db.prepare('INSERT INTO profiles (user_id, display_name) VALUES (?, ?)').run(
        userId,
        displayName,
      );
      return userId;
    });

    const userId = insert();
    const token = await reply.jwtSign({ sub: userId, email }, { expiresIn: '30d' });
    setAuthCookie(reply, token);
    return {
      token,
      user: toPublicUser(getMeRow(db, userId)),
    };
  },
);

app.post(
  '/api/auth/login',
  {
    config: {
      rateLimit: {
        max: 20,
        timeWindow: '1 minute',
      },
    },
  },
  async (request, reply) => {
    const body = /** @type {{ email?: unknown; password?: unknown }} */ (request.body || {});
    const email = normalizeEmail(body.email);
    if (!email || typeof body.password !== 'string') {
      return reply.code(400).send({ error: 'Email and password are required' });
    }

    const row = db
      .prepare('SELECT id, email, password_hash FROM users WHERE email = ?')
      .get(email);
    if (!row) return reply.code(401).send({ error: 'Invalid email or password' });

    const ok = await verifyPassword(body.password, row.password_hash);
    if (!ok) return reply.code(401).send({ error: 'Invalid email or password' });

    const token = await reply.jwtSign(
      { sub: row.id, email: row.email },
      { expiresIn: '30d' },
    );
    setAuthCookie(reply, token);
    return {
      token,
      user: toPublicUser(getMeRow(db, row.id)),
    };
  },
);

app.post('/api/auth/logout', async (_request, reply) => {
  clearAuthCookie(reply);
  return { ok: true };
});

app.get('/api/me', { preHandler: requireAuth }, async (request, reply) => {
  const userId = Number(request.user.sub);
  const user = toPublicUser(getMeRow(db, userId));
  if (!user) return reply.code(404).send({ error: 'User not found' });
  return { user };
});

app.patch('/api/me/profile', { preHandler: requireAuth }, async (request, reply) => {
  const userId = Number(request.user.sub);
  const body = /** @type {Record<string, unknown>} */ (request.body || {});

  const current = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(userId);
  if (!current) {
    db.prepare('INSERT INTO profiles (user_id) VALUES (?)').run(userId);
  }

  const next = {
    display_name: current?.display_name ?? null,
    weight_kg: current?.weight_kg ?? null,
    ftp: current?.ftp ?? null,
    bike_weight_kg: current?.bike_weight_kg ?? null,
  };

  if ('displayName' in body) {
    if (body.displayName === null || body.displayName === '') {
      next.display_name = null;
    } else if (typeof body.displayName === 'string') {
      next.display_name = body.displayName.trim().slice(0, 80) || null;
    } else {
      return reply.code(400).send({ error: 'displayName must be a string' });
    }
  }

  for (const [key, column] of [
    ['weightKg', 'weight_kg'],
    ['bikeWeightKg', 'bike_weight_kg'],
  ]) {
    if (!(key in body)) continue;
    const value = body[key];
    if (value === null || value === '') {
      next[column] = null;
    } else {
      const num = Number(value);
      if (!Number.isFinite(num) || num <= 0 || num > 500) {
        return reply.code(400).send({ error: `${key} must be a positive number` });
      }
      next[column] = Math.round(num * 100) / 100;
    }
  }

  if ('ftp' in body) {
    if (body.ftp === null || body.ftp === '') {
      next.ftp = null;
    } else {
      const num = Number(body.ftp);
      if (!Number.isInteger(num) || num <= 0 || num > 2000) {
        return reply.code(400).send({ error: 'ftp must be a positive integer' });
      }
      next.ftp = num;
    }
  }

  db.prepare(
    `UPDATE profiles
     SET display_name = ?, weight_kg = ?, ftp = ?, bike_weight_kg = ?,
         updated_at = datetime('now')
     WHERE user_id = ?`,
  ).run(next.display_name, next.weight_kg, next.ftp, next.bike_weight_kg, userId);

  return { user: toPublicUser(getMeRow(db, userId)) };
});

app.get('/api/rides', { preHandler: requireAuth }, async (request) => {
  const userId = Number(request.user.sub);
  const rows = db
    .prepare(
      `SELECT * FROM rides
       WHERE user_id = ?
       ORDER BY started_at DESC, id DESC
       LIMIT 100`,
    )
    .all(userId);
  return { rides: rows.map(toPublicRide) };
});

app.get('/api/rides/:id', { preHandler: requireAuth }, async (request, reply) => {
  const userId = Number(request.user.sub);
  const id = Number(/** @type {{ id: string }} */ (request.params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return reply.code(400).send({ error: 'Invalid ride id' });
  }
  const row = db.prepare('SELECT * FROM rides WHERE id = ? AND user_id = ?').get(id, userId);
  if (!row) return reply.code(404).send({ error: 'Ride not found' });
  return { ride: toPublicRide(row) };
});

/**
 * @param {Record<string, unknown>} body
 * @param {string} camel
 * @param {string} snake
 */
function optionalNumber(body, camel, snake) {
  const raw = body[camel] ?? body[snake];
  if (raw === undefined || raw === null || raw === '') return null;
  const num = Number(raw);
  if (!Number.isFinite(num)) return { error: `${camel} must be a number` };
  return { value: num };
}

app.post('/api/rides', { preHandler: requireAuth }, async (request, reply) => {
  const userId = Number(request.user.sub);
  const body = /** @type {Record<string, unknown>} */ (request.body || {});

  const startedAtRaw = body.startedAt ?? body.started_at;
  const startedAt =
    typeof startedAtRaw === 'string' ? startedAtRaw.trim() : '';
  if (!startedAt) {
    return reply.code(400).send({ error: 'startedAt is required' });
  }

  const distanceM = Number(body.distanceM ?? body.distance_m ?? 0);
  const durationS = Math.round(Number(body.durationS ?? body.duration_s ?? 0));
  if (!Number.isFinite(distanceM) || distanceM < 0) {
    return reply.code(400).send({ error: 'distanceM must be a non-negative number' });
  }
  if (!Number.isFinite(durationS) || durationS < 0) {
    return reply.code(400).send({ error: 'durationS must be a non-negative integer' });
  }

  const endedAtRaw = body.endedAt ?? body.ended_at;
  const endedAt =
    typeof endedAtRaw === 'string' && endedAtRaw.trim()
      ? endedAtRaw.trim()
      : null;
  const routeNameRaw = body.routeName ?? body.route_name;
  const routeName =
    typeof routeNameRaw === 'string'
      ? routeNameRaw.trim().slice(0, 160) || null
      : null;

  /** @type {Record<string, number | null>} */
  const stats = {
    avgPower: null,
    maxPower: null,
    avgHr: null,
    maxHr: null,
    avgSpeedKmh: null,
    maxSpeedKmh: null,
    elevationGainM: null,
  };
  /** @type {[keyof typeof stats, string, string][]} */
  const optionalFields = [
    ['avgPower', 'avgPower', 'avg_power'],
    ['maxPower', 'maxPower', 'max_power'],
    ['avgHr', 'avgHr', 'avg_hr'],
    ['maxHr', 'maxHr', 'max_hr'],
    ['avgSpeedKmh', 'avgSpeedKmh', 'avg_speed_kmh'],
    ['maxSpeedKmh', 'maxSpeedKmh', 'max_speed_kmh'],
    ['elevationGainM', 'elevationGainM', 'elevation_gain_m'],
  ];
  for (const [key, camel, snake] of optionalFields) {
    const parsed = optionalNumber(body, camel, snake);
    if (parsed && 'error' in parsed) {
      return reply.code(400).send({ error: parsed.error });
    }
    stats[key] = parsed?.value ?? null;
  }

  const insert = db
    .prepare(
      `INSERT INTO rides (
         user_id, route_name, started_at, ended_at,
         distance_m, duration_s,
         avg_power, max_power, avg_hr, max_hr,
         avg_speed_kmh, max_speed_kmh, elevation_gain_m
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      userId,
      routeName,
      startedAt,
      endedAt,
      distanceM,
      durationS,
      stats.avgPower,
      stats.maxPower,
      stats.avgHr,
      stats.maxHr,
      stats.avgSpeedKmh,
      stats.maxSpeedKmh,
      stats.elevationGainM,
    );

  const rideId = Number(insert.lastInsertRowid);
  const row = db.prepare('SELECT * FROM rides WHERE id = ?').get(rideId);
  return reply.code(201).send({ ride: toPublicRide(row) });
});

app.get(
  '/api/rides/:id/download/:kind',
  { preHandler: requireAuth },
  async (_request, reply) => {
    return reply.code(410).send({
      error:
        'FIT/GPX are not stored on the server. Download them from the browser after the ride.',
      code: 'FILES_NOT_STORED',
    });
  },
);

/**
 * @param {number} roomId
 */
function publicRoomById(roomId) {
  const room = getRoomRow(db, roomId);
  if (!room) return null;
  return toPublicRoom(room, listRoomMembers(db, roomId));
}

/**
 * @param {number} userId
 */
function displayNameForUser(userId) {
  const me = getMeRow(db, userId);
  const name = me?.display_name?.trim();
  if (name) return name.slice(0, 80);
  const email = typeof me?.email === 'string' ? me.email : '';
  const local = email.includes('@') ? email.split('@')[0] : '';
  return (local || `Rider ${userId}`).slice(0, 80);
}

/**
 * @param {unknown} raw
 */
function parseRoomId(raw) {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
}

app.post('/api/rooms', { preHandler: requireAuth }, async (request, reply) => {
  const userId = Number(request.user.sub);
  const body = /** @type {{ route?: unknown }} */ (request.body || {});
  const routeError = validateRoutePayload(body.route);
  if (routeError) return reply.code(400).send({ error: routeError });

  const routeJson = JSON.stringify(body.route);
  let code = generateRoomCode();
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const clash = findRoomByCode(db, code);
    if (!clash) break;
    code = generateRoomCode();
  }

  const insert = db.transaction(() => {
    const result = db
      .prepare(
        `INSERT INTO rooms (code, host_user_id, status, route_json, max_members)
         VALUES (?, ?, 'lobby', ?, ?)`,
      )
      .run(code, userId, routeJson, MAX_ROOM_MEMBERS);
    const roomId = Number(result.lastInsertRowid);
    db.prepare(
      `INSERT INTO room_members (room_id, user_id, display_name)
       VALUES (?, ?, ?)`,
    ).run(roomId, userId, displayNameForUser(userId));
    return roomId;
  });

  const roomId = insert();
  return reply.code(201).send({ room: publicRoomById(roomId) });
});

app.post('/api/rooms/join', { preHandler: requireAuth }, async (request, reply) => {
  const userId = Number(request.user.sub);
  const body = /** @type {{ code?: unknown }} */ (request.body || {});
  const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : '';
  if (!code || code.length < 4) {
    return reply.code(400).send({ error: 'Valid room code is required' });
  }

  const room = findRoomByCode(db, code);
  if (!room) return reply.code(404).send({ error: 'Room not found' });
  if (room.status === 'ended') {
    return reply.code(410).send({ error: 'Room has ended' });
  }

  const existing = getRoomMember(db, room.id, userId);
  if (!existing) {
    const count = countRoomMembers(db, room.id);
    const max = Number(room.max_members) || MAX_ROOM_MEMBERS;
    if (count >= max) {
      return reply.code(409).send({
        error: `Room is full (max ${max} riders)`,
        code: 'ROOM_FULL',
        maxMembers: max,
      });
    }
    db.prepare(
      `INSERT INTO room_members (room_id, user_id, display_name)
       VALUES (?, ?, ?)`,
    ).run(room.id, userId, displayNameForUser(userId));
  } else {
    db.prepare(
      `UPDATE room_members
       SET display_name = ?, last_seen = datetime('now')
       WHERE room_id = ? AND user_id = ?`,
    ).run(displayNameForUser(userId), room.id, userId);
  }

  const publicRoom = publicRoomById(room.id);
  const member = publicRoom?.members.find((m) => m.userId === userId);
  roomHub.broadcast(room.id, {
    type: 'member_join',
    member,
    room: publicRoom,
  });

  return { room: publicRoom };
});

app.get('/api/rooms/:id', { preHandler: requireAuth }, async (request, reply) => {
  const userId = Number(request.user.sub);
  const roomId = parseRoomId(/** @type {{ id: string }} */ (request.params).id);
  if (!roomId) return reply.code(400).send({ error: 'Invalid room id' });

  const member = getRoomMember(db, roomId, userId);
  if (!member) return reply.code(403).send({ error: 'Not a member of this room' });

  const room = publicRoomById(roomId);
  if (!room) return reply.code(404).send({ error: 'Room not found' });
  return { room };
});

app.post('/api/rooms/:id/start', { preHandler: requireAuth }, async (request, reply) => {
  const userId = Number(request.user.sub);
  const roomId = parseRoomId(/** @type {{ id: string }} */ (request.params).id);
  if (!roomId) return reply.code(400).send({ error: 'Invalid room id' });

  const room = getRoomRow(db, roomId);
  if (!room) return reply.code(404).send({ error: 'Room not found' });
  if (room.host_user_id !== userId) {
    return reply.code(403).send({ error: 'Only the host can start the ride' });
  }
  if (room.status === 'ended') {
    return reply.code(410).send({ error: 'Room has ended' });
  }
  if (room.status === 'live') {
    return { room: publicRoomById(roomId) };
  }

  db.prepare(`UPDATE rooms SET status = 'live' WHERE id = ?`).run(roomId);
  const publicRoom = publicRoomById(roomId);
  roomHub.broadcast(roomId, { type: 'start', room: publicRoom });
  return { room: publicRoom };
});

app.post('/api/rooms/:id/leave', { preHandler: requireAuth }, async (request, reply) => {
  const userId = Number(request.user.sub);
  const roomId = parseRoomId(/** @type {{ id: string }} */ (request.params).id);
  if (!roomId) return reply.code(400).send({ error: 'Invalid room id' });

  const room = getRoomRow(db, roomId);
  if (!room) return reply.code(404).send({ error: 'Room not found' });

  const member = getRoomMember(db, roomId, userId);
  if (!member) return { ok: true };

  db.prepare('DELETE FROM room_members WHERE room_id = ? AND user_id = ?').run(
    roomId,
    userId,
  );
  roomHub.removeClient(roomId, userId);
  roomHub.broadcast(roomId, {
    type: 'member_leave',
    userId,
    room: publicRoomById(roomId),
  });

  if (room.host_user_id === userId && room.status !== 'ended') {
    db.prepare(`UPDATE rooms SET status = 'ended' WHERE id = ?`).run(roomId);
    roomHub.broadcast(roomId, {
      type: 'end',
      room: publicRoomById(roomId),
    });
  }

  return { ok: true };
});

app.post('/api/rooms/:id/end', { preHandler: requireAuth }, async (request, reply) => {
  const userId = Number(request.user.sub);
  const roomId = parseRoomId(/** @type {{ id: string }} */ (request.params).id);
  if (!roomId) return reply.code(400).send({ error: 'Invalid room id' });

  const room = getRoomRow(db, roomId);
  if (!room) return reply.code(404).send({ error: 'Room not found' });
  if (room.host_user_id !== userId) {
    return reply.code(403).send({ error: 'Only the host can end the room' });
  }

  db.prepare(`UPDATE rooms SET status = 'ended' WHERE id = ?`).run(roomId);
  const publicRoom = publicRoomById(roomId);
  roomHub.broadcast(roomId, { type: 'end', room: publicRoom });
  return { room: publicRoom };
});

app.get(
  '/ws/rooms/:id',
  { websocket: true },
  /**
   * @param {import('ws').WebSocket} socket
   * @param {import('fastify').FastifyRequest} request
   */
  (socket, request) => {
    const roomId = parseRoomId(/** @type {{ id: string }} */ (request.params).id);
    if (!roomId) {
      socket.close(4400, 'Invalid room id');
      return;
    }

    const query = /** @type {{ token?: string }} */ (request.query || {});
    const token =
      (typeof query.token === 'string' && query.token) ||
      request.cookies?.[COOKIE_NAME] ||
      '';

    /** @type {{ sub?: number | string } | null} */
    let payload = null;
    try {
      if (!token) throw new Error('missing token');
      payload = /** @type {{ sub?: number | string }} */ (app.jwt.verify(token));
    } catch {
      socket.close(4401, 'Unauthorized');
      return;
    }

    const userId = Number(payload?.sub);
    if (!Number.isInteger(userId) || userId <= 0) {
      socket.close(4401, 'Unauthorized');
      return;
    }

    const room = getRoomRow(db, roomId);
    if (!room || room.status === 'ended') {
      socket.close(4410, 'Room unavailable');
      return;
    }

    const member = getRoomMember(db, roomId, userId);
    if (!member) {
      socket.close(4403, 'Not a member');
      return;
    }

    const displayName = member.display_name || displayNameForUser(userId);
    roomHub.addClient(roomId, {
      socket,
      userId,
      displayName,
      lastTelemetry: null,
    });

    db.prepare(
      `UPDATE room_members SET last_seen = datetime('now') WHERE room_id = ? AND user_id = ?`,
    ).run(roomId, userId);

    socket.send(
      JSON.stringify({
        type: 'hello',
        room: publicRoomById(roomId),
        peers: roomHub.peersPayload(roomId).riders,
      }),
    );
    roomHub.broadcast(
      roomId,
      {
        type: 'member_join',
        member: {
          userId,
          displayName,
          isHost: room.host_user_id === userId,
        },
        room: publicRoomById(roomId),
      },
      userId,
    );

    let lastTelemetryAt = 0;

    socket.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (!msg || typeof msg !== 'object') return;

      if (msg.type === 'telemetry') {
        const now = Date.now();
        if (now - lastTelemetryAt < 400) return;
        lastTelemetryAt = now;

        const lat = Number(msg.lat);
        const lng = Number(msg.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

        const distance_m = Number(msg.distance_m ?? msg.distanceM ?? 0);
        const speed_kmh = Number(msg.speed_kmh ?? msg.speedKmh ?? 0);
        const powerRaw = msg.power;
        const hrRaw = msg.hr ?? msg.heartRateBpm;
        const cadenceRaw = msg.cadence ?? msg.cadenceRpm;

        roomHub.setTelemetry(roomId, userId, {
          lat,
          lng,
          distance_m: Number.isFinite(distance_m) ? distance_m : 0,
          speed_kmh: Number.isFinite(speed_kmh) ? speed_kmh : 0,
          power:
            powerRaw == null || powerRaw === ''
              ? null
              : Number.isFinite(Number(powerRaw))
                ? Number(powerRaw)
                : null,
          hr:
            hrRaw == null || hrRaw === ''
              ? null
              : Number.isFinite(Number(hrRaw))
                ? Number(hrRaw)
                : null,
          cadence:
            cadenceRaw == null || cadenceRaw === ''
              ? null
              : Number.isFinite(Number(cadenceRaw))
                ? Number(cadenceRaw)
                : null,
          updatedAt: now,
        });

        db.prepare(
          `UPDATE room_members SET last_seen = datetime('now') WHERE room_id = ? AND user_id = ?`,
        ).run(roomId, userId);
        return;
      }

      if (msg.type === 'ping') {
        try {
          socket.send(JSON.stringify({ type: 'pong' }));
        } catch {
          // ignore
        }
      }
    });

    socket.on('close', () => {
      roomHub.removeClient(roomId, userId, socket);
      roomHub.broadcast(roomId, {
        type: 'member_leave',
        userId,
        room: publicRoomById(roomId),
      });
    });
  },
);

try {
  await app.listen({ port: PORT, host: HOST });
  console.log(`[roadlab-api] listening on http://${HOST}:${PORT}`);
  console.log(`[roadlab-api] data dir: ${DATA_DIR}`);
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
