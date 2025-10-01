import { WebSocketServer } from "ws";
import db from "../db.js";
import {
  FEATURE_REALTIME_WS,
  FEATURE_SECURITY_HARDENING,
  REALTIME_PING_MS,
  REALTIME_IDLE_TIMEOUT_MS,
  WS_MAX_CONN_PER_IP,
  WS_MSG_RATE_PER_MIN,
  WS_BURST,
} from "../config.js";
import { subscribeBus } from "./bus.js";
import { validateOrigin, establishSession } from "./auth.js";
import { consumeRate } from "./rate.js";
import { emitTelemetry } from "../telemetry.js";

const getIp = (req) =>
  req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";

const canViewDare = (userId, dareId) => {
  const row = db.prepare("SELECT visibility FROM dares WHERE id = ?").get(dareId);
  if (!row) return false;
  if (row.visibility !== "private") return true;
  if (!FEATURE_SECURITY_HARDENING) return true;
  if (!userId) return false;
  const accepted = db
    .prepare("SELECT 1 FROM acceptances WHERE dare_id = ? AND accepter_id = ? LIMIT 1")
    .get(dareId, userId);
  return Boolean(accepted);
};

const loadHistory = (dareId) =>
  db
    .prepare("SELECT type, payload FROM events WHERE dare_id = ? ORDER BY at ASC")
    .all(dareId)
    .map((row) => ({ type: row.type, dareId, payload: JSON.parse(row.payload) }));

const eventTypes = [
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
  "leaderboard.updated",
];

