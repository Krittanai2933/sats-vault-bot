import Database from 'better-sqlite3';
import 'dotenv/config';

const db = new Database(process.env.DB_PATH || './vault.db');
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    guild_id     TEXT NOT NULL,
    discord_id   TEXT NOT NULL,
    balance_sats INTEGER NOT NULL DEFAULT 0,
    joined_at    INTEGER NOT NULL,
    ln_address   TEXT,
    PRIMARY KEY (guild_id, discord_id)
  );

  CREATE TABLE IF NOT EXISTS pending_deposits (
    checking_id  TEXT PRIMARY KEY,
    guild_id     TEXT NOT NULL,
    discord_id   TEXT NOT NULL,
    amount_sats  INTEGER NOT NULL,
    created_at   INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS ledger_log (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id     TEXT NOT NULL,
    kind         TEXT NOT NULL,     -- 'deposit' | 'withdraw' | 'tip' | 'rain'
    from_id      TEXT,
    to_id        TEXT,
    amount_sats  INTEGER NOT NULL,
    created_at   INTEGER NOT NULL
  );
`);

// migration: เติมคอลัมน์ ln_address ให้ vault.db เก่าที่สร้างก่อนมีฟีเจอร์นี้
const userColumns = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
if (!userColumns.includes('ln_address')) {
  db.exec('ALTER TABLE users ADD COLUMN ln_address TEXT');
}

/** สร้าง user ถ้ายังไม่มี (idempotent) คืนค่า true ถ้าเพิ่งสร้างใหม่ — แยกยอดต่อ guild */
export function ensureUser(guildId, discordId) {
  const existing = db
    .prepare('SELECT 1 FROM users WHERE guild_id = ? AND discord_id = ?')
    .get(guildId, discordId);
  if (existing) return false;
  db.prepare(
    'INSERT INTO users (guild_id, discord_id, balance_sats, joined_at) VALUES (?, ?, 0, ?)'
  ).run(guildId, discordId, Date.now());
  return true;
}

export function getBalance(guildId, discordId) {
  const row = db
    .prepare('SELECT balance_sats FROM users WHERE guild_id = ? AND discord_id = ?')
    .get(guildId, discordId);
  return row ? row.balance_sats : null; // null = ยังไม่เคย /join ใน guild นี้
}

/** บันทึก Lightning Address ของ user ไว้ใช้เป็นปลายทางเริ่มต้นตอน /withdraw */
export function setLightningAddress(guildId, discordId, lnAddress) {
  db.prepare('UPDATE users SET ln_address = ? WHERE guild_id = ? AND discord_id = ?').run(
    lnAddress,
    guildId,
    discordId
  );
}

export function getLightningAddress(guildId, discordId) {
  const row = db
    .prepare('SELECT ln_address FROM users WHERE guild_id = ? AND discord_id = ?')
    .get(guildId, discordId);
  return row ? row.ln_address : null;
}

function logEntry(guildId, kind, fromId, toId, amount) {
  db.prepare(
    'INSERT INTO ledger_log (guild_id, kind, from_id, to_id, amount_sats, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(guildId, kind, fromId, toId, amount, Date.now());
}

/** โอนยอดภายในระหว่างสองคน "ในเซิร์ฟเวอร์เดียวกัน" แบบ atomic กัน race condition */
export const transfer = db.transaction((guildId, fromId, toId, amountSats, kind = 'tip') => {
  const sender = db
    .prepare('SELECT balance_sats FROM users WHERE guild_id = ? AND discord_id = ?')
    .get(guildId, fromId);
  if (!sender) throw new Error('SENDER_NOT_JOINED');
  if (sender.balance_sats < amountSats) throw new Error('INSUFFICIENT_BALANCE');

  db.prepare('UPDATE users SET balance_sats = balance_sats - ? WHERE guild_id = ? AND discord_id = ?')
    .run(amountSats, guildId, fromId);
  db.prepare('UPDATE users SET balance_sats = balance_sats + ? WHERE guild_id = ? AND discord_id = ?')
    .run(amountSats, guildId, toId);

  logEntry(guildId, kind, fromId, toId, amountSats);
});

/** แจกยอดจากคนเดียวให้หลายคนเท่า ๆ กัน ในเซิร์ฟเวอร์เดียวกัน (เศษที่หารไม่ลงตัวคืนให้ผู้แจก) */
export const rain = db.transaction((guildId, fromId, recipientIds, totalAmountSats) => {
  const sender = db
    .prepare('SELECT balance_sats FROM users WHERE guild_id = ? AND discord_id = ?')
    .get(guildId, fromId);
  if (!sender) throw new Error('SENDER_NOT_JOINED');
  if (sender.balance_sats < totalAmountSats) throw new Error('INSUFFICIENT_BALANCE');
  if (recipientIds.length === 0) throw new Error('NO_RECIPIENTS');

  const share = Math.floor(totalAmountSats / recipientIds.length);
  const actuallySpent = share * recipientIds.length;
  if (share <= 0) throw new Error('SHARE_TOO_SMALL');

  db.prepare('UPDATE users SET balance_sats = balance_sats - ? WHERE guild_id = ? AND discord_id = ?')
    .run(actuallySpent, guildId, fromId);

  const bump = db.prepare(
    'UPDATE users SET balance_sats = balance_sats + ? WHERE guild_id = ? AND discord_id = ?'
  );
  for (const id of recipientIds) {
    bump.run(share, guildId, id);
    logEntry(guildId, 'rain', fromId, id, share);
  }

  return { share, actuallySpent };
});

/** หักยอดออกจากบัญชี (ใช้ตอน /withdraw ที่เงินออกจากระบบไปจริง ๆ ไม่มีผู้รับฝั่งเลดเจอร์) */
export const withdraw = db.transaction((guildId, discordId, amountSats) => {
  const user = db
    .prepare('SELECT balance_sats FROM users WHERE guild_id = ? AND discord_id = ?')
    .get(guildId, discordId);
  if (!user) throw new Error('SENDER_NOT_JOINED');
  if (user.balance_sats < amountSats) throw new Error('INSUFFICIENT_BALANCE');

  db.prepare('UPDATE users SET balance_sats = balance_sats - ? WHERE guild_id = ? AND discord_id = ?')
    .run(amountSats, guildId, discordId);
  logEntry(guildId, 'withdraw', discordId, null, amountSats);
});

export function addPendingDeposit(checkingId, guildId, discordId, amountSats) {
  db.prepare(
    'INSERT INTO pending_deposits (checking_id, guild_id, discord_id, amount_sats, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(checkingId, guildId, discordId, amountSats, Date.now());
}

export function getPendingDeposit(checkingId) {
  return db.prepare('SELECT * FROM pending_deposits WHERE checking_id = ?').get(checkingId);
}

/** ปิดงาน pending deposit + เติมเงินให้ user แบบ atomic (เข้ายอดของ guild ที่สั่ง /deposit ไว้ตอนแรก) */
export const resolveDeposit = db.transaction((checkingId) => {
  const pending = db.prepare('SELECT * FROM pending_deposits WHERE checking_id = ?').get(checkingId);
  if (!pending) return null;

  db.prepare('UPDATE users SET balance_sats = balance_sats + ? WHERE guild_id = ? AND discord_id = ?')
    .run(pending.amount_sats, pending.guild_id, pending.discord_id);
  db.prepare('DELETE FROM pending_deposits WHERE checking_id = ?').run(checkingId);
  logEntry(pending.guild_id, 'deposit', null, pending.discord_id, pending.amount_sats);

  return pending;
});

export function deletePendingDeposit(checkingId) {
  db.prepare('DELETE FROM pending_deposits WHERE checking_id = ?').run(checkingId);
}

export function getAllJoinedIds(guildId, excludeId = null) {
  const rows = db
    .prepare('SELECT discord_id FROM users WHERE guild_id = ? AND discord_id != ?')
    .all(guildId, excludeId ?? '');
  return rows.map((r) => r.discord_id);
}

export function leaderboard(guildId, limit = 10) {
  return db
    .prepare(
      'SELECT discord_id, balance_sats FROM users WHERE guild_id = ? ORDER BY balance_sats DESC LIMIT ?'
    )
    .all(guildId, limit);
}

export default db;
