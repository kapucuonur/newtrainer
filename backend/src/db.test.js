import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { deleteUser, openDb } from './db.js';

test('deleteUser removes the user and all of their data, leaves others intact', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roadlab-db-'));
  const db = openDb(dir);
  try {
    const addUser = (email) =>
      Number(
        db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)').run(email, 'x')
          .lastInsertRowid,
      );
    const a = addUser('a@example.test');
    const b = addUser('b@example.test');
    for (const id of [a, b]) {
      db.prepare('INSERT INTO profiles (user_id, display_name) VALUES (?, ?)').run(id, 'R');
      db.prepare('INSERT INTO rides (user_id, started_at) VALUES (?, ?)').run(id, '2026-01-01');
    }
    const room = Number(
      db.prepare('INSERT INTO rooms (code, host_user_id, route_json) VALUES (?, ?, ?)').run(
        'ABC123',
        a,
        '{}',
      ).lastInsertRowid,
    );
    db.prepare('INSERT INTO room_members (room_id, user_id) VALUES (?, ?)').run(room, a);
    db.prepare('INSERT INTO room_members (room_id, user_id) VALUES (?, ?)').run(room, b);

    assert.equal(deleteUser(db, a), true);

    const count = (sql, id) => db.prepare(sql).get(id).n;
    for (const id of [a]) {
      assert.equal(count('SELECT COUNT(*) n FROM users WHERE id = ?', id), 0);
      assert.equal(count('SELECT COUNT(*) n FROM profiles WHERE user_id = ?', id), 0);
      assert.equal(count('SELECT COUNT(*) n FROM rides WHERE user_id = ?', id), 0);
      assert.equal(count('SELECT COUNT(*) n FROM room_members WHERE user_id = ?', id), 0);
      assert.equal(count('SELECT COUNT(*) n FROM rooms WHERE host_user_id = ?', id), 0);
    }
    assert.equal(count('SELECT COUNT(*) n FROM users WHERE id = ?', b), 1);
    assert.equal(count('SELECT COUNT(*) n FROM rides WHERE user_id = ?', b), 1);

    assert.equal(deleteUser(db, a), false);
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
