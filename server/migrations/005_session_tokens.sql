CREATE TABLE IF NOT EXISTS session_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  jti TEXT UNIQUE NOT NULL,
  issued_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  rotated_from TEXT,
  revoked_at TEXT,
  FOREIGN KEY(rotated_from) REFERENCES session_tokens(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_session_tokens_user_expiry ON session_tokens(user_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_session_tokens_jti ON session_tokens(jti);
