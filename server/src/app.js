import express from "express";
import helmet from "helmet";
import crypto from "crypto";
import { SignJWT, jwtVerify } from "jose";
import db from "./db.js";
import { runMigrations } from "./migrations.js";
import {
  BASE_URL,
  FEATURE_LINK_DARES,
  INVITE_JWT_SECRET,
  INVITE_JWT_SECRET_NEXT,
  FEATURE_REALTIME_WS,
  CDN_PUBLIC_BASE,
  PUBLIC_ASSET_BASE,
} from "./config.js";
import { registerProofRoutes } from "./proofs.js";
import { registerLeaderboardRoutes } from "./leaderboardRoutes.js";
import { registerShareRoutes } from "./shareRoutes.js";
import { randomUUID } from "crypto";
import { URL } from "url";
import { publishBus, subscribeBus } from "./realtime/bus.js";
import { establishSession } from "./realtime/auth.js";
import { emitTelemetry } from "./telemetry.js";

const assetOrigins = [];
const pushOrigin = (value) => {
  if (!value) return;
  try {
    assetOrigins.push(new URL(value).origin);
  } catch {}
};
pushOrigin(CDN_PUBLIC_BASE);
pushOrigin(PUBLIC_ASSET_BASE);
const connectSources = ["'self'", "https:", "http:", "blob:"];
if (FEATURE_REALTIME_WS) connectSources.push("wss:");
const mediaSources = new Set(["'self'", "blob:"]);
for (const origin of assetOrigins) mediaSources.add(origin);
const imgSources = new Set(["'self'", "data:", "blob:"]);
for (const origin of assetOrigins) imgSources.add(origin);

const app = express();
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "img-src": Array.from(imgSources),
        "media-src": Array.from(mediaSources),
        "connect-src": connectSources,
        "worker-src": ["'self'", "blob:"],
      },
    },
    referrerPolicy: {
      policy: "strict-origin-when-cross-origin",
    },
  })
);
app.use((req, res, next) => {
  const start = process.hrtime.bigint();
  res.on("finish", () => {
    const elapsed = Number(process.hrtime.bigint() - start) / 1e6;
    emitTelemetry("http", {
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      duration_ms: elapsed,
    });
  });
  next();
});
app.use(express.json({ limit: "1mb" }));

app.get("/healthz", (req, res) => {
  res.json({ ok: true });
});

runMigrations(db);

const sseClients = new Map();
const rateBuckets = new Map();

const encoder = new TextEncoder();
const fingerprint = (secret) =>
  crypto.createHash("sha256").update(secret || "", "utf8").digest("hex").slice(0, 16);
const inviteSecrets = [
  INVITE_JWT_SECRET,
  INVITE_JWT_SECRET_NEXT,
].filter((value, index, list) => value && list.indexOf(value) === index);
const inviteKeys = inviteSecrets.map((value) => ({ secret: value, kid: fingerprint(value) }));

const broadcastEvents = [
  "dare.created",
  "dare.accepted",
  "pick.submitted",
  "dare.resolved",
  "dare.expired",
  "proof.uploaded",
  "proof.processed",
  "proof.published",
  "proof.redacted",
  "proof.taken_down",
  "proof.moderation_pending",
  "proof.approved",
  "proof.rejected",
  "proof.moderation_approved",
  "proof.moderation_rejected",
  "proof.original_archived",
  "proof.asset_pruned",
];

const forwardSse = (type, message) => {
  if (!message || message.dareId == null) return;
  const listeners = sseClients.get(message.dareId);
  if (!listeners || !listeners.size) return;
  const data = `event: ${type}\ndata: ${JSON.stringify(message.payload || {})}\n\n`;
  for (const res of listeners) res.write(data);
};

for (const evt of broadcastEvents) {
  subscribeBus(evt, (msg) => forwardSse(evt, msg));
}

