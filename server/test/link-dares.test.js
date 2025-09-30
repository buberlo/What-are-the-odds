import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";
import EventSource from "eventsource";

let app;
let computeCommitHash;
let signInvite;
let verifyInvite;
let db;
let serverInstance;

const csrfToken = "test-csrf";
const anonId = "anon-test";
const baseCookies = `csrf-token=${csrfToken}; anon-id=${anonId}`;

beforeAll(async () => {
  process.env.FEATURE_LINK_DARES = "true";
  process.env.DATABASE_URL = ":memory:";
  process.env.INVITE_JWT_SECRET = "test-secret";
  process.env.BASE_URL = "http://localhost:3000";
  ({ default: app, computeCommitHash, signInvite, verifyInvite } = await import("../src/app.js"));
  ({ default: db } = await import("../src/db.js"));
  serverInstance = app.listen(0);
});

afterAll(() => {
  serverInstance?.close();
});

beforeEach(() => {
  db.exec(
    "DELETE FROM acceptances; DELETE FROM events; DELETE FROM dare_invites; DELETE FROM dares; DELETE FROM invite_jti; DELETE FROM idempotency_keys;"
  );
});

const createDare = async (overrides = {}) => {
  const request = supertest(app);
  const expiry = new Date(Date.now() + 10 * 60000).toISOString();
  const response = await request
    .post("/api/dares")
    .set("Cookie", baseCookies)
    .set("X-CSRF-Token", csrfToken)
    .send({
      title: "Test Dare",
      description: "Do something wild",
      category: "test",
      rangeN: 10,
      expiryTs: expiry,
      visibility: "private",
      committedNumber: 3,
      ...overrides,
    });
  expect(response.status).toBe(201);
  return response.body;
};

describe("link dares unit logic", () => {
  it("computes commit hash deterministically", () => {
    const salt = Buffer.alloc(32, 1);
    const hashA = computeCommitHash(7, salt, "abc");
    const hashB = computeCommitHash(7, salt, "abc");
    const hashC = computeCommitHash(8, salt, "abc");
    expect(hashA.equals(hashB)).toBe(true);
    expect(hashA.equals(hashC)).toBe(false);
  });

  it("signs and verifies invite tokens", async () => {
    const token = await signInvite({ sub: "dare", jti: "jti", v: 1, nonce: "x" }, "2099-01-01T00:00:00.000Z");
    const payload = await verifyInvite(token);
    expect(payload.sub).toBe("dare");
    expect(payload.jti).toBe("jti");
  });
});

describe("link dares API", () => {
  it("rejects expiry outside bounds", async () => {
    const request = supertest(app);
    const expiry = new Date(Date.now() + 2 * 60000).toISOString();
    const response = await request
      .post("/api/dares")
      .set("Cookie", baseCookies)
      .set("X-CSRF-Token", csrfToken)
      .send({
        title: "Invalid",
        description: "",
        category: "",
        rangeN: 5,
        expiryTs: expiry,
        visibility: "private",
        committedNumber: 2,
      });
    expect(response.status).toBe(400);
  });

  it("enforces idempotency on accept", async () => {
    const dare = await createDare();
    const token = new URL(dare.inviteUrl).searchParams.get("t");
    const request = supertest(app);
    const payload = {
      inviteToken: token,
    };
    const headers = {
      "Cookie": baseCookies,
      "X-CSRF-Token": csrfToken,
      "Idempotency-Key": "idem-test",
    };
    const first = await request.post(`/api/dares/${dare.dareId}/accept`).set(headers).send(payload);
    expect(first.status).toBe(200);
    const second = await request.post(`/api/dares/${dare.dareId}/accept`).set(headers).send(payload);
    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body);
  }, 10000);

  it("prevents invalid state transitions", async () => {
    const dare = await createDare();
    const token = new URL(dare.inviteUrl).searchParams.get("t");
    const request = supertest(app);
    const headers = {
      "Cookie": baseCookies,
      "X-CSRF-Token": csrfToken,
      "Idempotency-Key": "pick-test",
    };
    const acceptHeaders = {
      "Cookie": baseCookies,
      "X-CSRF-Token": csrfToken,
      "Idempotency-Key": "pick-accept",
    };
    await request.post(`/api/dares/${dare.dareId}/accept`).set(acceptHeaders).send({ inviteToken: token });
    const pick = await request
      .post(`/api/dares/${dare.dareId}/pick`)
      .set(headers)
      .send({ role: "recipient", value: 3 });
    expect(pick.status).toBe(200);
    const repeat = await request
      .post(`/api/dares/${dare.dareId}/pick`)
      .set({ ...headers, "Idempotency-Key": "pick-again" })
      .send({ role: "recipient", value: 3 });
    expect(repeat.status).toBe(409);
  }, 10000);

  it("runs full flow with SSE events", async () => {
    const dare = await createDare({ committedNumber: 4 });
    const token = new URL(dare.inviteUrl).searchParams.get("t");
    const address = serverInstance.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const events = [];
    await new Promise((resolve) => setTimeout(resolve, 10));
    const source = new EventSource(`${baseUrl}/api/dares/${dare.dareId}/stream`, {
      headers: {
        Cookie: baseCookies,
      },
    });
    source.addEventListener("dare.created", () => {
      events.push("created");
    });
    source.addEventListener("dare.accepted", () => {
      events.push("accepted");
    });
    source.addEventListener("dare.resolved", (event) => {
      const payload = JSON.parse(event.data);
      events.push(`resolved:${payload.matched}`);
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    const request = supertest(app);
    await request
      .post(`/api/dares/${dare.dareId}/accept`)
      .set({
        "Cookie": baseCookies,
        "X-CSRF-Token": csrfToken,
        "Idempotency-Key": "idem-flow-accept",
      })
      .send({ inviteToken: token });
    await request
      .post(`/api/dares/${dare.dareId}/pick`)
      .set({
        "Cookie": baseCookies,
        "X-CSRF-Token": csrfToken,
        "Idempotency-Key": "idem-flow-pick",
      })
      .send({ role: "recipient", value: 4 });
    await new Promise((resolve) => setTimeout(resolve, 100));
    source.close();
    expect(events).toContain("created");
    expect(events).toContain("accepted");
    expect(events).toContain("resolved:true");
  }, 15000);
});
