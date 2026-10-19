const fs = require("node:fs");
const path = require("node:path");
const Database = require("better-sqlite3");

const dataDirectory = path.join(__dirname, "data");
fs.mkdirSync(dataDirectory, { recursive: true });

const db = new Database(path.join(dataDirectory, "elderwood.sqlite"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    discord_id TEXT PRIMARY KEY,
    ign TEXT NOT NULL DEFAULT 'Belirtilmedi',
    silver INTEGER NOT NULL DEFAULT 0 CHECK (silver >= 0),
    xp INTEGER NOT NULL DEFAULT 0 CHECK (xp >= 0),
    level INTEGER NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 50),
    last_content TEXT,
    last_daily TEXT,
    excuse_until TEXT,
    excuse_reserved_days INTEGER NOT NULL DEFAULT 0 CHECK (excuse_reserved_days >= 0),
    monthly_excuse_days INTEGER NOT NULL DEFAULT 0 CHECK (monthly_excuse_days >= 0),
    excuse_month TEXT,
    content_count INTEGER NOT NULL DEFAULT 0 CHECK (content_count >= 0),
    archived_at TEXT
  );

  CREATE TABLE IF NOT EXISTS teams (
    team_id INTEGER PRIMARY KEY AUTOINCREMENT,
    members TEXT NOT NULL DEFAULT '[]'
  );

  CREATE TABLE IF NOT EXISTS applications (
    application_id INTEGER PRIMARY KEY AUTOINCREMENT,
    discord_id TEXT NOT NULL,
    ign TEXT NOT NULL,
    screenshot_url TEXT NOT NULL DEFAULT 'Belirtilmedi',
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at TEXT NOT NULL,
    resolved_at TEXT,
    pvp_fame INTEGER,
    pve_fame INTEGER
  );

  CREATE TABLE IF NOT EXISTS silver_requests (
    request_id INTEGER PRIMARY KEY AUTOINCREMENT,
    discord_id TEXT NOT NULL,
    amount INTEGER NOT NULL CHECK (amount > 0),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
    created_at TEXT NOT NULL,
    resolved_at TEXT
  );

  CREATE TABLE IF NOT EXISTS excuse_usage (
    discord_id TEXT NOT NULL,
    month_key TEXT NOT NULL,
    days_used INTEGER NOT NULL DEFAULT 0 CHECK (days_used >= 0 AND days_used <= 15),
    PRIMARY KEY (discord_id, month_key)
  );
`);

const screenshotColumn = db.prepare("PRAGMA table_info(applications)").all()
  .find((column) => column.name === "screenshot_url");
if (screenshotColumn.notnull && screenshotColumn.dflt_value === null) {
  db.transaction(() => {
    db.exec(`
      CREATE TABLE applications_new (
        application_id INTEGER PRIMARY KEY AUTOINCREMENT,
        discord_id TEXT NOT NULL,
        ign TEXT NOT NULL,
        screenshot_url TEXT NOT NULL DEFAULT 'Belirtilmedi',
        reason TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
        created_at TEXT NOT NULL,
        resolved_at TEXT,
        pvp_fame INTEGER,
        pve_fame INTEGER
      );
      INSERT INTO applications_new (
        application_id, discord_id, ign, screenshot_url, reason, status,
        created_at, resolved_at, pvp_fame, pve_fame
      )
      SELECT
        application_id, discord_id, ign, screenshot_url, reason, status,
        created_at, resolved_at, pvp_fame, pve_fame
      FROM applications;
      DROP TABLE applications;
      ALTER TABLE applications_new RENAME TO applications;
    `);
  })();
}

// Keep existing databases usable when columns are added in later versions.
const existingColumns = new Set(
  db.prepare("PRAGMA table_info(users)").all().map((column) => column.name)
);
for (const [column, definition] of [
  ["excuse_month", "TEXT"],
  ["excuse_reserved_days", "INTEGER NOT NULL DEFAULT 0"],
  ["content_count", "INTEGER NOT NULL DEFAULT 0"],
  ["archived_at", "TEXT"]
]) {
  if (!existingColumns.has(column)) {
    db.exec(`ALTER TABLE users ADD COLUMN ${column} ${definition}`);
  }
}

db.prepare(`
  INSERT OR IGNORE INTO excuse_usage (discord_id, month_key, days_used)
  SELECT discord_id, excuse_month, MIN(monthly_excuse_days, 15)
  FROM users
  WHERE excuse_month IS NOT NULL AND monthly_excuse_days > 0
`).run();
db.prepare(`
  UPDATE users
  SET excuse_reserved_days = MIN(
    15,
    MAX(0, CAST(julianday(excuse_until) - julianday('now') + 0.999999 AS INTEGER))
  )
  WHERE excuse_reserved_days = 0 AND excuse_until > ?
`).run(new Date().toISOString());

const ensureUserStatement = db.prepare(`
  INSERT INTO users (discord_id) VALUES (?)
  ON CONFLICT(discord_id) DO NOTHING
`);

function ensureUser(discordId) {
  ensureUserStatement.run(discordId);
  return db.prepare("SELECT * FROM users WHERE discord_id = ?").get(discordId);
}

function levelForXp(xp) {
  return Math.min(50, Math.floor(Math.max(0, xp) / 1000) + 1);
}

module.exports = { db, ensureUser, levelForXp };
