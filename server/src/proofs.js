import { Router, raw } from "express";
import crypto, { randomUUID } from "crypto";
import { customAlphabet } from "nanoid";
import db from "./db.js";
import { runMigrations } from "./migrations.js";
import {
  FEATURE_PROOFS,
  FEATURE_VIDEO_PROOFS,
  FEATURE_PROOF_MODERATION,
  FEATURE_PROOF_BLUR,
  PROOF_MAX_IMAGE_BYTES,
  PROOF_MAX_VIDEO_BYTES,
  PROOF_WATERMARK,
  PUBLIC_ASSET_BASE,
  ADMIN_API_TOKEN,
  CDN_PUBLIC_BASE,
} from "./config.js";
import storage, {
  STORAGE_IS_DIRECT,
  deleteKey,
  hashStream,
  moveObject,
  openReadStream,
  resolvePublicUrl,
  statObject,
  writeBuffer,
} from "./storage.js";
import { createWorkspace } from "./media/workspace.js";
import { probeVideo } from "./media/video.js";
import { applyBlurMasks } from "./media/image.js";

runMigrations(db);

const PHOTO_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/heif",
  "image/webp",
]);

const PHOTO_EXTENSIONS = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/heic": ".heic",
  "image/heif": ".heif",
  "image/webp": ".webp",
};

const VIDEO_MIME = new Set(["video/mp4", "video/webm", "video/quicktime"]);

const VIDEO_EXTENSIONS = {
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "video/quicktime": ".mov",
};

const makeSlug = customAlphabet("23456789abcdefghjkmnpqrstuvwxyz", 10);

const MAX_UPLOAD_BYTES = Math.max(PROOF_MAX_IMAGE_BYTES, PROOF_MAX_VIDEO_BYTES);

const detectTypeFromMime = (mime) => {
  if (PHOTO_MIME.has(mime)) return "photo";
  if (VIDEO_MIME.has(mime)) return "video";
  return null;
};

const derivePaths = (storageKey) => {
  const parts = storageKey.split("/");
  const originalIndex = parts.indexOf("original");
  const baseParts = originalIndex === -1 ? parts.slice(0, -1) : parts.slice(0, originalIndex);
  const filename = parts[parts.length - 1] || "";
  const stem = filename.includes(".") ? filename.slice(0, filename.lastIndexOf(".")) : filename;
  const root = baseParts.join("/");
  return { root, stem };
};

const parseSha = (value) => {
  if (typeof value !== "string" || value.length !== 64 || /[^a-f0-9]/i.test(value)) return null;
  return Buffer.from(value.toLowerCase(), "hex");
};

const encodeSha = (buffer) => buffer.toString("hex");

const streamToBuffer = async (stream) => {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
};

const baseAssetUrl = (key) => {
  if (CDN_PUBLIC_BASE) return `${CDN_PUBLIC_BASE.replace(/\/$/, "")}/${key}`;
  if (PUBLIC_ASSET_BASE) return `${PUBLIC_ASSET_BASE.replace(/\/$/, "")}/${key}`;
  const encoded = key.split("/").map(encodeURIComponent).join("/");
  return `/api/proofs/assets/${encoded}`;
};

const readToken = (key) =>
  db.prepare("SELECT * FROM proof_upload_tokens WHERE storage_key = ?").get(key);

const normalizeHashtags = (value) => {
  if (!value) return null;
  if (!Array.isArray(value)) return null;
  const tags = value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean)
    .map((entry) => (entry.startsWith("#") ? entry : `#${entry}`))
    .map((entry) => `#${entry.replace(/[^\p{L}\p{N}_-]/gu, "").replace(/^#+/, "")}`)
    .filter((entry) => entry.length > 1);
  const unique = Array.from(new Set(tags));
  return unique.length ? JSON.stringify(unique) : null;
};

const decodeHashtags = (value) => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const ensureFeature = (res) => {
  if (!FEATURE_PROOFS) {
    res.status(404).json({ error: "Not found" });
    return false;
  }
  return true;
};

