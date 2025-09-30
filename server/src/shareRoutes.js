import express from "express";
import db from "./db.js";
import { FEATURE_SHARING, FEATURE_PROOFS, SHARE_BASE_URL } from "./config.js";

const publicAssetUrl = (key) => {
  if (!key) return `${SHARE_BASE_URL.replace(/\/$/, "")}/og-image.png`;
  if (SHARE_BASE_URL && !key.startsWith("http")) {
    const base = SHARE_BASE_URL.endsWith("/") ? SHARE_BASE_URL : `${SHARE_BASE_URL}/`;
    return `${base}${key}`;
  }
  if (key.startsWith("http")) return key;
  const encoded = key.split("/").map(encodeURIComponent).join("/");
  return `/api/proofs/assets/${encoded}`;
};

const encodeHandle = (value) => {
  if (!value) return null;
  const base = value.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 12);
  if (!base) return null;
  return `anon-${base}`;
};

const mentionFor = (handle) => {
  if (!handle) return "@someone";
  const value = handle.replace(/[^a-zA-Z0-9_-]/g, "");
  return value ? `@${value}` : "@someone";
};

const normalizeTag = (value) => {
  if (!value) return null;
  const cleaned = value.replace(/\s+/g, "").replace(/[^\p{L}\p{N}_-]/gu, "");
  return cleaned ? `#${cleaned}` : null;
};

const hashtagSet = (category, extra = []) => {
  const tags = ["#WhatAreTheOdds", "#DareAccepted", ...extra];
  const normalized = normalizeTag(category || "");
  if (normalized) tags.push(normalized);
  return Array.from(new Set(tags.filter(Boolean)));
};

const fallbackImage = () => {
  if (!SHARE_BASE_URL) return "/og-image.png";
  const base = SHARE_BASE_URL.endsWith("/") ? SHARE_BASE_URL : `${SHARE_BASE_URL}/`;
  return `${base}og-image.png`;
};

const latestProofAsset = db.prepare(
  `SELECT p.id AS proof_id,
          COALESCE(p.published_at, p.updated_at, p.created_at) AS ts,
          (SELECT a.storage_key FROM proof_assets a WHERE a.proof_id = p.id AND a.kind = 'poster' LIMIT 1) AS poster,
          (SELECT a.storage_key FROM proof_assets a WHERE a.proof_id = p.id AND a.kind = 'thumb640' LIMIT 1) AS thumb640,
          (SELECT a.storage_key FROM proof_assets a WHERE a.proof_id = p.id AND a.kind = 'thumb320' LIMIT 1) AS thumb320,
          (SELECT a.storage_key FROM proof_assets a WHERE a.proof_id = p.id AND a.kind = 'jpeg' LIMIT 1) AS jpeg
   FROM proofs p
   WHERE p.dare_id = ?
     AND p.moderation = 'approved'
     AND p.visibility != 'private'
   ORDER BY datetime(COALESCE(p.published_at, p.updated_at, p.created_at)) DESC
   LIMIT 1`
);

const proofShareStmt = db.prepare(
  `SELECT p.*, d.title AS dare_title, d.category AS dare_category, d.range_n AS range_n, d.visibility AS dare_visibility,
          e.payload AS resolved_payload, e.at AS resolved_at,
          a.accepter_id AS accepter_id,
          (SELECT a.storage_key FROM proof_assets a WHERE a.proof_id = p.id AND a.kind = 'poster' LIMIT 1) AS poster,
          (SELECT a.storage_key FROM proof_assets a WHERE a.proof_id = p.id AND a.kind = 'thumb640' LIMIT 1) AS thumb640,
          (SELECT a.storage_key FROM proof_assets a WHERE a.proof_id = p.id AND a.kind = 'thumb320' LIMIT 1) AS thumb320,
          (SELECT a.storage_key FROM proof_assets a WHERE a.proof_id = p.id AND a.kind = 'jpeg' LIMIT 1) AS jpeg
   FROM proofs p
   JOIN dares d ON d.id = p.dare_id
   LEFT JOIN events e ON e.dare_id = d.id AND e.type = 'dare.resolved'
   LEFT JOIN acceptances a ON a.dare_id = d.id
   WHERE p.id = ?
   LIMIT 1`
);

