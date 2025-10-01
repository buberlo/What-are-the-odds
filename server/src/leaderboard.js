import { randomUUID } from "crypto";
import db from "./db.js";
import {
  LEADERBOARD_TOP_N,
  LEADERBOARD_VERSION,
  LEADERBOARD_RETENTION_DAILY,
  LEADERBOARD_RETENTION_WEEKLY,
  PUBLIC_ASSET_BASE,
} from "./config.js";

const resolvedStmt = db.prepare(
  `SELECT d.id AS dare_id, d.category AS category, a.accepter_id AS user_id, a.accepted_at AS accepted_at,
          e.at AS resolved_at, json_extract(e.payload, '$.matched') AS matched
   FROM events e
   JOIN dares d ON d.id = e.dare_id
   LEFT JOIN acceptances a ON a.dare_id = d.id
   WHERE e.type = 'dare.resolved'
     AND a.accepter_id IS NOT NULL
     AND datetime(e.at) >= datetime(?)
     AND datetime(e.at) < datetime(?)`
);

const proofsForDares = (dareIds) => {
  if (!dareIds.length) return new Map();
  const placeholders = dareIds.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT p.dare_id AS dare_id, p.id AS proof_id, p.slug AS slug, COALESCE(p.published_at, p.updated_at, p.created_at) AS ts,
              a.kind AS kind, a.storage_key AS storage_key
       FROM proofs p
       LEFT JOIN proof_assets a ON a.proof_id = p.id
       WHERE p.dare_id IN (${placeholders})
         AND p.moderation = 'approved'
         AND p.visibility != 'private'`
    )
    .all(...dareIds);
  const byDare = new Map();
  for (const row of rows) {
    if (!byDare.has(row.dare_id)) byDare.set(row.dare_id, new Map());
    const proofs = byDare.get(row.dare_id);
    if (!proofs.has(row.proof_id)) proofs.set(row.proof_id, { ts: row.ts, slug: row.slug, assets: new Map() });
    if (row.kind && row.storage_key) proofs.get(row.proof_id).assets.set(row.kind, row.storage_key);
  }
  const simplified = new Map();
  for (const [dareId, proofs] of byDare.entries()) {
    const entries = Array.from(proofs.entries())
      .map(([proofId, detail]) => ({
        proofId,
        slug: detail.slug,
        ts: Date.parse(detail.ts || ""),
        assets: detail.assets,
      }))
      .filter((entry) => Number.isFinite(entry.ts))
      .sort((a, b) => b.ts - a.ts);
    simplified.set(dareId, entries);
  }
  return simplified;
};

const encodeAssetUrl = (key) => {
  if (!key) return null;
  if (PUBLIC_ASSET_BASE) return `${PUBLIC_ASSET_BASE.replace(/\/$/, "")}/${key}`;
  const encoded = key.split("/").map(encodeURIComponent).join("/");
  return `/api/proofs/assets/${encoded}`;
};

const pickThumb = (entry) => {
  if (!entry) return null;
  const order = ["poster", "thumb640", "thumb320", "jpeg"];
  for (const kind of order) {
    if (entry.assets.has(kind)) return entry.assets.get(kind);
  }
  return null;
};

const filterCategory = (value, filter) => {
  if (!filter || filter.mode === "all") return true;
  if (filter.mode === "value") return value === filter.value;
  if (filter.mode === "none") return value === null || value === undefined;
  return false;
};

const normalizeCategoryFilter = (category) => {
  if (category === undefined || category === null) return { mode: "all" };
  if (category === "__none__") return { mode: "none" };
  return { mode: "value", value: category };
};

const medianOf = (values) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  return sorted[mid];
};

const toIso = (value) => new Date(value).toISOString();

export const computeLeaderboardEntries = ({ fromTs, toTs, category, withProofs, limit }) => {
  const categoryFilter = normalizeCategoryFilter(category);
  const start = new Date(fromTs).toISOString();
  const end = new Date(toTs).toISOString();
  const rows = resolvedStmt
    .all(start, end)
    .filter((row) => filterCategory(row.category, categoryFilter));
  if (!rows.length) return { entries: [], dareIds: [] };
  const dareIds = Array.from(new Set(rows.map((row) => row.dare_id)));
  const proofs = proofsForDares(dareIds);
  const filteredRows = withProofs
    ? rows.filter((row) => {
        const list = proofs.get(row.dare_id) || [];
        return list.length > 0;
      })
    : rows;
  if (!filteredRows.length) return { entries: [], dareIds: dareIds.filter((id) => proofs.has(id)) };
  filteredRows.sort((a, b) => Date.parse(a.resolved_at) - Date.parse(b.resolved_at));
  const stats = new Map();
  const dareToUser = new Map();
  for (const row of filteredRows) {
    const userId = row.user_id;
    if (!userId) continue;
    dareToUser.set(row.dare_id, userId);
    if (!stats.has(userId)) {
      stats.set(userId, {
        userId,
        handle: null,
        played: 0,
        wins: 0,
        triggered: 0,
        streak: 0,
        bestStreak: 0,
        durations: [],
        latestProofKey: null,
        latestProofSlug: null,
        latestProofTs: -Infinity,
      });
    }
    const entry = stats.get(userId);
    entry.played += 1;
    const rawMatched = row.matched;
    const matched =
      rawMatched === 1 ||
      rawMatched === "1" ||
      rawMatched === true ||
      rawMatched === "true" ||
      rawMatched === "TRUE";
    if (matched) {
      entry.triggered += 1;
      entry.streak = 0;
    } else {
      entry.wins += 1;
      entry.streak += 1;
      if (entry.streak > entry.bestStreak) entry.bestStreak = entry.streak;
    }
    const acceptedAt = Date.parse(row.accepted_at || "");
    const resolvedAt = Date.parse(row.resolved_at || "");
    if (Number.isFinite(acceptedAt) && Number.isFinite(resolvedAt) && resolvedAt >= acceptedAt) {
      entry.durations.push(resolvedAt - acceptedAt);
    }
  }
  for (const row of filteredRows.slice().reverse()) {
    const userId = dareToUser.get(row.dare_id);
    if (!userId) continue;
    const proofsList = proofs.get(row.dare_id) || [];
    if (!proofsList.length) continue;
    const entry = stats.get(userId);
    if (!entry) continue;
    const proof = proofsList[0];
    const key = pickThumb(proof);
    if (!key) continue;
    if (proof.ts > entry.latestProofTs) {
      entry.latestProofTs = proof.ts;
      entry.latestProofKey = key;
      entry.latestProofSlug = proof.slug;
    }
  }
  const ranking = Array.from(stats.values()).map((entry) => ({
    userId: entry.userId,
    handle: entry.handle,
    played: entry.played,
    wins: entry.wins,
    triggered: entry.triggered,
    streak: entry.bestStreak,
    median_completion_ms: medianOf(entry.durations),
    latest_proof_thumb: encodeAssetUrl(entry.latestProofKey),
    latest_proof_url: entry.latestProofSlug ? `/p/${entry.latestProofSlug}` : null,
  }));
  ranking.sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (a.triggered !== b.triggered) return a.triggered - b.triggered;
    if (b.streak !== a.streak) return b.streak - a.streak;
    if (b.played !== a.played) return b.played - a.played;
    const aMedian = a.median_completion_ms ?? Infinity;
    const bMedian = b.median_completion_ms ?? Infinity;
    if (aMedian !== bMedian) return aMedian - bMedian;
    return a.userId.localeCompare(b.userId);
  });
  const topLimit = Math.min(limit || LEADERBOARD_TOP_N, LEADERBOARD_TOP_N);
  return { entries: ranking.slice(0, topLimit), dareIds };
};

export const saveSnapshot = ({ period, category, withProofs, fromTs, toTs, entries }) => {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO leaderboard_snapshots (id, period, category, with_proofs, data, from_ts, to_ts, version)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    period,
    category ?? null,
    withProofs ? 1 : 0,
    JSON.stringify(entries),
    toIso(fromTs),
    toIso(toTs),
    LEADERBOARD_VERSION
  );
  pruneSnapshots(period);
  return id;
};

export const findSnapshot = ({ period, category, withProofs }) =>
  db
    .prepare(
      `SELECT * FROM leaderboard_snapshots
       WHERE period = ?
         AND (category IS ? OR category = ?)
         AND with_proofs = ?
         AND version = ?
       ORDER BY generated_at DESC
       LIMIT 1`
    )
    .get(period, category ?? null, category ?? null, withProofs ? 1 : 0, LEADERBOARD_VERSION);

export const findSnapshotByWindow = ({ period, category, withProofs, fromTs, toTs }) =>
  db
    .prepare(
      `SELECT * FROM leaderboard_snapshots
       WHERE period = ?
         AND (category IS ? OR category = ?)
         AND with_proofs = ?
         AND from_ts = ?
         AND to_ts = ?
         AND version = ?
       LIMIT 1`
    )
    .get(
      period,
      category ?? null,
      category ?? null,
      withProofs ? 1 : 0,
      toIso(fromTs),
      toIso(toTs),
      LEADERBOARD_VERSION
    );

export const pruneSnapshots = (period) => {
  if (period === "daily") {
    db.prepare(
      `DELETE FROM leaderboard_snapshots
       WHERE period = 'daily'
         AND id NOT IN (
           SELECT id FROM leaderboard_snapshots
           WHERE period = 'daily'
           ORDER BY generated_at DESC
           LIMIT ?
         )`
    ).run(LEADERBOARD_RETENTION_DAILY);
    return;
  }
  if (period === "weekly") {
    db.prepare(
      `DELETE FROM leaderboard_snapshots
       WHERE period = 'weekly'
         AND id NOT IN (
           SELECT id FROM leaderboard_snapshots
           WHERE period = 'weekly'
           ORDER BY generated_at DESC
           LIMIT ?
         )`
    ).run(LEADERBOARD_RETENTION_WEEKLY);
    return;
  }
  if (period === "alltime") {
    db.prepare(
      `DELETE FROM leaderboard_snapshots
       WHERE period = 'alltime'
         AND id NOT IN (
           SELECT id FROM leaderboard_snapshots
           WHERE period = 'alltime'
           ORDER BY generated_at DESC
           LIMIT 1
         )`
    ).run();
  }
};

export const listCategoriesForWindow = ({ fromTs, toTs }) => {
  const rows = db
    .prepare(
      `SELECT DISTINCT d.category AS category
       FROM events e
       JOIN dares d ON d.id = e.dare_id
       LEFT JOIN acceptances a ON a.dare_id = d.id
       WHERE e.type = 'dare.resolved'
         AND a.accepter_id IS NOT NULL
         AND datetime(e.at) >= datetime(?)
         AND datetime(e.at) < datetime(?)
         AND d.category IS NOT NULL`
    )
    .all(fromTs, toTs);
  return rows.map((row) => row.category).filter((value) => value !== null && value !== undefined);
};

export const snapshotPayload = (row) => {
  if (!row) return null;
  const entries = JSON.parse(row.data || "[]");
  return {
    id: row.id,
    period: row.period,
    category: row.category ?? null,
    withProofs: Boolean(row.with_proofs),
    fromTs: row.from_ts,
    toTs: row.to_ts,
    generatedAt: row.generated_at,
    version: row.version,
    entries,
  };
};
