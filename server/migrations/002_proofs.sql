CREATE TABLE IF NOT EXISTS proofs (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  dare_id TEXT NOT NULL REFERENCES dares(id) ON DELETE CASCADE,
  uploader_id TEXT,
  type TEXT NOT NULL CHECK (type IN ('photo')),
  storage_key TEXT NOT NULL,
  sha256 BLOB NOT NULL,
  width INTEGER,
  height INTEGER,
  size_bytes INTEGER NOT NULL,
  moderation TEXT NOT NULL DEFAULT 'pending',
  visibility TEXT NOT NULL DEFAULT 'unlisted',
  caption TEXT,
  hashtags TEXT,
  watermark INTEGER NOT NULL DEFAULT 1,
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS proof_assets (
  id TEXT PRIMARY KEY,
  proof_id TEXT NOT NULL REFERENCES proofs(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('original','jpeg','thumb320','thumb640','thumb1280','poster')),
  storage_key TEXT NOT NULL,
  mime TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  sha256 BLOB NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS proof_upload_tokens (
  id TEXT PRIMARY KEY,
  dare_id TEXT NOT NULL REFERENCES dares(id) ON DELETE CASCADE,
  storage_key TEXT NOT NULL,
  sha256 BLOB NOT NULL,
  size_bytes INTEGER NOT NULL,
  mime TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  uploaded_at TEXT,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(storage_key)
);

CREATE INDEX IF NOT EXISTS idx_proofs_dare_id ON proofs(dare_id);
CREATE INDEX IF NOT EXISTS idx_proofs_visibility ON proofs(visibility);
CREATE INDEX IF NOT EXISTS idx_proof_assets_proof_id ON proof_assets(proof_id);
CREATE INDEX IF NOT EXISTS idx_proof_upload_tokens_dare_id ON proof_upload_tokens(dare_id);
