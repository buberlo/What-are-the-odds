import crypto from "crypto";
import db from "../db.js";
import { runMigrations } from "../migrations.js";
import {
  PROOF_LIFECYCLE_ORIGINAL_DAYS,
  PROOF_LIFECYCLE_PUBLIC_DAYS,
} from "../config.js";
import {
  statObject,
  deleteKey,
  moveObject,
} from "../storage.js";
import { publishBus } from "../realtime/bus.js";

const originalCandidatesStmt = db.prepare(
  `SELECT p.id AS proof_id, p.dare_id, a.storage_key, a.mime
   FROM proofs p
   JOIN proof_assets a ON a.proof_id = p.id AND a.kind = 'original'
   WHERE p.visibility != 'public'
     AND datetime(p.created_at) < datetime('now', ?)
     AND (a.metadata IS NULL OR json_extract(a.metadata, '$.archivedAt') IS NULL)`
);

const updateOriginalMetadataStmt = db.prepare(
  `UPDATE proof_assets SET storage_key = ?, metadata = json_object('archivedAt', ?)
   WHERE proof_id = ? AND kind = 'original'`
);

const derivedPruneStmt = db.prepare(
  `SELECT a.id, a.proof_id, p.dare_id, a.kind, a.storage_key
   FROM proof_assets a
   JOIN proofs p ON p.id = a.proof_id
   WHERE p.visibility = 'private'
     AND a.kind IN ('mp4','webm','gif','poster','poster_redacted','jpeg','jpeg_redacted','thumb1280','thumb640')
     AND datetime(p.updated_at) < datetime('now', ?)`
);

const deleteAssetRowStmt = db.prepare(
  "DELETE FROM proof_assets WHERE id = ?"
);

const insertEvent = db.prepare(
  `INSERT INTO events (id, dare_id, type, payload, at) VALUES (?, ?, ?, ?, ?)`
);

const deriveArchiveKey = (key) => {
  if (key.includes("/original/")) return key.replace("/original/", "/archive/");
  const lastSlash = key.lastIndexOf("/");
  if (lastSlash === -1) return `archive/${key}`;
  return `${key.slice(0, lastSlash)}/archive${key.slice(lastSlash)}`;
};

export const runProofLifecycle = async () => {
  runMigrations(db);
  const archiveCutoff = `-${PROOF_LIFECYCLE_ORIGINAL_DAYS} days`;
  const pruneCutoff = `-${PROOF_LIFECYCLE_PUBLIC_DAYS} days`;
  const nowIso = new Date().toISOString();
  const originals = originalCandidatesStmt.all(archiveCutoff);
  for (const row of originals) {
    try {
      const targetKey = deriveArchiveKey(row.storage_key);
      await moveObject(row.storage_key, targetKey, row.mime);
      updateOriginalMetadataStmt.run(targetKey, nowIso, row.proof_id);
      insertEvent.run(crypto.randomUUID(), row.dare_id, "proof.original_archived", JSON.stringify({ id: row.proof_id, key: targetKey }), nowIso);
      publishBus("proof.original_archived", { dareId: row.dare_id, payload: { id: row.proof_id, key: targetKey }, at: nowIso });
    } catch (err) {
      console.error("lifecycle archive error", row.proof_id, err);
    }
  }
  const derived = derivedPruneStmt.all(pruneCutoff);
  for (const asset of derived) {
    try {
      const stat = await statObject(asset.storage_key);
      if (stat.exists) {
        await deleteKey(asset.storage_key);
      }
      deleteAssetRowStmt.run(asset.id);
      insertEvent.run(crypto.randomUUID(), asset.dare_id, "proof.asset_pruned", JSON.stringify({ id: asset.proof_id, kind: asset.kind }), nowIso);
      publishBus("proof.asset_pruned", { dareId: asset.dare_id, payload: { id: asset.proof_id, kind: asset.kind }, at: nowIso });
    } catch (err) {
      console.error("lifecycle prune error", asset.proof_id, err);
    }
  }
};

if (import.meta.url === `file://${process.argv[1]}`) {
  runProofLifecycle()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
