import { randomUUID } from "crypto";
import db from "../db.js";
import {
  REALTIME_ALLOWED_ORIGINS,
  TOKEN_ROTATION_MIN,
  FEATURE_SECURITY_HARDENING,
} from "../config.js";

const SESSION_TTL_MIN = 1440;

const parseCookies = (header) => {
  const map = {};
  if (!header) return map;
  const parts = header.split(";");
  for (const part of parts) {
    const [key, value] = part.trim().split("=");
    if (!key) continue;
    map[key] = decodeURIComponent(value || "");
  }
  return map;
};

const isoNow = () => new Date().toISOString();
const addMinutes = (iso, minutes) => new Date(Date.parse(iso) + minutes * 60000).toISOString();

const loadToken = (jti) => {
  if (!jti) return null;
  return db.prepare("SELECT * FROM session_tokens WHERE jti = ?").get(jti);
};

const revokeToken = (id) => {
  if (!id) return;
  db.prepare("UPDATE session_tokens SET revoked_at = datetime('now') WHERE id = ? AND revoked_at IS NULL").run(id);
};

const insertToken = ({ userId, rotatedFrom }) => {
  const now = isoNow();
  const expires = addMinutes(now, SESSION_TTL_MIN);
  const id = randomUUID();
  const jti = randomUUID();
  db.prepare(
    `INSERT INTO session_tokens (id, user_id, jti, issued_at, expires_at, rotated_from, revoked_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL)`
  ).run(id, userId, jti, now, expires, rotatedFrom ?? null);
  return db.prepare("SELECT * FROM session_tokens WHERE id = ?").get(id);
};

const shouldRotate = (issuedAt) => {
  if (!TOKEN_ROTATION_MIN) return false;
  const issued = Date.parse(issuedAt);
  if (!Number.isFinite(issued)) return true;
  return Date.now() - issued > TOKEN_ROTATION_MIN * 60000;
};

export const validateOrigin = (origin, host) => {
  if (!FEATURE_SECURITY_HARDENING) return true;
  if (!origin) return true;
  if (!REALTIME_ALLOWED_ORIGINS.length) return true;
  if (REALTIME_ALLOWED_ORIGINS.includes(origin)) return true;
  if (host && REALTIME_ALLOWED_ORIGINS.includes(`https://${host}`)) return true;
  return false;
};

export const establishSession = (req, res) => {
  const cookies = parseCookies(req.headers?.cookie);
  const headers = [];
  let anonId = cookies["anon-id"];
  if (!anonId) {
    anonId = randomUUID();
    headers.push(`anon-id=${anonId}; Path=/; HttpOnly; SameSite=Lax`);
  }
  let tokenRecord = loadToken(cookies["session-token"]);
  const now = Date.now();
  if (tokenRecord) {
    const expires = Date.parse(tokenRecord.expires_at);
    if (!Number.isFinite(expires) || expires <= now || tokenRecord.revoked_at) {
      revokeToken(tokenRecord.id);
      tokenRecord = null;
    }
  }
  let active = tokenRecord;
  if (!active) {
    active = insertToken({ userId: anonId });
  } else if (shouldRotate(active.issued_at)) {
    revokeToken(active.id);
    active = insertToken({ userId: anonId, rotatedFrom: active.id });
  }
  headers.push(`session-token=${active.jti}; Path=/; HttpOnly; SameSite=Lax`);
  if (headers.length) {
    const existing = res.getHeader ? res.getHeader("Set-Cookie") : undefined;
    const combined = [
      ...(Array.isArray(existing) ? existing : existing ? [existing] : []),
      ...headers,
    ];
    res.setHeader("Set-Cookie", combined);
  }
  return {
    userId: anonId,
    session: active,
  };
};
