import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import Fastify from 'fastify';
import fs from 'node:fs';
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const PORT = Number(process.env.PORT || 8788);
const HOST = process.env.HOST || '127.0.0.1';
const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-change-me';
const COOKIE_SECURE = String(process.env.COOKIE_SECURE || 'false') === 'true';
const COOKIE_NAME = 'roadlab_token';
const DATA_DIR = path.resolve(ROOT, process.env.DATA_DIR || './data');
const RIDES_DIR = path.join(DATA_DIR, 'rides');

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

const app = Fastify({
  logger: true,
  bodyLimit: 12 * 1024 * 1024,
});

await app.register(cors, {
  origin(origin, cb) {
    if (!origin || CORS_ORIGINS.includes(origin)) {
      cb(null, true);
      return;
    }
    cb(null, false);
  },
  credentials: true,
});

await app.register(cookie);
await app.register(jwt, {
  secret: JWT_SECRET,
  cookie: {
    cookieName: COOKIE_NAME,
    signed: false,
  },
});
await app.register(multipart, {
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 2,
    fields: 20,
  },
});
await app.register(rateLimit, {
  global: false,
});

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

app.post('/api/rides', { preHandler: requireAuth }, async (request, reply) => {
  const userId = Number(request.user.sub);
  const fields = /** @type {Record<string, string>} */ ({});
  /** @type {{ kind: 'fit' | 'gpx'; buffer: Buffer; filename: string }[]} */
  const files = [];

  const isMultipart = Boolean(request.isMultipart?.());
  if (isMultipart) {
    const parts = request.parts();
    for await (const part of parts) {
      if (part.type === 'file') {
        const buffer = await part.toBuffer();
        const field = part.fieldname === 'gpx' ? 'gpx' : part.fieldname === 'fit' ? 'fit' : null;
        if (!field) continue;
        if (buffer.length === 0) continue;
        files.push({
          kind: field,
          buffer,
          filename: part.filename || `ride.${field}`,
        });
      } else {
        fields[part.fieldname] = String(part.value ?? '');
      }
    }
  } else {
    Object.assign(fields, /** @type {Record<string, string>} */ (request.body || {}));
  }

  const startedAt = fields.startedAt || fields.started_at;
  if (!startedAt) {
    return reply.code(400).send({ error: 'startedAt is required' });
  }

  const distanceM = Number(fields.distanceM ?? fields.distance_m ?? 0);
  const durationS = Math.round(Number(fields.durationS ?? fields.duration_s ?? 0));
  if (!Number.isFinite(distanceM) || distanceM < 0) {
    return reply.code(400).send({ error: 'distanceM must be a non-negative number' });
  }
  if (!Number.isFinite(durationS) || durationS < 0) {
    return reply.code(400).send({ error: 'durationS must be a non-negative integer' });
  }

  const endedAt = fields.endedAt || fields.ended_at || null;
  const routeName = (fields.routeName || fields.route_name || '').trim().slice(0, 160) || null;

  const avgPowerRaw = fields.avgPower ?? fields.avg_power;
  const avgHrRaw = fields.avgHr ?? fields.avg_hr;
  const avgPower =
    avgPowerRaw === undefined || avgPowerRaw === ''
      ? null
      : Number(avgPowerRaw);
  const avgHr =
    avgHrRaw === undefined || avgHrRaw === '' ? null : Number(avgHrRaw);

  if (avgPower !== null && !Number.isFinite(avgPower)) {
    return reply.code(400).send({ error: 'avgPower must be a number' });
  }
  if (avgHr !== null && !Number.isFinite(avgHr)) {
    return reply.code(400).send({ error: 'avgHr must be a number' });
  }

  const insert = db
    .prepare(
      `INSERT INTO rides (
         user_id, route_name, started_at, ended_at,
         distance_m, duration_s, avg_power, avg_hr
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      userId,
      routeName,
      startedAt,
      endedAt,
      distanceM,
      durationS,
      avgPower,
      avgHr,
    );

  const rideId = Number(insert.lastInsertRowid);
  const userRideDir = path.join(RIDES_DIR, String(userId));
  fs.mkdirSync(userRideDir, { recursive: true });

  let fitPath = null;
  let gpxPath = null;

  for (const file of files) {
    const dest = path.join(userRideDir, `${rideId}.${file.kind}`);
    fs.writeFileSync(dest, file.buffer);
    if (file.kind === 'fit') fitPath = dest;
    if (file.kind === 'gpx') gpxPath = dest;
  }

  if (fitPath || gpxPath) {
    db.prepare('UPDATE rides SET fit_path = ?, gpx_path = ? WHERE id = ?').run(
      fitPath,
      gpxPath,
      rideId,
    );
  }

  const row = db.prepare('SELECT * FROM rides WHERE id = ?').get(rideId);
  return reply.code(201).send({ ride: toPublicRide(row) });
});

app.get(
  '/api/rides/:id/download/:kind',
  { preHandler: requireAuth },
  async (request, reply) => {
    const userId = Number(request.user.sub);
    const params = /** @type {{ id: string; kind: string }} */ (request.params);
    const id = Number(params.id);
    const kind = params.kind === 'fit' || params.kind === 'gpx' ? params.kind : null;
    if (!Number.isInteger(id) || id <= 0 || !kind) {
      return reply.code(400).send({ error: 'Invalid download request' });
    }

    const row = db.prepare('SELECT * FROM rides WHERE id = ? AND user_id = ?').get(id, userId);
    if (!row) return reply.code(404).send({ error: 'Ride not found' });

    const filePath = kind === 'fit' ? row.fit_path : row.gpx_path;
    if (!filePath || !fs.existsSync(filePath)) {
      return reply.code(404).send({ error: `${kind.toUpperCase()} file not found` });
    }

    const filename = `roadlab-ride-${id}.${kind}`;
    const contentType =
      kind === 'fit' ? 'application/octet-stream' : 'application/gpx+xml';
    reply.header('Content-Type', contentType);
    reply.header('Content-Disposition', `attachment; filename="${filename}"`);
    return reply.send(fs.createReadStream(filePath));
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