const dareShareStmt = db.prepare(
  `SELECT d.*, e.payload AS resolved_payload, e.at AS resolved_at, a.accepter_id AS accepter_id
   FROM dares d
   LEFT JOIN events e ON e.dare_id = d.id AND e.type = 'dare.resolved'
   LEFT JOIN acceptances a ON a.dare_id = d.id
   WHERE d.id = ?
   LIMIT 1`
);

const pickProofAsset = (row) => row.poster || row.thumb640 || row.thumb320 || row.jpeg || null;

const evaluateResultShare = (row) => {
  if (!row) return null;
  if (row.status !== "resolved") return null;
  if (!row.resolved_payload) return null;
  if (!row.visibility || ["private", null].includes(row.visibility)) return null;
  let payload;
  try {
    payload = JSON.parse(row.resolved_payload);
  } catch {
    return null;
  }
  const matched = payload?.matched === true || payload?.matched === 1 || payload?.matched === "true";
  const recipientHandle = encodeHandle(row.accepter_id) || "recipient";
  const challengerHandle = "challenger";
  const loser = matched ? recipientHandle : challengerHandle;
  const winner = matched ? challengerHandle : recipientHandle;
  const mention = mentionFor(winner);
  const hashtags = hashtagSet(row.category);
  const imageRow = FEATURE_PROOFS ? latestProofAsset.get(row.id) : null;
  const imageKey = pickProofAsset(imageRow || {});
  const image = imageKey ? publicAssetUrl(imageKey) : fallbackImage();
  const resolvedAt = row.resolved_at || new Date().toISOString();
  const titleBase = row.title || "Dare";
  const ogTitle = `${loser} completed: ${titleBase}`;
  const description = `Odds ${row.range_n}. ${winner} vs ${loser}. ${resolvedAt}`;
  const caption = `Lost a #WhatAreTheOdds ${row.range_n} vs ${mention} — ${titleBase}`;
  const url = new URL(`/s/r/${row.id}`, SHARE_BASE_URL || "http://localhost").toString();
  return {
    type: "result",
    dareId: row.id,
    visibility: row.visibility,
    title: ogTitle,
    description,
    image,
    resolvedAt,
    loser,
    winner,
    range: row.range_n,
    caption,
    hashtags,
    url,
    category: row.category,
  };
};

const evaluateProofShare = (row) => {
  if (!row) return null;
  if (row.moderation !== "approved") return null;
  if (!row.visibility || row.visibility === "private") return null;
  if (!row.dare_visibility || row.dare_visibility === "private") return null;
  if (!row.resolved_payload) return null;
  let payload;
  try {
    payload = JSON.parse(row.resolved_payload);
  } catch {
    return null;
  }
  const matched = payload?.matched === true || payload?.matched === 1 || payload?.matched === "true";
  const recipientHandle = encodeHandle(row.accepter_id) || "recipient";
  const challengerHandle = "challenger";
  const loser = matched ? recipientHandle : challengerHandle;
  const winner = matched ? challengerHandle : recipientHandle;
  const mention = mentionFor(winner);
  const hashtags = hashtagSet(row.dare_category);
  const imageKey = pickProofAsset(row) || row.storage_key;
  const image = imageKey ? publicAssetUrl(imageKey) : fallbackImage();
  const resolvedAt = row.resolved_at || new Date().toISOString();
  const titleBase = row.dare_title || "Dare";
  const ogTitle = `${loser} completed: ${titleBase}`;
  const description = `Odds ${row.range_n}. ${winner} vs ${loser}. ${resolvedAt}`;
  const caption = `Lost a #WhatAreTheOdds ${row.range_n} vs ${mention} — ${titleBase}`;
  const url = new URL(`/s/p/${row.id}`, SHARE_BASE_URL || "http://localhost").toString();
  return {
    type: "proof",
    proofId: row.id,
    dareId: row.dare_id,
    visibility: row.visibility,
    title: ogTitle,
    description,
    image,
    resolvedAt,
    loser,
    winner,
    range: row.range_n,
    caption,
    hashtags,
    url,
    category: row.dare_category,
    proofSlug: row.slug,
  };
};