function getCookies(req) {
  const header = req.headers.cookie;
  const out = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const [k, v] = part.trim().split("=");
    if (!k) continue;
    out[k] = decodeURIComponent(v || "");
  }
  return out;
}

function ensureAnonId(req, res, next) {
  const cookies = getCookies(req);
  let anonId = cookies["anon-id"];
  if (!anonId) {
    anonId = randomUUID();
    res.append("Set-Cookie", `anon-id=${anonId}; Path=/; HttpOnly; SameSite=Lax`);
  }
  req.anonId = anonId;
  next();
}

function requireFlag(req, res, next) {
  if (!FEATURE_LINK_DARES) return res.status(404).json({ error: "Not found" });
  next();
}

function csrf(req, res, next) {
  if (req.method === "GET" || req.method === "HEAD") return next();
  const cookies = getCookies(req);
  const token = req.headers["x-csrf-token"];
  if (!token || !cookies["csrf-token"] || cookies["csrf-token"] !== token) {
    return res.status(403).json({ error: "Invalid CSRF token" });
  }
  next();
}

function ensureCsrfCookie(req, res, next) {
  const cookies = getCookies(req);
  if (!cookies["csrf-token"]) {
    const value = crypto.randomBytes(16).toString("hex");
    res.append("Set-Cookie", `csrf-token=${value}; Path=/; SameSite=Lax`);
    req.csrfToken = value;
  }
  next();
}

function rateLimit(key) {
  const bucket = rateBuckets.get(key) || { count: 0, reset: Date.now() + 60000 };
  const now = Date.now();
  if (now > bucket.reset) {
    bucket.count = 0;
    bucket.reset = now + 60000;
  }
  bucket.count += 1;
  rateBuckets.set(key, bucket);
  return bucket.count <= 30;
}

function getIp(req) {
  return req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";
}

async function signInvite(payload, exp) {
  const epochSeconds = Math.floor(Date.parse(exp) / 1000);
  const primary = inviteKeys[0];
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256", kid: primary.kid })
    .setIssuedAt()
    .setIssuer(BASE_URL)
    .setAudience("invite")
    .setExpirationTime(epochSeconds)
    .sign(encoder.encode(primary.secret));
}

async function verifyInvite(token) {
  const { payload } = await jwtVerify(
    token,
    async ({ kid }) => {
      let entry = kid ? inviteKeys.find((item) => item.kid === kid) : null;
      if (!entry) entry = inviteKeys[0];
      if (!entry) throw new Error("invalid key");
      return encoder.encode(entry.secret);
    },
    { audience: "invite" }
  );
  if (!payload || payload.v !== 1) throw new Error("invalid token");
  return payload;
}

function computeCommitHash(committedNumber, salt, dareId) {
  const num = Buffer.alloc(2);
  num.writeUInt16BE(committedNumber);
  return crypto.createHash("sha256").update(Buffer.concat([num, salt, Buffer.from(dareId)])).digest();
}

function dareResponse(dare) {
  return {
    id: dare.id,
    title: dare.title,
    description: dare.description,
    category: dare.category,
    rangeN: dare.range_n,
    expiryTs: dare.expiry_ts,
    visibility: dare.visibility,
    status: dare.status,
  };
}

function storeIdempotent(dareId, key, payload) {
  db.prepare(
    "INSERT OR REPLACE INTO idempotency_keys (id, dare_id, key, response) VALUES (?, ?, ?, ?)"
  ).run(`${dareId}:${key}`, dareId, key, JSON.stringify(payload));
}

function getIdempotent(dareId, key) {
  return db.prepare("SELECT response FROM idempotency_keys WHERE dare_id = ? AND key = ?").get(dareId, key);
}

function emitEvent(dareId, type, payload) {
  const event = {
    id: randomUUID(),
    dare_id: dareId,
    type,
    payload: JSON.stringify(payload),
    at: new Date().toISOString(),
  };
  db.prepare(
    "INSERT INTO events (id, dare_id, type, payload, at) VALUES (@id, @dare_id, @type, @payload, @at)"
  ).run(event);
  publishBus(type, { dareId, payload, id: event.id, at: event.at });
}

