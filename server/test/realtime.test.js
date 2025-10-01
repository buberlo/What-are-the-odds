import { afterAll, beforeAll, describe, expect, it } from "vitest";
import http from "http";
import supertest from "supertest";
import WebSocket from "ws";
import EventSource from "eventsource";
import crypto from "crypto";

let app;
let server;
let request;
let port;
let setupWebSocket;
let db;
let establishSession;
let validateOrigin;
let consumeRate;

const csrfToken = "test-csrf";
const anonId = "anon-ws";
const baseCookies = `csrf-token=${csrfToken}; anon-id=${anonId}`;

const waitFor = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const withTimeout = (promise, ms = 5000) =>
  Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);

beforeAll(async () => {
  process.env.DATABASE_URL = ":memory:";
  process.env.FEATURE_LINK_DARES = "true";
  process.env.FEATURE_PROOFS = "true";
  process.env.FEATURE_VIDEO_PROOFS = "true";
  process.env.FEATURE_PROOF_MODERATION = "true";
  process.env.FEATURE_PROOF_BLUR = "true";
  process.env.FEATURE_REALTIME_WS = "true";
  process.env.FEATURE_SECURITY_HARDENING = "true";
  process.env.FEATURE_PERF_TELEM = "false";
  process.env.REDIS_URL = "";
  process.env.REALTIME_ALLOWED_ORIGINS = "http://localhost";
  process.env.BASE_URL = "http://localhost";
  process.env.SHARE_BASE_URL = "http://localhost";
  process.env.WS_MSG_RATE_PER_MIN = "600";
  process.env.WS_BURST = "100";
  process.env.REALTIME_PING_MS = "1000";
  process.env.REALTIME_IDLE_TIMEOUT_MS = "5000";
  process.env.TOKEN_ROTATION_MIN = "1";
  ({ default: app } = await import("../src/app.js"));
  ({ setupWebSocket } = await import("../src/realtime/wsGateway.js"));
  ({ default: db } = await import("../src/db.js"));
  ({ establishSession, validateOrigin } = await import("../src/realtime/auth.js"));
  ({ consumeRate } = await import("../src/realtime/rate.js"));
  const httpServer = http.createServer(app);
  setupWebSocket(httpServer);
  await new Promise((resolve) => {
    server = httpServer.listen(0, resolve);
  });
  port = server.address().port;
  request = supertest(httpServer);
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

const createDare = async () => {
  const expiry = new Date(Date.now() + 15 * 60000).toISOString();
  const response = await request
    .post("/api/dares")
    .set({ "Cookie": baseCookies, "X-CSRF-Token": csrfToken })
    .send({
      title: "Realtime Dare",
      description: "Realtime",
      category: "test",
      rangeN: 10,
      expiryTs: expiry,
      visibility: "private",
      committedNumber: 4,
    });
  expect(response.status).toBe(201);
  return response.body;
};

const acceptDare = async (dareId, inviteToken) => {
  const response = await request
    .post(`/api/dares/${dareId}/accept`)
    .set({
      "Cookie": baseCookies,
      "X-CSRF-Token": csrfToken,
      "Idempotency-Key": `accept-${crypto.randomUUID()}`,
    })
    .send({ inviteToken });
  expect(response.status).toBe(200);
};

const resolveDare = async (dareId) => {
  const response = await request
    .post(`/api/dares/${dareId}/pick`)
    .set({
      "Cookie": baseCookies,
      "X-CSRF-Token": csrfToken,
      "Idempotency-Key": `pick-${crypto.randomUUID()}`,
    })
    .send({ role: "recipient", value: 4 });
  expect(response.status).toBe(200);
};

describe("auth utilities", () => {
  it("rejects disallowed origins when hardening enabled", () => {
    expect(validateOrigin("https://evil.example", "what-are-the-odds.com")).toBe(false);
    expect(validateOrigin("http://localhost", "what-are-the-odds.com")).toBe(true);
  });

  it("rotates session tokens when past threshold", () => {
    const req = { headers: { cookie: "" } };
    const headers = [];
    const res = {
      setHeader: (name, value) => {
        if (name === "Set-Cookie") headers.splice(0, headers.length, ...(Array.isArray(value) ? value : [value]));
      },
      getHeader: () => headers.slice(),
    };
    const first = establishSession(req, res);
    expect(first.session).toBeTruthy();
    const tokenBefore = first.session.jti;
    const record = db.prepare("SELECT id FROM session_tokens WHERE jti = ?").get(tokenBefore);
    db.prepare("UPDATE session_tokens SET issued_at = datetime('now', '-2 minutes') WHERE id = ?").run(record.id);
    const second = establishSession({ headers: { cookie: headers.join("; ") } }, res);
    expect(second.session.jti).not.toBe(tokenBefore);
    const rotated = db.prepare("SELECT revoked_at FROM session_tokens WHERE jti = ?").get(tokenBefore);
    expect(rotated.revoked_at).not.toBeNull();
  });
});

describe("rate limiter", () => {
  it("limits after burst is exhausted", async () => {
    const key = `bucket:${Date.now()}`;
    expect(await consumeRate(key, 2, 2)).toBe(true);
    expect(await consumeRate(key, 2, 2)).toBe(true);
    const allowed = await consumeRate(key, 2, 2);
    expect(allowed).toBe(false);
  });
});

describe("websocket realtime", () => {
  const connectClient = (origin = "http://localhost", cookie = baseCookies) =>
    new WebSocket(`ws://127.0.0.1:${port}/ws`, { headers: { Origin: origin, Cookie: cookie } });

  it("fans out resolution events to multiple subscribers and SSE", async () => {
    const dare = await createDare();
    const inviteToken = new URL(dare.inviteUrl).searchParams.get("t");
    await acceptDare(dare.dareId, inviteToken);

    const eventsA = [];
    const eventsB = [];
    const wsA = connectClient("http://localhost", baseCookies);
    const wsB = connectClient("http://localhost", baseCookies);

    const ready = () =>
      new Promise((resolve) => {
        let aReady = false;
        let bReady = false;
        const check = () => {
          if (aReady && bReady) resolve(undefined);
        };
        wsA.on("open", () => {
          wsA.send(JSON.stringify({ type: "sub", dareId: dare.dareId }));
        });
        wsB.on("open", () => {
          wsB.send(JSON.stringify({ type: "sub", dareId: dare.dareId }));
        });
        wsA.on("message", (raw) => {
          const data = JSON.parse(raw.toString());
          if (data.type === "subscribed") {
            aReady = true;
            check();
            return;
          }
          eventsA.push(data.type);
        });
        wsB.on("message", (raw) => {
          const data = JSON.parse(raw.toString());
          if (data.type === "subscribed") {
            bReady = true;
            check();
            return;
          }
          eventsB.push(data.type);
        });
      });
    await withTimeout(ready());

    const sseEvents = [];
    const sse = new EventSource(`http://127.0.0.1:${port}/api/dares/${dare.dareId}/stream`, {
      headers: { Cookie: baseCookies },
    });
    sse.addEventListener("dare.resolved", (event) => {
      sseEvents.push(event.type);
    });

    await resolveDare(dare.dareId);
    await waitFor(150);

    expect(eventsA).toContain("dare.resolved");
    expect(eventsB).toContain("dare.resolved");
    await waitFor(100);
    expect(sseEvents).toContain("dare.resolved");

    wsA.close();
    wsB.close();
    sse.close();
  }, 10000);

  it("denies cross-origin connections", async () => {
    const ws = connectClient("https://attacker.example", baseCookies);
    await withTimeout(
      new Promise((resolve) => {
        ws.on("error", resolve);
      })
    );
  });

  it("rejects unauthorized private subscriptions", async () => {
    const privateDare = await createDare();
    const wsPrivate = connectClient("http://localhost", `csrf-token=${csrfToken}; anon-id=stranger`);
    const closeCodes = [];
    let unauthorizedMessage = false;
    wsPrivate.on("open", () => {
      wsPrivate.send(JSON.stringify({ type: "sub", dareId: privateDare.dareId }));
    });
    wsPrivate.on("message", (raw) => {
      const data = JSON.parse(raw.toString());
      if (data.type === "error" && data.error === "unauthorized") unauthorizedMessage = true;
    });
    wsPrivate.on("close", (code) => {
      closeCodes.push(code);
    });
    wsPrivate.on("error", () => {
      closeCodes.push(4003);
    });
    await waitFor(1000);
    expect(unauthorizedMessage || closeCodes.includes(4003)).toBe(true);
    wsPrivate.close();
  }, 10000);

  it("disconnects clients exceeding rate limit", async () => {
    const dare = await createDare();
    await db.prepare("UPDATE dares SET visibility = 'public' WHERE id = ?").run(dare.dareId);
    await consumeRate("ws:msg:::ffff:127.0.0.1", 600, 100, 100);
    await consumeRate("ws:msg:127.0.0.1", 600, 100, 100);
    const ws = connectClient("http://localhost", baseCookies);
    await withTimeout(
      new Promise((resolve, reject) => {
        ws.on("open", () => {
          ws.send(JSON.stringify({ type: "sub", dareId: dare.dareId }));
          ws.send(JSON.stringify({ type: "ping" }));
          ws.send(JSON.stringify({ type: "ping" }));
          ws.send(JSON.stringify({ type: "ping" }));
        });
        ws.on("close", (code) => {
          if (code === 4008) resolve(undefined);
          else reject(new Error(`unexpected close ${code}`));
        });
      })
    );
  }, 10000);
});