const htmlPage = (payload, options = {}) => {
  const robots = options.indexable ? "index,follow" : "noindex,nofollow";
  const image = payload.image || fallbackImage();
  const description = payload.description || "";
  const bootstrap = JSON.stringify(payload).replace(/</g, "\\u003c");
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${payload.title}</title>
    <meta name="robots" content="${robots}" />
    <meta property="og:title" content="${payload.title}" />
    <meta property="og:description" content="${description.replace(/"/g, "&quot;")}" />
    <meta property="og:image" content="${image}" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${payload.url}" />
    <meta property="twitter:card" content="summary_large_image" />
    <meta property="twitter:title" content="${payload.title}" />
    <meta property="twitter:description" content="${description.replace(/"/g, "&quot;")}" />
    <meta property="twitter:image" content="${image}" />
    <link rel="canonical" href="${payload.url}" />
  </head>
  <body>
    <div id="root" style="min-height:100vh;display:flex;align-items:center;justify-content:center;">
      <p style="color:#94a3b8;font-family:system-ui, sans-serif;">Loading share card…</p>
    </div>
    <script>window.__SHARE_DATA__ = ${bootstrap};</script>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`;
};

const cacheControl = (res) => {
  res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=600");
};

export const registerShareRoutes = (app, { getIp, rateLimit }) => {
  const router = express.Router();

  router.get("/api/share/result/:id", (req, res) => {
    if (!FEATURE_SHARING) return res.status(404).json({ error: "Not found" });
    const ip = getIp(req);
    if (!rateLimit(`${ip}:share-result`)) return res.status(429).json({ error: "Rate limited" });
    const row = dareShareStmt.get(req.params.id);
    const payload = evaluateResultShare(row);
    if (!payload) return res.status(404).json({ error: "Not found" });
    cacheControl(res);
    res.json(payload);
  });

  router.get("/api/share/proof/:id", (req, res) => {
    if (!FEATURE_SHARING || !FEATURE_PROOFS) return res.status(404).json({ error: "Not found" });
    const ip = getIp(req);
    if (!rateLimit(`${ip}:share-proof`)) return res.status(429).json({ error: "Rate limited" });
    const row = proofShareStmt.get(req.params.id);
    const payload = evaluateProofShare(row);
    if (!payload) return res.status(404).json({ error: "Not found" });
    cacheControl(res);
    res.json(payload);
  });

  router.get("/s/r/:id", (req, res) => {
    if (!FEATURE_SHARING) return res.status(404).send("Not found");
    const ip = getIp(req);
    if (!rateLimit(`${ip}:share-result-page`)) return res.status(429).send("Rate limited");
    const row = dareShareStmt.get(req.params.id);
    const payload = evaluateResultShare(row);
    if (!payload) return res.status(404).send("Not found");
    cacheControl(res);
    const indexable = row.visibility === "public";
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(htmlPage(payload, { indexable }));
  });

  router.get("/s/p/:id", (req, res) => {
    if (!FEATURE_SHARING || !FEATURE_PROOFS) return res.status(404).send("Not found");
    const ip = getIp(req);
    if (!rateLimit(`${ip}:share-proof-page`)) return res.status(429).send("Rate limited");
    const row = proofShareStmt.get(req.params.id);
    const payload = evaluateProofShare(row);
    if (!payload) return res.status(404).send("Not found");
    cacheControl(res);
    const indexable = row.visibility === "public";
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(htmlPage(payload, { indexable }));
  });

  app.use(router);
};