function emitSystem(type, payload) {
  const event = {
    id: randomUUID(),
    dare_id: null,
    type,
    payload: JSON.stringify(payload || {}),
    at: new Date().toISOString(),
  };
  db
    .prepare("INSERT INTO events (id, dare_id, type, payload, at) VALUES (@id, @dare_id, @type, @payload, @at)")
    .run(event);
  publishBus(type, { dareId: null, payload: payload || {}, id: event.id, at: event.at });
}

function checkExpiry(dare) {
  if (!dare.expiry_ts) return dare;
  const now = Date.now();
  const exp = Date.parse(dare.expiry_ts);
  if (now >= exp && dare.status !== "resolved" && dare.status !== "expired") {
    db.prepare("UPDATE dares SET status = ?, updated_at = datetime('now') WHERE id = ?").run("expired", dare.id);
    emitEvent(dare.id, "dare.expired", { id: dare.id });
    return { ...dare, status: "expired" };
  }
  return dare;
}

app.use(ensureCsrfCookie);
app.use(ensureAnonId);
app.use((req, res, next) => {
  establishSession(req, res);
  next();
});
app.use(csrf);

app.post("/api/dares", requireFlag, async (req, res) => {
  const {
    title,
    description,
    category,
    rangeN,
    expiryTs,
    visibility,
    committedNumber,
  } = req.body || {};
  if (!title || typeof title !== "string") return res.status(400).json({ error: "Invalid title" });
  const range = Number(rangeN);
  const committed = Number(committedNumber);
  if (!Number.isInteger(range) || range < 2 || range > 1000)
    return res.status(400).json({ error: "Invalid range" });
  if (!Number.isInteger(committed) || committed < 1 || committed > range)
    return res.status(400).json({ error: "Invalid committed number" });
  const now = Date.now();
  const expiry = Date.parse(expiryTs);
  if (Number.isNaN(expiry)) return res.status(400).json({ error: "Invalid expiry" });
  if (expiry < now + 5 * 60 * 1000 || expiry > now + 7 * 24 * 60 * 60 * 1000)
    return res.status(400).json({ error: "Expiry out of bounds" });
  const dareId = randomUUID();
  const salt = crypto.randomBytes(32);
  const hash = computeCommitHash(committed, salt, dareId);
  const slug = crypto.randomBytes(4).toString("hex");
  const inviteId = randomUUID();
  const jti = randomUUID();
  const inviteExpiry = new Date(Math.min(expiry, now + 48 * 3600 * 1000)).toISOString();
  db.prepare(
    `INSERT INTO dares (id, title, description, category, range_n, expiry_ts, visibility, status, commit_hash, commit_salt, committed_number)
     VALUES (@id, @title, @description, @category, @range_n, @expiry_ts, @visibility, 'open', @commit_hash, @commit_salt, @committed_number)`
  ).run({
    id: dareId,
    title,
    description: description || null,
    category: category || null,
    range_n: range,
    expiry_ts: new Date(expiry).toISOString(),
    visibility: visibility || "private",
    commit_hash: hash,
    commit_salt: salt,
    committed_number: committed,
  });
  db.prepare(
    `INSERT INTO dare_invites (id, dare_id, slug, jti, expires_at) VALUES (@id, @dare_id, @slug, @jti, @expires_at)`
  ).run({
    id: inviteId,
    dare_id: dareId,
    slug,
    jti,
    expires_at: inviteExpiry,
  });
  emitEvent(dareId, "dare.created", { id: dareId });
  const inviteToken = await signInvite(
    { sub: dareId, jti, v: 1, nonce: crypto.randomBytes(8).toString("hex") },
    inviteExpiry
  );
  const inviteUrl = new URL(`/i/${slug}`, BASE_URL);
  inviteUrl.searchParams.set("t", inviteToken);
  res.status(201).json({
    dareId,
    slug,
    inviteUrl: inviteUrl.toString(),
    expiryTs: new Date(expiry).toISOString(),
  });
});

