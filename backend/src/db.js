import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Ensure summary-only ride columns exist; drop leftover FIT/GPX file paths + files.
 * @param {import('better-sqlite3').Database} db
 * @param {string} dataDir
 */
function migrateRidesLightStorage(db, dataDir) {
  const cols = new Set(
    db.prepare(`PRAGMA table_info(rides)`).all().map((c) => c.name),
  );
  /** @type {[string, string][]} */
  const extras = [
    ['max_power', 'REAL'],
    ['max_hr', 'REAL'],
    ['avg_speed_kmh', 'REAL'],
    ['max_speed_kmh', 'REAL'],
    ['elevation_gain_m', 'REAL'],
    ['avg_cadence', 'REAL'],
    ['max_cadence', 'REAL'],
  ];
  for (const [name, type] of extras) {
    if (!cols.has(name)) {
      db.exec(`ALTER TABLE rides ADD COLUMN ${name} ${type}`);
    }
  }

  const withFiles = db
    .prepare(
      `SELECT id, fit_path, gpx_path FROM rides
       WHERE fit_path IS NOT NULL OR gpx_path IS NOT NULL`,
    )
    .all();
  for (const row of withFiles) {
    for (const filePath of [row.fit_path, row.gpx_path]) {
      if (typeof filePath !== 'string' || !filePath) continue;
      try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch {
        // best-effort cleanup
      }
    }
  }
  if (withFiles.length > 0) {
    db.prepare(
      `UPDATE rides SET fit_path = NULL, gpx_path = NULL
       WHERE fit_path IS NOT NULL OR gpx_path IS NOT NULL`,
    ).run();
  }

  const ridesDir = path.join(dataDir, 'rides');
  if (fs.existsSync(ridesDir)) {
    try {
      fs.rmSync(ridesDir, { recursive: true, force: true });
    } catch {
      // leave orphan dir if busy; paths are already cleared
    }
  }
}

/**
 * @param {string} dataDir
 */
export function openDb(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });

  const dbPath = path.join(dataDir, 'roadlab.sqlite');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS profiles (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      display_name TEXT,
      weight_kg REAL,
      ftp INTEGER,
      bike_weight_kg REAL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS rides (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      route_name TEXT,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      distance_m REAL NOT NULL DEFAULT 0,
      duration_s INTEGER NOT NULL DEFAULT 0,
      avg_power REAL,
      avg_hr REAL,
      max_power REAL,
      max_hr REAL,
      avg_speed_kmh REAL,
      max_speed_kmh REAL,
      elevation_gain_m REAL,
      avg_cadence REAL,
      max_cadence REAL,
      fit_path TEXT,
      gpx_path TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_rides_user_started
      ON rides(user_id, started_at DESC);

    CREATE TABLE IF NOT EXISTS rooms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE COLLATE NOCASE,
      host_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'lobby'
        CHECK (status IN ('lobby', 'live', 'ended')),
      route_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      max_members INTEGER NOT NULL DEFAULT 20
    );

    CREATE TABLE IF NOT EXISTS room_members (
      room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      display_name TEXT,
      joined_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_seen TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (room_id, user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_rooms_code ON rooms(code);
    CREATE INDEX IF NOT EXISTS idx_room_members_room ON room_members(room_id);
  `);

  migrateRidesLightStorage(db, dataDir);

  return db;
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {number} userId
 */
export function getMeRow(db, userId) {
  return db
    .prepare(
      `SELECT
         u.id AS id,
         u.email AS email,
         u.created_at AS created_at,
         p.display_name AS display_name,
         p.weight_kg AS weight_kg,
         p.ftp AS ftp,
         p.bike_weight_kg AS bike_weight_kg
       FROM users u
       LEFT JOIN profiles p ON p.user_id = u.id
       WHERE u.id = ?`,
    )
    .get(userId);
}

/**
 * @param {ReturnType<typeof getMeRow>} row
 */
export function toPublicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    createdAt: row.created_at,
    profile: {
      displayName: row.display_name ?? null,
      weightKg: row.weight_kg ?? null,
      ftp: row.ftp ?? null,
      bikeWeightKg: row.bike_weight_kg ?? null,
    },
  };
}

/**
 * @param {unknown} value
 */
function numOrNull(value) {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {Record<string, unknown>} ride
 */
export function toPublicRide(ride) {
  return {
    id: ride.id,
    routeName: ride.route_name ?? null,
    startedAt: ride.started_at,
    endedAt: ride.ended_at ?? null,
    distanceM: ride.distance_m ?? 0,
    durationS: ride.duration_s ?? 0,
    avgPower: numOrNull(ride.avg_power),
    maxPower: numOrNull(ride.max_power),
    avgHr: numOrNull(ride.avg_hr),
    maxHr: numOrNull(ride.max_hr),
    avgSpeedKmh: numOrNull(ride.avg_speed_kmh),
    maxSpeedKmh: numOrNull(ride.max_speed_kmh),
    elevationGainM: numOrNull(ride.elevation_gain_m),
    avgCadence: numOrNull(ride.avg_cadence),
    maxCadence: numOrNull(ride.max_cadence),
    createdAt: ride.created_at,
  };
}
