DROP INDEX IF EXISTS idx_proofs_dare_id;
DROP INDEX IF EXISTS idx_proofs_visibility;
DROP INDEX IF EXISTS idx_proofs_moderation_visibility;

CREATE TABLE proofs_new (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  dare_id TEXT NOT NULL REFERENCES dares(id) ON DELETE CASCADE,
  uploader_id TEXT,
  type TEXT NOT NULL CHECK (type IN ('photo','video')),
  storage_key TEXT NOT NULL,
  sha256 BLOB NOT NULL,
  width INTEGER,
  height INTEGER,
  duration_ms INTEGER,
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

INSERT INTO proofs_new (
  id,
  slug,
  dare_id,
  uploader_id,
  type,
  storage_key,
  sha256,
  width,
  height,
  duration_ms,
  size_bytes,
  moderation,
  visibility,
  caption,
  hashtags,
  watermark,
  published_at,
  created_at,
  updated_at
)
SELECT
  id,
  slug,
  dare_id,
  uploader_id,
  type,
  storage_key,
  sha256,
  width,
  height,
  NULL,
  size_bytes,
  moderation,
  visibility,
  caption,
  hashtags,
  watermark,
  published_at,
  created_at,
  updated_at
FROM proofs;

DROP TABLE proofs;
ALTER TABLE proofs_new RENAME TO proofs;

CREATE INDEX IF NOT EXISTS idx_proofs_dare_id ON proofs(dare_id);
CREATE INDEX IF NOT EXISTS idx_proofs_visibility ON proofs(visibility);
CREATE INDEX IF NOT EXISTS idx_proofs_moderation_visibility ON proofs(moderation, visibility);

DROP INDEX IF EXISTS idx_proof_assets_proof_id;

CREATE TABLE proof_assets_new (
  id TEXT PRIMARY KEY,
  proof_id TEXT NOT NULL REFERENCES proofs(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('original','jpeg','jpeg_redacted','thumb320','thumb640','thumb1280','poster','poster_redacted','mp4','webm','gif')),
  storage_key TEXT NOT NULL,
  mime TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  sha256 BLOB NOT NULL,
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO proof_assets_new (
  id,
  proof_id,
  kind,
  storage_key,
  mime,
  size_bytes,
  sha256,
  metadata,
  created_at
)
SELECT
  id,
  proof_id,
  kind,
  storage_key,
  mime,
  size_bytes,
  sha256,
  NULL,
  created_at
FROM proof_assets;

DROP TABLE proof_assets;
ALTER TABLE proof_assets_new RENAME TO proof_assets;

CREATE INDEX IF NOT EXISTS idx_proof_assets_proof_id ON proof_assets(proof_id);

CREATE TABLE IF NOT EXISTS moderation_reviews (
  id TEXT PRIMARY KEY,
  proof_id TEXT NOT NULL REFERENCES proofs(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('pending','approved','rejected')),
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  reviewed_at TEXT,
  reviewer_id TEXT,
  UNIQUE(proof_id)
);

CREATE INDEX IF NOT EXISTS idx_moderation_reviews_proof_id ON moderation_reviews(proof_id);