export const setupWebSocket = (server) => {
  if (!FEATURE_REALTIME_WS) return null;
  const ipCounts = new Map();
  const rooms = new Map();
  const clients = new Set();

  const verifyClient = (info, cb) => {
    const req = info.req;
    const originOk = validateOrigin(info.origin, req.headers.host);
    if (!originOk) {
      cb(false, 403, "Forbidden");
      return;
    }
    const ip = getIp(req);
    if (FEATURE_SECURITY_HARDENING) {
      const count = ipCounts.get(ip) || 0;
      if (count >= WS_MAX_CONN_PER_IP) {
        cb(false, 429, "Too Many Connections");
        return;
      }
    }
    const cookies = [];
    const resLike = {
      setHeader: (name, value) => {
        if (name === "Set-Cookie") {
          if (Array.isArray(value)) cookies.splice(0, cookies.length, ...value);
          else cookies.splice(0, cookies.length, value);
        }
      },
      getHeader: (name) => {
        if (name === "Set-Cookie") return cookies.slice();
        return undefined;
      },
    };
    const session = establishSession(req, resLike);
    req.wsContext = session;
    cb(true, 200, "OK", cookies.length ? { "Set-Cookie": cookies } : undefined);
  };

  const wss = new WebSocketServer({ noServer: true, clientTracking: false, verifyClient });

  const heartbeat = setInterval(() => {
    const now = Date.now();
    for (const client of clients) {
      if (client.ws.readyState !== 1) continue;
      if (now - client.lastPong > REALTIME_IDLE_TIMEOUT_MS) {
        client.ws.terminate();
        continue;
      }
      client.ws.ping();
    }
  }, REALTIME_PING_MS);

  const closeClient = (client, code, reason) => {
    try {
      client.ws.close(code, reason);
    } catch {
      client.ws.terminate();
    }
  };

  const addToRoom = (client, dareId) => {
    if (!rooms.has(dareId)) rooms.set(dareId, new Set());
    rooms.get(dareId).add(client);
    client.rooms.add(dareId);
  };

  const removeClient = (client) => {
    for (const dareId of client.rooms) {
      const set = rooms.get(dareId);
      if (set) {
        set.delete(client);
        if (!set.size) rooms.delete(dareId);
      }
    }
    client.rooms.clear();
    const count = ipCounts.get(client.ip) || 0;
    if (count <= 1) ipCounts.delete(client.ip);
    else ipCounts.set(client.ip, count - 1);
    clients.delete(client);
  };

  const sendMessage = (client, payload) => {
    if (client.ws.readyState !== 1) return;
    const text = JSON.stringify(payload);
    const size = Buffer.byteLength(text);
    if (client.pending >= 200 || client.ws.bufferedAmount + size > 1_000_000) {
      closeClient(client, 1013, "backpressure");
      return;
    }
    client.pending += 1;
    client.ws.send(text, (err) => {
      client.pending -= 1;
      if (err) client.ws.terminate();
    });
  };

  const broadcast = (type, message) => {
    if (message?.dareId == null) {
      if (type !== "leaderboard.updated") return;
      for (const client of clients) sendMessage(client, { type, payload: message?.payload ?? {} });
      return;
    }
    const set = rooms.get(message.dareId);
    if (!set || !set.size) return;
    for (const client of set) sendMessage(client, { type, dareId: message.dareId, payload: message.payload ?? {} });
  };

  for (const type of eventTypes) {
    subscribeBus(type, (data) => broadcast(type, data));
  }

  wss.on("connection", (ws, req) => {
    const ip = getIp(req);
    const count = ipCounts.get(ip) || 0;
    ipCounts.set(ip, count + 1);
    const context = req.wsContext || {};
    const client = {
      ws,
      ip,
      userId: context.userId || null,
      session: context.session || null,
      rooms: new Set(),
      pending: 0,
      lastPong: Date.now(),
    };
    clients.add(client);
    ws.on("pong", () => {
      client.lastPong = Date.now();
    });
    ws.on("message", async (raw) => {
      if (typeof raw !== "string" && !Buffer.isBuffer(raw)) return;
      if (FEATURE_SECURITY_HARDENING) {
        const allowed = await consumeRate(`ws:msg:${client.ip}`, WS_MSG_RATE_PER_MIN, WS_BURST);
        if (!allowed) {
          sendMessage(client, { type: "error", error: "rate_limited" });
          closeClient(client, 4008, "rate_limited");
          return;
        }
      }
      let payload;
      try {
        payload = JSON.parse(raw.toString());
      } catch {
        try {
          ws.close(4002, "bad_json");
        } catch {
          ws.terminate();
        }
        return;
      }
      if (!payload || typeof payload !== "object") {
        try {
          ws.close(4002, "bad_payload");
        } catch {
          ws.terminate();
        }
        return;
      }
      if (payload.type === "ping") {
        sendMessage(client, { type: "pong", at: Date.now() });
        return;
      }
      if (payload.type === "sub") {
        const dareId = typeof payload.dareId === "string" ? payload.dareId : null;
        if (!dareId) {
          closeClient(client, 4003, "bad_dare");
          return;
        }
        if (!canViewDare(client.userId, dareId)) {
          sendMessage(client, { type: "error", error: "unauthorized", dareId });
          closeClient(client, 4003, "unauthorized");
          return;
        }
        if (!client.rooms.has(dareId)) {
          addToRoom(client, dareId);
          const history = loadHistory(dareId);
          for (const item of history) sendMessage(client, item);
        }
        sendMessage(client, { type: "subscribed", dareId });
        return;
      }
      sendMessage(client, { type: "error", error: "unsupported" });
    });
    ws.on("close", () => {
      removeClient(client);
      emitTelemetry("ws_close", { ip: client.ip, at: Date.now() });
    });
    ws.on("error", () => {
      removeClient(client);
    });
    emitTelemetry("ws_connect", { ip, at: Date.now() });
  });

  server.on("upgrade", (req, socket, head) => {
    const { url = "/" } = req;
    let pathname;
    try {
      pathname = new URL(url, `http://${req.headers.host || "localhost"}`).pathname;
    } catch {
      socket.destroy();
      return;
    }
    if (pathname !== "/ws") return;
    if (!FEATURE_REALTIME_WS) {
      socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });

  wss.on("close", () => {
    clearInterval(heartbeat);
    for (const client of clients) client.ws.terminate();
    clients.clear();
    rooms.clear();
    ipCounts.clear();
  });

  return wss;
};
