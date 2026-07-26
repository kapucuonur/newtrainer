import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { hashPassword, normalizeEmail } from './auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.resolve(ROOT, process.env.DATA_DIR || './data');

async function createAdmin() {
  const emailInput = process.argv[2] || 'admin@trihonor.com';
  const passwordInput = process.argv[3] || 'Admin123456!';
  const nameInput = process.argv[4] || 'Admin Rider';

  const email = normalizeEmail(emailInput);
  if (!email) {
    console.error('Invalid email address');
    process.exit(1);
  }

  const db = openDb(DATA_DIR);

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  const hash = await hashPassword(passwordInput);

  if (existing) {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, existing.id);
    db.prepare(`
      INSERT INTO profiles (user_id, display_name, weight_kg, ftp, bike_weight_kg)
      VALUES (?, ?, 75, 280, 9.0)
      ON CONFLICT(user_id) DO UPDATE SET display_name = excluded.display_name
    `).run(existing.id, nameInput);
    console.log(`Updated user ${email} (ID: ${existing.id}) password and profile!`);
  } else {
    const res = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)').run(email, hash);
    const userId = Number(res.lastInsertRowid);
    db.prepare(`
      INSERT INTO profiles (user_id, display_name, weight_kg, ftp, bike_weight_kg)
      VALUES (?, ?, 75, 280, 9.0)
    `).run(userId, nameInput);
    console.log(`Created admin user ${email} (ID: ${userId}) successfully!`);
  }

  console.log(`Credentials:`);
  console.log(`Email: ${email}`);
  console.log(`Password: ${passwordInput}`);
}

createAdmin().catch((err) => {
  console.error('Error creating admin:', err);
  process.exit(1);
});
