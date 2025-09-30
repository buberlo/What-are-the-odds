CREATE TABLE IF NOT EXISTS leaderboard_snapshots (
  id TEXT PRIMARY KEY,
  period TEXT NOT NULL CHECK (period IN ('daily','weekly','alltime')),
  category TEXT,
  with_proofs INTEGER NOT NULL DEFAULT 0 CHECK (with_proofs IN (0,1)),
  data TEXT NOT NULL,
  from_ts TEXT NOT NULL,
  to_ts TEXT NOT NULL,
  generated_at TEXT NOT NULL DEFAULT (datetime('now')),
  version INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_leaderboard_snapshots_period ON leaderboard_snapshots(period, category, with_proofs, generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_leaderboard_snapshots_window ON leaderboard_snapshots(from_ts, to_ts);