app.get("/api/i/:slug", requireFlag, async (req, res) => {
  const { slug } = req.params;
  const token = req.query.t;
  if (!token || typeof token !== "string") return res.status(401).json({ error: "Missing token" });
  let payload;
  try {
    payload = await verifyInvite(token);
  } catch (err) {
    return res.status(401).json({ error: "Invalid token" });
  }
  const invite = db
    .prepare(
      `SELECT d.*, i.slug, i.expires_at FROM dare_invites i JOIN dares d ON d.id = i.dare_id WHERE i.slug = ?`
    )
    .get(slug);
  if (!invite || invite.id !== payload.sub) return res.status(404).json({ error: "Not found" });
  const dare = checkExpiry(invite);
  if (Date.now() > Date.parse(invite.expires_at)) return res.status(410).json({ error: "Invite expired" });
  res.json({
    dare: {
      id: dare.id,
      title: dare.title,
      description: dare.description,
      category: dare.category,
      rangeN: dare.range_n,
      expiryTs: dare.expiry_ts,
      visibility: dare.visibility,
      status: dare.status,
      fairness: {
        algorithm: "SHA-256 commit-reveal",
        commitHashPrefix: Buffer.from(dare.commit_hash).toString("hex").slice(0, 16),
      },
    },
  });
});

