import { Router, raw } from "express";
import crypto, { randomUUID } from "crypto";
import { customAlphabet } from "nanoid";
import db from "./db.js";
import {
  FEATURE_PROOFS,
  PROOF_MAX_IMAGE_BYTES,
  PROOF_WATERMARK,
  PUBLIC_ASSET_BASE,
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

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/heif",
  "image/webp",
]);

const EXTENSIONS = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/heic": ".heic",
  "image/heif": ".heif",
  "image/webp": ".webp",
};

const makeSlug = customAlphabet("23456789abcdefghjkmnpqrstuvwxyz", 10);

const parseSha = (value) => {
  if (typeof value !== "string" || value.length !== 64 || /[^a-f0-9]/i.test(value)) return null;
  return Buffer.from(value.toLowerCase(), "hex");
};

const encodeSha = (buffer) => buffer.toString("hex");

const baseAssetUrl = (key) => {
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
    if (type !== "photo") return res.status(400).json({ error: "Invalid type" });
    if (typeof dareId !== "string" || !dareId) return res.status(400).json({ error: "Invalid dare" });
    if (!ALLOWED_MIME.has(mime)) return res.status(400).json({ error: "Invalid mime" });
    const size = Number(sizeBytes);
    if (!Number.isFinite(size) || size <= 0 || size > PROOF_MAX_IMAGE_BYTES)
      return res.status(400).json({ error: "Invalid size" });
    const hash = parseSha(sha256);
    if (!hash) return res.status(400).json({ error: "Invalid sha" });
    const dare = db.prepare("SELECT * FROM dares WHERE id = ?").get(dareId);
    if (!dare) return res.status(404).json({ error: "Dare not found" });
    if (dare.status !== "resolved") return res.status(409).json({ error: "Dare not resolved" });
    const ip = getIp(req);
    if (!rateLimit(`${ip}:proof-presign`)) return res.status(429).json({ error: "Rate limited" });
    const ext = EXTENSIONS[mime];
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
        .getUploadTarget(key, mime, 600)
        .then(({ url, headers }) => {
          res.json({ key, url, headers, maxBytes: PROOF_MAX_IMAGE_BYTES });
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
      headers: { "Content-Type": mime, "Content-Length": String(size) },
      maxBytes: PROOF_MAX_IMAGE_BYTES,
    });
  });

  if (!STORAGE_IS_DIRECT) {
    router.put(
      "/api/proofs/upload/:token",
      raw({ type: () => true, limit: PROOF_MAX_IMAGE_BYTES }),
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
    if (type !== "photo") return res.status(400).json({ error: "Invalid type" });
    if (typeof key !== "string" || !key.startsWith("proofs/")) return res.status(400).json({ error: "Invalid key" });
    const hash = parseSha(sha256);
    if (!hash) return res.status(400).json({ error: "Invalid sha" });
    const token = readToken(key);
    if (!token) return res.status(404).json({ error: "Upload not found" });
    if (token.dare_id !== req.params.id) return res.status(403).json({ error: "Dare mismatch" });
    if (token.used_at) return res.status(409).json({ error: "Already finalized" });
    if (Date.now() > Date.parse(token.expires_at)) return res.status(410).json({ error: "Upload expired" });
    if (!STORAGE_IS_DIRECT && !token.uploaded_at) return res.status(409).json({ error: "Not uploaded" });
    const dare = db.prepare("SELECT * FROM dares WHERE id = ?").get(req.params.id);
    if (!dare) return res.status(404).json({ error: "Dare not found" });
    if (dare.status !== "resolved") return res.status(409).json({ error: "Dare not resolved" });
    const assetStat = await statObject(key);
    if (!assetStat.exists) return res.status(404).json({ error: "Asset missing" });
    if (assetStat.size !== token.size_bytes) return res.status(422).json({ error: "Size mismatch" });
    let computed;
    try {
      const stream = await openReadStream(key);
      computed = await hashStream(stream);
    } catch (err) {
      console.error("hash read error", err);
      return res.status(500).json({ error: "Storage error" });
    }
    if (!computed.equals(hash) || !computed.equals(token.sha256)) return res.status(422).json({ error: "Checksum mismatch" });
    const proofId = randomUUID();
    const slug = makeSlug();
    db.exec("BEGIN");
    try {
      db.prepare(
        `INSERT INTO proofs (id, slug, dare_id, uploader_id, type, storage_key, sha256, size_bytes, moderation, visibility, watermark)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'unlisted', ?)`
      ).run(proofId, slug, req.params.id, req.anonId || null, type, key, computed, assetStat.size, PROOF_WATERMARK ? 1 : 0);
      db.prepare(
        `INSERT INTO proof_assets (id, proof_id, kind, storage_key, mime, size_bytes, sha256)
         VALUES (?, ?, 'original', ?, ?, ?, ?)`
      ).run(randomUUID(), proofId, key, token.mime, assetStat.size, computed);
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
    const poster = assets.find((row) => row.kind === "poster") || assets.find((row) => row.kind === "thumb640") || assets.find((row) => row.kind === "jpeg") || assets[0];
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
