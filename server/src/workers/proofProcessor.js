import { promises as fs } from "fs";
import sharp from "sharp";
import crypto from "crypto";
import db from "../db.js";
import { runMigrations } from "../migrations.js";
import {
  FEATURE_PROOF_MODERATION,
  PROOF_WATERMARK,
} from "../config.js";
import {
  writeBuffer,
  openReadStream,
  statObject,
} from "../storage.js";
import { createWorkspace } from "../media/workspace.js";
import { generatePhotoVariants } from "../media/image.js";
import { buildVideoDerivatives } from "../media/video.js";
import { evaluateModeration } from "../moderation.js";
import { publishBus } from "../realtime/bus.js";

const pendingStmt = db.prepare(
  `SELECT * FROM proofs
   WHERE NOT EXISTS (
     SELECT 1 FROM proof_assets a WHERE a.proof_id = proofs.id AND a.kind = 'poster'
   )
   ORDER BY created_at ASC`
);

const originalAssetStmt = db.prepare(
  "SELECT * FROM proof_assets WHERE proof_id = ? AND kind = 'original'"
);

const deleteAssetKind = db.prepare(
  "DELETE FROM proof_assets WHERE proof_id = ? AND kind = ?"
);

const insertAssetStmt = db.prepare(
  `INSERT INTO proof_assets (id, proof_id, kind, storage_key, mime, size_bytes, sha256, metadata)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
);

const updateProofStmt = db.prepare(
  `UPDATE proofs
   SET width = @width,
       height = @height,
       duration_ms = @duration_ms,
       moderation = @moderation,
       visibility = CASE WHEN @setPrivate = 1 THEN 'private' ELSE visibility END,
       updated_at = datetime('now')
   WHERE id = @id`
);

const insertEvent = db.prepare(
  `INSERT INTO events (id, dare_id, type, payload, at) VALUES (?, ?, ?, ?, ?)`
);

const upsertPendingReview = db.prepare(
  `INSERT INTO moderation_reviews (id, proof_id, status, reason, created_at, reviewed_at, reviewer_id)
   VALUES (?, ?, 'pending', ?, ?, NULL, NULL)
   ON CONFLICT(proof_id) DO UPDATE SET status = 'pending', reason = excluded.reason, reviewed_at = NULL`
);

const upsertResolvedReview = db.prepare(
  `INSERT INTO moderation_reviews (id, proof_id, status, reason, created_at, reviewed_at, reviewer_id)
   VALUES (?, ?, ?, ?, ?, ?, NULL)
   ON CONFLICT(proof_id) DO UPDATE SET status = excluded.status, reason = excluded.reason, reviewed_at = excluded.reviewed_at`
);

const dareStmt = db.prepare(
  `SELECT d.*, i.slug AS invite_slug FROM dares d
   LEFT JOIN dare_invites i ON i.dare_id = d.id
   WHERE d.id = ?`
);

const bufferFromStream = async (stream) => {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
};

const hashBuffer = (buffer) => crypto.createHash("sha256").update(buffer).digest();

const derivePaths = (storageKey) => {
  const parts = storageKey.split("/");
  const originalIndex = parts.indexOf("original");
  const baseParts = originalIndex === -1 ? parts.slice(0, -1) : parts.slice(0, originalIndex);
  const filename = parts[parts.length - 1] || "";
  const stem = filename.includes(".") ? filename.slice(0, filename.lastIndexOf(".")) : filename;
  const root = baseParts.join("/");
  return { root, stem };
};

const recordAsset = (proofId, kind, key, mime, buffer, metadata) => {
  deleteAssetKind.run(proofId, kind);
  insertAssetStmt.run(
    crypto.randomUUID(),
    proofId,
    kind,
    key,
    mime,
    buffer.length,
    hashBuffer(buffer),
    metadata ? JSON.stringify(metadata) : null,
  );
};

const processPhoto = async (proof, originalAsset) => {
  const stat = await statObject(originalAsset.storage_key);
  if (!stat.exists) return;
  const sourceBuffer = await bufferFromStream(await openReadStream(originalAsset.storage_key));
  const dare = proof.watermark && PROOF_WATERMARK ? dareStmt.get(proof.dare_id) : null;
  const { variants, width, height } = await generatePhotoVariants({
    buffer: sourceBuffer,
    watermark: Boolean(proof.watermark && PROOF_WATERMARK),
    slug: dare?.invite_slug,
    createdAt: proof.created_at,
  });
  const { root, stem } = derivePaths(proof.storage_key);
  const base = `${root}/public/img/${stem}`;
  const entries = [
    ["jpeg", `${base}-1920.jpg`],
    ["thumb1280", `${base}-1280.jpg`],
    ["thumb640", `${base}-640.jpg`],
    ["thumb320", `${base}-320.jpg`],
    ["poster", `${base}-poster.jpg`],
  ];
  for (const [kind, key] of entries) {
    const blob = variants.get(kind);
    if (!blob) continue;
    await writeBuffer(key, blob, "image/jpeg");
    recordAsset(proof.id, kind, key, "image/jpeg", blob, null);
  }
  return { width, height, duration: null };
};

const processVideo = async (proof, originalAsset) => {
  const stat = await statObject(originalAsset.storage_key);
  if (!stat.exists) return;
  const workspace = await createWorkspace();
  try {
    const inputExt = originalAsset.storage_key.includes(".")
      ? originalAsset.storage_key.slice(originalAsset.storage_key.lastIndexOf("."))
      : ".mp4";
    const inputPath = await workspace.pull(originalAsset.storage_key, `source${inputExt}`);
    const dare = proof.watermark && PROOF_WATERMARK ? dareStmt.get(proof.dare_id) : null;
    const derivatives = await buildVideoDerivatives({
      workspace,
      inputPath,
      slug: dare?.invite_slug || proof.slug,
      createdAt: proof.created_at,
      durationMs: proof.duration_ms,
    });
    const { root, stem } = derivePaths(proof.storage_key);
    const videoBase = `${root}/public/vid/${stem}`;
    const gifPath = `${root}/public/gif/${stem}.gif`;
    const posterKey = `${videoBase}-poster.jpg`;
    const mp4Buffer = await fs.readFile(derivatives.mp4Path);
    await writeBuffer(`${videoBase}.mp4`, mp4Buffer, "video/mp4");
    recordAsset(proof.id, "mp4", `${videoBase}.mp4`, "video/mp4", mp4Buffer, null);
    const webmBuffer = await fs.readFile(derivatives.webmPath);
    await writeBuffer(`${videoBase}.webm`, webmBuffer, "video/webm");
    recordAsset(proof.id, "webm", `${videoBase}.webm`, "video/webm", webmBuffer, null);
    await writeBuffer(posterKey, derivatives.posterBuffer, "image/jpeg");
    recordAsset(proof.id, "poster", posterKey, "image/jpeg", derivatives.posterBuffer, null);
    if (derivatives.gifBuffer) {
      await writeBuffer(gifPath, derivatives.gifBuffer, "image/gif");
      recordAsset(proof.id, "gif", gifPath, "image/gif", derivatives.gifBuffer, null);
    } else {
      deleteAssetKind.run(proof.id, "gif");
    }
    await fs.rm(derivatives.mp4Path, { force: true });
    await fs.rm(derivatives.webmPath, { force: true });
    return { width: derivatives.width, height: derivatives.height, duration: proof.duration_ms };
  } finally {
    await workspace.cleanup();
  }
};

const evaluateProofModeration = (proof, width, height, duration) => {
  const sha = Buffer.isBuffer(proof.sha256)
    ? proof.sha256.toString("hex")
    : Buffer.from(proof.sha256).toString("hex");
  const decision = evaluateModeration({
    sha256Hex: sha,
    mime: proof.type === "video" ? "video/mp4" : "image/jpeg",
    width,
    height,
    durationMs: duration,
    storageKey: proof.storage_key,
  });
  if (!FEATURE_PROOF_MODERATION) return { moderation: "approved", review: null };
  return { moderation: decision.decision, review: decision.reason || null };
};

const processProof = async (proof) => {
  const originalAsset = originalAssetStmt.get(proof.id);
  if (!originalAsset) return;
  const stat = await statObject(originalAsset.storage_key);
  if (!stat.exists) return;
  let result;
  if (proof.type === "video") {
    result = await processVideo(proof, originalAsset);
  } else {
    result = await processPhoto(proof, originalAsset);
  }
  if (!result) return;
  const { width, height, duration } = result;
  const moderationOutcome = evaluateProofModeration(proof, width, height, duration);
  const setPrivate = moderationOutcome.moderation === "rejected" ? 1 : 0;
  const nowIso = new Date().toISOString();
  db.exec("BEGIN");
  try {
    updateProofStmt.run({
      id: proof.id,
      width: width ?? null,
      height: height ?? null,
      duration_ms: duration ?? null,
      moderation: moderationOutcome.moderation,
      setPrivate,
    });
    insertEvent.run(crypto.randomUUID(), proof.dare_id, "proof.processed", JSON.stringify({ id: proof.id }), nowIso);
    publishBus("proof.processed", { dareId: proof.dare_id, payload: { id: proof.id }, at: nowIso });
    if (moderationOutcome.moderation === "pending") {
      upsertPendingReview.run(crypto.randomUUID(), proof.id, moderationOutcome.review, nowIso);
      insertEvent.run(crypto.randomUUID(), proof.dare_id, "proof.moderation_pending", JSON.stringify({ id: proof.id }), nowIso);
      publishBus("proof.moderation_pending", { dareId: proof.dare_id, payload: { id: proof.id }, at: nowIso });
    } else if (moderationOutcome.moderation === "approved") {
      upsertResolvedReview.run(crypto.randomUUID(), proof.id, "approved", moderationOutcome.review, nowIso, nowIso);
      insertEvent.run(crypto.randomUUID(), proof.dare_id, "proof.approved", JSON.stringify({ id: proof.id }), nowIso);
      publishBus("proof.approved", { dareId: proof.dare_id, payload: { id: proof.id }, at: nowIso });
    } else if (moderationOutcome.moderation === "rejected") {
      upsertResolvedReview.run(crypto.randomUUID(), proof.id, "rejected", moderationOutcome.review, nowIso, nowIso);
      insertEvent.run(crypto.randomUUID(), proof.dare_id, "proof.rejected", JSON.stringify({ id: proof.id }), nowIso);
      publishBus("proof.rejected", { dareId: proof.dare_id, payload: { id: proof.id }, at: nowIso });
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
};

export const processPendingProofs = async () => {
  runMigrations(db);
  const proofs = pendingStmt.all();
  for (const proof of proofs) {
    try {
      await processProof(proof);
    } catch (err) {
      console.error("proof processor error", proof.id, err);
    }
  }
};

if (import.meta.url === `file://${process.argv[1]}`) {
  processPendingProofs()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