app.post("/api/dares/:id/accept", requireFlag, async (req, res) => {
  const key = req.headers["idempotency-key"];
  if (!key) return res.status(409).json({ error: "Missing idempotency key" });
  const cached = getIdempotent(req.params.id, key);
  if (cached) return res.json(JSON.parse(cached.response));
  const token = req.body?.inviteToken;
  if (!token) return res.status(400).json({ error: "Missing invite token" });
  let payload;
  try {
    payload = await verifyInvite(token);
  } catch (err) {
    return res.status(401).json({ error: "Invalid token" });
  }
  const dare = db.prepare("SELECT * FROM dares WHERE id = ?").get(req.params.id);
  if (!dare) return res.status(404).json({ error: "Not found" });
  checkExpiry(dare);
  if (dare.status === "resolved") return res.status(409).json({ error: "Already resolved" });
  if (dare.status === "expired") return res.status(410).json({ error: "Expired" });
  const invite = db.prepare("SELECT * FROM dare_invites WHERE dare_id = ?").get(dare.id);
  if (!invite || invite.jti !== payload.jti) return res.status(403).json({ error: "Invite mismatch" });
  if (invite.used_at) return res.status(403).json({ error: "Invite already used" });
  if (Date.now() > Date.parse(invite.expires_at)) return res.status(410).json({ error: "Invite expired" });
  const consumed = db.prepare("SELECT 1 FROM invite_jti WHERE jti = ?").get(payload.jti);
  if (consumed) return res.status(403).json({ error: "Invite already used" });
  const ip = getIp(req);
  if (!rateLimit(`${ip}:accept`)) return res.status(429).json({ error: "Rate limited" });
  const id = randomUUID();
  let broadcast = false;
  db.exec("BEGIN");
  try {
    db.prepare(
      "INSERT INTO invite_jti (jti, consumed_at) VALUES (?, datetime('now'))"
    ).run(payload.jti);
    db.prepare("UPDATE dare_invites SET used_at = datetime('now') WHERE id = ?").run(invite.id);
    db.prepare(
      "INSERT INTO acceptances (id, dare_id, accepter_id, accepted_at, ip, user_agent) VALUES (?, ?, ?, datetime('now'), ?, ?)"
    ).run(id, dare.id, req.anonId || null, ip, req.headers["user-agent"] || null);
    if (dare.status === "open") {
      db.prepare("UPDATE dares SET status = 'accepted', updated_at = datetime('now') WHERE id = ?").run(dare.id);
      broadcast = true;
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    if (/(UNIQUE|constraint)/i.test(err.message)) {
      const existing = db
        .prepare("SELECT response FROM idempotency_keys WHERE dare_id = ? AND key = ?")
        .get(dare.id, key);
      if (existing) return res.json(JSON.parse(existing.response));
      return res.status(403).json({ error: "Invite already used" });
    }
    throw err;
  }
  if (broadcast) emitEvent(dare.id, "dare.accepted", { id: dare.id });
  const response = { id, dareId: dare.id, status: "accepted" };
  storeIdempotent(dare.id, key, response);
  res.json(response);
});

app.post("/api/dares/:id/pick", requireFlag, (req, res) => {
  const key = req.headers["idempotency-key"];
  if (!key) return res.status(409).json({ error: "Missing idempotency key" });
  const cached = getIdempotent(req.params.id, key);
  if (cached) return res.json(JSON.parse(cached.response));
  const { role, value } = req.body || {};
  if (role !== "recipient") return res.status(400).json({ error: "Invalid role" });
  const pick = Number(value);
  const dare = db.prepare("SELECT * FROM dares WHERE id = ?").get(req.params.id);
  if (!dare) return res.status(404).json({ error: "Not found" });
  const ip = getIp(req);
  if (!rateLimit(`${ip}:pick`)) return res.status(429).json({ error: "Rate limited" });
  const updated = checkExpiry(dare);
  if (updated.status === "expired") return res.status(410).json({ error: "Expired" });
  if (!Number.isInteger(pick) || pick < 1 || pick > updated.range_n)
    return res.status(400).json({ error: "Invalid value" });
  if (updated.status !== "open" && updated.status !== "accepted")
    return res.status(409).json({ error: "Invalid state" });
  const commit = computeCommitHash(updated.committed_number, Buffer.from(updated.commit_salt), updated.id);
  if (!crypto.timingSafeEqual(Buffer.from(updated.commit_hash), commit))
    return res.status(400).json({ error: "Commit mismatch" });
  const matched = updated.committed_number === pick;
  db.prepare("UPDATE dares SET status = 'resolved', updated_at = datetime('now') WHERE id = ?").run(updated.id);
  const result = {
    committedNumber: updated.committed_number,
    revealedNumber: pick,
    matched,
  };
  emitEvent(updated.id, "dare.resolved", { id: updated.id, ...result });
  storeIdempotent(updated.id, key, result);
  res.json(result);
});

app.get("/api/dares/:id/stream", requireFlag, (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();
  const { id } = req.params;
  if (!sseClients.has(id)) sseClients.set(id, new Set());
  const clients = sseClients.get(id);
  clients.add(res);
  req.on("close", () => {
    clients.delete(res);
    if (!clients.size) sseClients.delete(id);
  });
  const existing = db.prepare("SELECT type, payload FROM events WHERE dare_id = ? ORDER BY at ASC").all(id);
  for (const row of existing) {
    res.write(`event: ${row.type}\ndata: ${row.payload}\n\n`);
  }
  const heartbeat = setInterval(() => {
    res.write(`event: heartbeat\ndata: {}\n\n`);
  }, 25000);
  req.on("close", () => clearInterval(heartbeat));
});

registerProofRoutes(app, {
  getIp,
  rateLimit,
  emit: (dareId, type, payload) => emitEvent(dareId, type, payload),
});

registerLeaderboardRoutes(app, {
  getIp,
  rateLimit,
  emit: (type, payload) => emitSystem(type, payload),
});

registerShareRoutes(app, {
  getIp,
  rateLimit,
});

app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

export default app;
export { computeCommitHash, signInvite, verifyInvite, emitSystem };
