CREATE TABLE IF NOT EXISTS dares (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT,
  range_n INTEGER NOT NULL,
  expiry_ts TEXT,
  visibility TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  commit_hash BLOB NOT NULL,
  commit_salt BLOB NOT NULL,
  committed_number INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS dare_invites (
  id TEXT PRIMARY KEY,
  dare_id TEXT NOT NULL REFERENCES dares(id) ON DELETE CASCADE,
  slug TEXT UNIQUE NOT NULL,
  jti TEXT UNIQUE NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_dare_invites_dare_id ON dare_invites(dare_id);
CREATE INDEX IF NOT EXISTS idx_dare_invites_slug ON dare_invites(slug);

CREATE TABLE IF NOT EXISTS acceptances (
  id TEXT PRIMARY KEY,
  dare_id TEXT NOT NULL REFERENCES dares(id) ON DELETE CASCADE,
  accepter_id TEXT,
  accepted_at TEXT NOT NULL,
  ip TEXT NOT NULL,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_acceptances_dare_id ON acceptances(dare_id);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  dare_id TEXT,
  type TEXT NOT NULL,
  payload TEXT NOT NULL,
  at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_events_dare_id ON events(dare_id);
CREATE INDEX IF NOT EXISTS idx_events_at ON events(at);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  id TEXT PRIMARY KEY,
  dare_id TEXT NOT NULL,
  key TEXT NOT NULL,
  response TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(dare_id, key)
);

CREATE TABLE IF NOT EXISTS invite_jti (
  jti TEXT PRIMARY KEY,
  consumed_at TEXT
);