const presentProof = (row, assets) => ({
  id: row.id,
  slug: row.slug,
  dareId: row.dare_id,
  type: row.type,
  visibility: row.visibility,
  moderation: row.moderation,
  caption: row.caption,
  hashtags: decodeHashtags(row.hashtags),
  watermark: Boolean(row.watermark),
  publishedAt: row.published_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  width: row.width,
  height: row.height,
  durationMs: row.duration_ms,
  sizeBytes: row.size_bytes,
  assets: assets.reduce((acc, asset) => {
    acc[asset.kind] = {
      key: asset.storage_key,
      mime: asset.mime,
      sizeBytes: asset.size_bytes,
      sha256: encodeSha(asset.sha256),
      url: baseAssetUrl(asset.storage_key),
    };
    return acc;
  }, {}),
  publicUrl: `/p/${row.slug}`,
});

const dareForProof = db.prepare(
  `SELECT d.*, i.slug AS invite_slug FROM dares d
   LEFT JOIN dare_invites i ON i.dare_id = d.id
   WHERE d.id = ?`
);

const proofBySlug = db.prepare("SELECT * FROM proofs WHERE slug = ?");
const proofById = db.prepare("SELECT * FROM proofs WHERE id = ?");
const latestProofForDare = db.prepare(
  `SELECT * FROM proofs WHERE dare_id = ? AND visibility IN ('unlisted','public')
   ORDER BY coalesce(published_at, updated_at) DESC LIMIT 1`
);
const assetsForProof = db.prepare("SELECT * FROM proof_assets WHERE proof_id = ?");
const deleteAssetKind = db.prepare("DELETE FROM proof_assets WHERE proof_id = ? AND kind = ?");
const insertAssetStmt = db.prepare(
  `INSERT INTO proof_assets (id, proof_id, kind, storage_key, mime, size_bytes, sha256, metadata)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
);

const dareSummary = (row) =>
  row
    ? {
        id: row.id,
        title: row.title,
        description: row.description,
        category: row.category,
        slug: row.invite_slug,
      }
    : null;

export const registerProofRoutes = (app, { getIp, rateLimit, emit }) => {
  const router = Router();

  router.post("/api/proofs/presign", (req, res) => {
    if (!ensureFeature(res)) return;
    const { dareId, type, mime, sizeBytes, sha256 } = req.body || {};
    if (type !== "photo" && type !== "video") return res.status(400).json({ error: "Invalid type" });
    if (type === "video" && !FEATURE_VIDEO_PROOFS) return res.status(404).json({ error: "Not found" });
    if (typeof dareId !== "string" || !dareId) return res.status(400).json({ error: "Invalid dare" });
    const mimeType = typeof mime === "string" ? mime.toLowerCase() : "";
    const expectedMimeSet = type === "video" ? VIDEO_MIME : PHOTO_MIME;
    if (!expectedMimeSet.has(mimeType)) return res.status(400).json({ error: "Invalid mime" });
    const size = Number(sizeBytes);
    const maxBytes = type === "video" ? PROOF_MAX_VIDEO_BYTES : PROOF_MAX_IMAGE_BYTES;
    if (!Number.isFinite(size) || size <= 0 || size > maxBytes)
      return res.status(400).json({ error: "Invalid size" });
    const hash = parseSha(sha256);
    if (!hash) return res.status(400).json({ error: "Invalid sha" });
    const dare = db.prepare("SELECT * FROM dares WHERE id = ?").get(dareId);
    if (!dare) return res.status(404).json({ error: "Dare not found" });
    if (dare.status !== "resolved") return res.status(409).json({ error: "Dare not resolved" });
    const ip = getIp(req);
    if (!rateLimit(`${ip}:proof-presign`)) return res.status(429).json({ error: "Rate limited" });
    const extMap = type === "video" ? VIDEO_EXTENSIONS : PHOTO_EXTENSIONS;
    const ext = extMap[mimeType];
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, "0");
    const base = `proofs/${year}/${month}/${dareId}`;
    const objectId = randomUUID();
    const key = `${base}/original/${objectId}${ext}`;
    const expires = new Date(now.getTime() + 10 * 60 * 1000);
    const tokenId = randomUUID();
    db.prepare(
      `INSERT INTO proof_upload_tokens (id, dare_id, storage_key, sha256, size_bytes, mime, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(tokenId, dareId, key, hash, size, mime, expires.toISOString());
    if (STORAGE_IS_DIRECT) {
      storage
        .getUploadTarget(key, mimeType, 600)
        .then(({ url, headers }) => {
          res.json({ key, url, headers, maxBytes });
        })
        .catch((err) => {
          db.prepare("DELETE FROM proof_upload_tokens WHERE id = ?").run(tokenId);
          res.status(500).json({ error: "Storage error" });
          console.error("upload target error", err);
        });
      return;
    }
    res.json({
      key,
      url: `/api/proofs/upload/${tokenId}`,
      headers: { "Content-Type": mimeType, "Content-Length": String(size) },
      maxBytes,
    });
  });

  if (!STORAGE_IS_DIRECT) {
    router.put(
      "/api/proofs/upload/:token",
      raw({ type: () => true, limit: MAX_UPLOAD_BYTES }),
      (req, res) => {
        if (!ensureFeature(res)) return;
        const token = req.params.token;
        const row = db.prepare("SELECT * FROM proof_upload_tokens WHERE id = ?").get(token);
        if (!row) return res.status(404).json({ error: "Invalid token" });
        if (row.used_at) return res.status(409).json({ error: "Already finalized" });
        if (row.uploaded_at) return res.status(409).json({ error: "Already uploaded" });
        if (Date.now() > Date.parse(row.expires_at)) return res.status(410).json({ error: "Upload expired" });
        const contentType = req.headers["content-type"];
        if (contentType !== row.mime) return res.status(415).json({ error: "Invalid mime" });
        const lengthHeader = req.headers["content-length"];
        if (lengthHeader && Number(lengthHeader) !== row.size_bytes)
          return res.status(413).json({ error: "Size mismatch" });
        const body = req.body;
        if (!Buffer.isBuffer(body)) return res.status(400).json({ error: "Invalid body" });
        if (body.length !== row.size_bytes) return res.status(413).json({ error: "Size mismatch" });
        const hash = crypto.createHash("sha256").update(body).digest();
        if (!hash.equals(row.sha256)) return res.status(422).json({ error: "Checksum mismatch" });
        writeBuffer(row.storage_key, body, row.mime)
          .then(() => {
            db.prepare("UPDATE proof_upload_tokens SET uploaded_at = datetime('now') WHERE id = ?").run(token);
            res.status(204).end();
          })
          .catch((err) => {
            console.error("upload write error", err);
            res.status(500).json({ error: "Storage error" });
          });
      }
    );
  }

  router.post("/api/dares/:id/proofs", async (req, res) => {
    if (!ensureFeature(res)) return;
    const { key, sha256, type } = req.body || {};
    if (type !== "photo" && type !== "video") return res.status(400).json({ error: "Invalid type" });
    if (type === "video" && !FEATURE_VIDEO_PROOFS) return res.status(404).json({ error: "Not found" });
    if (typeof key !== "string" || !key.startsWith("proofs/")) return res.status(400).json({ error: "Invalid key" });
    const ip = getIp(req);
    if (!rateLimit(`${ip}:proof-finalize`)) return res.status(429).json({ error: "Rate limited" });
    const hash = parseSha(sha256);
    if (!hash) return res.status(400).json({ error: "Invalid sha" });
    const token = readToken(key);
    if (!token) return res.status(404).json({ error: "Upload not found" });
    if (token.dare_id !== req.params.id) return res.status(403).json({ error: "Dare mismatch" });
    if (token.used_at) return res.status(409).json({ error: "Already finalized" });
    if (Date.now() > Date.parse(token.expires_at)) return res.status(410).json({ error: "Upload expired" });
    if (!STORAGE_IS_DIRECT && !token.uploaded_at) return res.status(409).json({ error: "Not uploaded" });
    const tokenMime = typeof token.mime === "string" ? token.mime.toLowerCase() : "";
    const tokenType = detectTypeFromMime(tokenMime);
    if (!tokenType) return res.status(415).json({ error: "Unsupported mime" });
    if (tokenType !== type) return res.status(400).json({ error: "Type mismatch" });
    const dare = db.prepare("SELECT * FROM dares WHERE id = ?").get(req.params.id);
    if (!dare) return res.status(404).json({ error: "Dare not found" });
    if (dare.status !== "resolved") return res.status(409).json({ error: "Dare not resolved" });
    const assetStat = await statObject(key);
    if (!assetStat.exists) return res.status(404).json({ error: "Asset missing" });
    if (assetStat.size !== token.size_bytes) return res.status(422).json({ error: "Size mismatch" });
    const limitBytes = tokenType === "video" ? PROOF_MAX_VIDEO_BYTES : PROOF_MAX_IMAGE_BYTES;
    if (assetStat.size > limitBytes) return res.status(413).json({ error: "File too large" });
    let computed;
    try {
      const stream = await openReadStream(key);
      computed = await hashStream(stream);
    } catch (err) {
      console.error("hash read error", err);
      return res.status(500).json({ error: "Storage error" });
    }
    if (!computed.equals(hash) || !computed.equals(token.sha256)) return res.status(422).json({ error: "Checksum mismatch" });
    let durationMs = null;
    let width = null;
    let height = null;
    if (tokenType === "video") {
      let workspace;
      try {
        workspace = await createWorkspace();
        const ext = VIDEO_EXTENSIONS[tokenMime] || ".mp4";
        const tempPath = await workspace.pull(key, "original" + ext);
        const probe = await probeVideo(tempPath);
        durationMs = probe.durationMs || null;
        let w = probe.width || null;
        let h = probe.height || null;
        if (probe.rotation && Math.abs(probe.rotation) % 180 === 90) {
          const swap = w;
          w = h;
          h = swap;
        }
        width = w;
        height = h;
      } catch (err) {
        if (err?.code === "VIDEO_TOO_LONG") {
          return res.status(422).json({ error: "Video exceeds duration limit" });
        }
        console.error("video probe error", err);
        return res.status(500).json({ error: "Video probe failed" });
      } finally {
        try {
          await workspace?.cleanup();
        } catch {
        }
      }
    }
    const proofId = randomUUID();
    const slug = makeSlug();
    db.exec("BEGIN");
    try {
      db.prepare(
        `INSERT INTO proofs (id, slug, dare_id, uploader_id, type, storage_key, sha256, width, height, duration_ms, size_bytes, moderation, visibility, watermark)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'unlisted', ?)`
      ).run(
        proofId,
        slug,
        req.params.id,
        req.anonId || null,
        type,
        key,
        computed,
        width,
        height,
        durationMs,
        assetStat.size,
        PROOF_WATERMARK ? 1 : 0,
      );
      db.prepare(
        `INSERT INTO proof_assets (id, proof_id, kind, storage_key, mime, size_bytes, sha256, metadata)
         VALUES (?, ?, 'original', ?, ?, ?, ?, NULL)`
      ).run(randomUUID(), proofId, key, tokenMime, assetStat.size, computed);
      db.prepare("UPDATE proof_upload_tokens SET used_at = datetime('now') WHERE id = ?").run(token.id);
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      console.error("proof finalize error", err);
      return res.status(500).json({ error: "Finalize failed" });
    }
    emit(req.params.id, "proof.uploaded", { id: proofId, slug });
    res.status(201).json({ proofId, slug });
  });

  router.post("/api/proofs/:id/publish", (req, res) => {
    if (!ensureFeature(res)) return;
    const { visibility, caption, hashtags } = req.body || {};
    if (!["public", "unlisted"].includes(visibility)) return res.status(400).json({ error: "Invalid visibility" });
    const proof = proofById.get(req.params.id);
    if (!proof) return res.status(404).json({ error: "Not found" });
    if (visibility === "public" && proof.moderation !== "approved") {
      return res.status(409).json({ error: "Proof not approved" });
    }
    if (visibility === "unlisted" && FEATURE_PROOF_MODERATION && proof.moderation === "rejected") {
      return res.status(409).json({ error: "Proof rejected" });
    }
    const tags = normalizeHashtags(hashtags);
    const publishAt = visibility === "public" ? new Date().toISOString() : proof.published_at;
    db.prepare(
      `UPDATE proofs SET visibility = ?, caption = ?, hashtags = ?, published_at = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(visibility, typeof caption === "string" ? caption : null, tags, publishAt, proof.id);
    const updated = proofById.get(proof.id);
    const assets = assetsForProof.all(proof.id);
    emit(updated.dare_id, "proof.published", { id: updated.id, visibility: updated.visibility });
    res.json(presentProof(updated, assets));
  });

  router.post("/api/proofs/:id/blur", async (req, res) => {
    if (!ensureFeature(res)) return;
    if (!FEATURE_PROOF_BLUR) return res.status(404).json({ error: "Not found" });
    const ip = getIp(req);
    if (!rateLimit(`${ip}:proof-blur`)) return res.status(429).json({ error: "Rate limited" });
    const proof = proofById.get(req.params.id);
    if (!proof) return res.status(404).json({ error: "Not found" });
    const masks = Array.isArray(req.body?.masks) ? req.body.masks : [];
    if (!masks.length) return res.status(400).json({ error: "Invalid masks" });
    const assets = assetsForProof.all(proof.id);
    const posterAsset = assets.find((asset) => asset.kind === "poster");
    if (!posterAsset) return res.status(409).json({ error: "Poster unavailable" });
    let posterBuffer;
    try {
      posterBuffer = await streamToBuffer(await openReadStream(posterAsset.storage_key));
    } catch (err) {
      console.error("poster read error", err);
      return res.status(500).json({ error: "Unable to load poster" });
    }
    let redactedPoster;
    try {
      redactedPoster = await applyBlurMasks(posterBuffer, masks);
    } catch (err) {
      console.error("poster blur error", err);
      return res.status(500).json({ error: "Unable to apply blur" });
    }
    const posterMime = posterAsset.mime || "image/jpeg";
    const redactedPosterKey = posterAsset.storage_key.replace(/(\.[^./]+)?$/, "-redacted$1");
    const posterHash = crypto.createHash("sha256").update(redactedPoster).digest();
    try {
      await writeBuffer(redactedPosterKey, redactedPoster, posterMime);
    } catch (err) {
      console.error("poster write error", err);
      return res.status(500).json({ error: "Unable to store redacted poster" });
    }
    deleteAssetKind.run(proof.id, "poster_redacted");
    insertAssetStmt.run(randomUUID(), proof.id, "poster_redacted", redactedPosterKey, posterMime, redactedPoster.length, posterHash, JSON.stringify({ masks: masks.length }));
    if (proof.type === "photo") {
      const jpegAsset = assets.find((asset) => asset.kind === "jpeg");
      if (jpegAsset) {
        try {
          const jpegBuffer = await streamToBuffer(await openReadStream(jpegAsset.storage_key));
          const redactedJpeg = await applyBlurMasks(jpegBuffer, masks);
          const jpegMime = jpegAsset.mime || "image/jpeg";
          const jpegKey = jpegAsset.storage_key.replace(/(\.[^./]+)?$/, "-redacted$1");
          const jpegHash = crypto.createHash("sha256").update(redactedJpeg).digest();
          await writeBuffer(jpegKey, redactedJpeg, jpegMime);
          deleteAssetKind.run(proof.id, "jpeg_redacted");
          insertAssetStmt.run(randomUUID(), proof.id, "jpeg_redacted", jpegKey, jpegMime, redactedJpeg.length, jpegHash, JSON.stringify({ masks: masks.length }));
        } catch (err) {
          console.error("jpeg blur error", err);
          return res.status(500).json({ error: "Unable to apply blur" });
        }
      }
    }
    const refreshed = proofById.get(proof.id);
    const refreshedAssets = assetsForProof.all(proof.id);
    emit(proof.dare_id, "proof.redacted", { id: proof.id });
    res.json(presentProof(refreshed, refreshedAssets));
  });

  router.post("/api/admin/moderation/:id", (req, res) => {
    if (!ensureFeature(res)) return;
    if (!ADMIN_API_TOKEN) return res.status(403).json({ error: "Admin token not configured" });
    const token = req.headers["x-admin-token"];
    if (token !== ADMIN_API_TOKEN) return res.status(403).json({ error: "Forbidden" });
    const { action, reason } = req.body || {};
    if (action !== "approve" && action !== "reject") return res.status(400).json({ error: "Invalid action" });
    const proof = proofById.get(req.params.id);
    if (!proof) return res.status(404).json({ error: "Not found" });
    const reasonText = typeof reason === "string" ? reason.trim().slice(0, 1024) : null;
    const nowIso = new Date().toISOString();
    db.exec("BEGIN");
    try {
      if (action === "approve") {
        db.prepare(
          `UPDATE proofs SET moderation = 'approved', updated_at = datetime('now') WHERE id = ?`
        ).run(proof.id);
        db.prepare(
          `INSERT INTO moderation_reviews (id, proof_id, status, reason, created_at, reviewed_at, reviewer_id)
           VALUES (?, ?, 'approved', ?, ?, ?, NULL)
           ON CONFLICT(proof_id) DO UPDATE SET status = 'approved', reason = excluded.reason, reviewed_at = excluded.reviewed_at`
        ).run(randomUUID(), proof.id, reasonText, nowIso, nowIso);
      } else {
        db.prepare(
          `UPDATE proofs SET moderation = 'rejected', visibility = 'private', updated_at = datetime('now') WHERE id = ?`
        ).run(proof.id);
        db.prepare(
          `INSERT INTO moderation_reviews (id, proof_id, status, reason, created_at, reviewed_at, reviewer_id)
           VALUES (?, ?, 'rejected', ?, ?, ?, NULL)
           ON CONFLICT(proof_id) DO UPDATE SET status = 'rejected', reason = excluded.reason, reviewed_at = excluded.reviewed_at`
        ).run(randomUUID(), proof.id, reasonText, nowIso, nowIso);
      }
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      console.error("moderation update error", err);
      return res.status(500).json({ error: "Moderation update failed" });
    }
    const updated = proofById.get(proof.id);
    const assets = assetsForProof.all(proof.id);
    const eventType = action === "approve" ? "proof.moderation_approved" : "proof.moderation_rejected";
    emit(updated.dare_id, eventType, { id: updated.id, moderation: updated.moderation });
    res.json(presentProof(updated, assets));
  });

  router.delete("/api/proofs/:id", (req, res) => {
    if (!ensureFeature(res)) return;
    const proof = proofById.get(req.params.id);
    if (!proof) return res.status(404).json({ error: "Not found" });
    db.prepare(
      "UPDATE proofs SET visibility = 'private', updated_at = datetime('now') WHERE id = ?"
    ).run(proof.id);
    emit(proof.dare_id, "proof.taken_down", { id: proof.id });
    res.status(204).end();
  });

  router.get("/api/proofs", (req, res) => {
    if (!ensureFeature(res)) return;
    const visibility = req.query.visibility;
    const dareId = req.query.dareId;
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const rows = db
      .prepare(
        `SELECT * FROM proofs
         WHERE (? IS NULL OR visibility = ?)
         AND (? IS NULL OR dare_id = ?)
         ORDER BY created_at DESC
         LIMIT ?`
      )
      .all(visibility || null, visibility || null, dareId || null, dareId || null, limit);
    const payload = rows.map((row) => presentProof(row, assetsForProof.all(row.id)));
    res.json({ proofs: payload });
  });

  router.get("/api/proofs/:id", (req, res) => {
    if (!ensureFeature(res)) return;
    const proof = proofById.get(req.params.id);
    if (!proof) return res.status(404).json({ error: "Not found" });
    if (proof.visibility === "private") return res.status(404).json({ error: "Not found" });
    const payload = presentProof(proof, assetsForProof.all(proof.id));
    res.json(payload);
  });

  router.get("/api/proofs/assets/:key(*)", async (req, res) => {
    if (!ensureFeature(res)) return;
    const key = req.params.key;
    if (!key.startsWith("proofs/")) return res.status(404).json({ error: "Not found" });
    const stat = await statObject(key);
    if (!stat.exists) return res.status(404).json({ error: "Not found" });
    res.setHeader("Content-Type", stat.contentType || "application/octet-stream");
    res.setHeader("Cache-Control", "public, max-age=86400, immutable");
    const stream = await openReadStream(key);
    stream.on("error", () => res.destroy());
    stream.pipe(res);
  });

  router.get("/p/:slug", (req, res) => {
    if (!ensureFeature(res)) return;
    const slug = req.params.slug;
    let proof = proofBySlug.get(slug);
    if (!proof) {
      const dare = db
        .prepare("SELECT dare_id FROM dare_invites WHERE slug = ?")
        .get(slug);
      if (dare) proof = latestProofForDare.get(dare.dare_id);
    }
    if (!proof || proof.visibility === "private") return res.status(404).send("Not found");
    const dare = dareForProof.get(proof.dare_id);
    const assets = assetsForProof.all(proof.id);
    const poster =
      assets.find((row) => row.kind === "poster_redacted") ||
      assets.find((row) => row.kind === "poster") ||
      assets.find((row) => row.kind === "jpeg_redacted") ||
      assets.find((row) => row.kind === "thumb640") ||
      assets.find((row) => row.kind === "jpeg") ||
      assets[0];
    const posterUrl = poster ? baseAssetUrl(poster.storage_key) : "";
    const captionBase = ["#WhatAreTheOdds", "#DareAccepted"];
    if (dare?.category) {
      const normalized = `#${dare.category.replace(/\s+/g, "").replace(/[^\p{L}\p{N}_-]/gu, "")}`;
      if (normalized.length > 1) captionBase.push(normalized);
    }
    const caption = [proof.caption || dare?.title || "What are the odds?!", captionBase.join(" ")]
      .filter(Boolean)
      .join("\n\n");
    const ogTitle = dare?.title ? `Completed: ${dare.title}` : "Dare completed";
    const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${ogTitle}</title>
    <meta property="og:title" content="${ogTitle}" />
    <meta property="og:type" content="image" />
    <meta property="og:image" content="${posterUrl}" />
    <meta property="og:description" content="${caption.replace(/"/g, "&quot;" )}" />
    <meta name="twitter:card" content="summary_large_image" />
  </head>
  <body>
    <main style="font-family: system-ui, sans-serif; display: grid; min-height: 100vh; place-items: center; background: radial-gradient(circle at top, #0f172a, #020617); color: #e2e8f0;">
      <article style="max-width: 480px; text-align: center; padding: 2rem; background: rgba(15,23,42,.8); border-radius: 16px; backdrop-filter: blur(12px);">
        <h1 style="margin-bottom: 1rem;">${ogTitle}</h1>
        ${posterUrl ? `<img src="${posterUrl}" alt="Proof" style="width: 100%; border-radius: 12px; margin-bottom: 1rem;" />` : ""}
        <p style="white-space: pre-line;">${caption.replace(/</g, "&lt;")}</p>
        <p style="margin-top: 1.5rem; font-size: 0.9rem; opacity: 0.7;">Captured ${new Date(proof.created_at).toLocaleString()}</p>
      </article>
    </main>
  </body>
</html>`;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  });

  app.use(router);
};
