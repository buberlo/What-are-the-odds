import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";
import crypto from "crypto";

let app;
let db;
let computeLeaderboardEntries;
let saveSnapshot;
let findSnapshotByWindow;
let rebuildSnapshot;

const csrfToken = "test-csrf";
const anonId = "anon-test";
const baseCookies = `csrf-token=${csrfToken}; anon-id=${anonId}`;

beforeAll(async () => {
  process.env.DATABASE_URL = ":memory:";
  process.env.FEATURE_LINK_DARES = "true";
  process.env.FEATURE_PROOFS = "true";
  process.env.FEATURE_LEADERBOARDS = "true";
  process.env.FEATURE_SHARING = "true";
  process.env.ADMIN_API_TOKEN = "admin-secret";
  ({ default: app } = await import("../src/app.js"));
  ({ default: db } = await import("../src/db.js"));
  ({ computeLeaderboardEntries, saveSnapshot, findSnapshotByWindow } = await import("../src/leaderboard.js"));
  ({ rebuildSnapshot } = await import("../src/leaderboardScheduler.js"));
});

afterAll(() => {
  db?.close?.();
});

beforeEach(() => {
  db.exec(
    "DELETE FROM leaderboard_snapshots; DELETE FROM proof_assets; DELETE FROM proofs; DELETE FROM acceptances; DELETE FROM events; DELETE FROM dare_invites; DELETE FROM dares;"
  );
});

const createResolvedDare = ({
  dareId = crypto.randomUUID(),
  category = null,
  userId = "user-1",
  matched = false,
  acceptedAt = "2024-01-01T00:00:00.000Z",
  resolvedAt = "2024-01-01T00:05:00.000Z",
  range = 10,
  visibility = "public",
  committedNumber = 4,
  revealedNumber = 3,
  withProof = false,
}) => {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO dares (id, title, description, category, range_n, expiry_ts, visibility, status, commit_hash, commit_salt, committed_number, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'resolved', ?, ?, ?, ?, ?)`
  ).run(
    dareId,
    "Test Dare",
    "",
    category,
    range,
    "2099-01-01T00:00:00.000Z",
    visibility,
    crypto.randomBytes(32),
    crypto.randomBytes(32),
    committedNumber,
    now,
    resolvedAt
  );

  db.prepare(
    `INSERT INTO acceptances (id, dare_id, accepter_id, accepted_at, ip, user_agent)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(crypto.randomUUID(), dareId, userId, acceptedAt, "127.0.0.1", "vitest");

  db.prepare(
    `INSERT INTO events (id, dare_id, type, payload, at)
     VALUES (?, ?, 'dare.resolved', ?, ?)`
  ).run(
    crypto.randomUUID(),
    dareId,
    JSON.stringify({ matched, committedNumber, revealedNumber }),
    resolvedAt
  );

  if (withProof) {
    const proofId = crypto.randomUUID();
    db.prepare(
      `INSERT INTO proofs (id, slug, dare_id, uploader_id, type, storage_key, sha256, size_bytes, moderation, visibility, watermark, published_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'photo', ?, ?, ?, 'approved', 'public', 0, ?, ?, ?)`
    ).run(
      proofId,
      `proof-${proofId.slice(0, 8)}`,
      dareId,
      userId,
      `proofs/${dareId}/public/${proofId}.jpg`,
      crypto.randomBytes(32),
      1024,
      resolvedAt,
      resolvedAt,
      resolvedAt
    );
    db.prepare(
      `INSERT INTO proof_assets (id, proof_id, kind, storage_key, mime, size_bytes, sha256)
       VALUES (?, ?, 'poster', ?, 'image/jpeg', ?, ?)`
    ).run(
      crypto.randomUUID(),
      proofId,
      `proofs/${dareId}/public/${proofId}-poster.jpg`,
      1024,
      crypto.randomBytes(32)
    );
  }

  return dareId;
};

describe("leaderboard computation", () => {
  it("aggregates wins, streak, and median", () => {
    createResolvedDare({ matched: false, resolvedAt: "2024-01-01T00:05:00.000Z" });
    createResolvedDare({ matched: false, resolvedAt: "2024-01-02T00:05:00.000Z" });
    createResolvedDare({ matched: true, resolvedAt: "2024-01-03T00:05:00.000Z", revealedNumber: 4 });

    const { entries } = computeLeaderboardEntries({
      fromTs: "2023-12-31T00:00:00.000Z",
      toTs: "2024-01-04T00:00:00.000Z",
      category: undefined,
      withProofs: false,
      limit: 100,
    });

    expect(entries.length).toBe(1);
    const player = entries[0];
    expect(player.played).toBe(3);
    expect(player.wins).toBe(2);
    expect(player.triggered).toBe(1);
    expect(player.streak).toBe(2);
    expect(player.median_completion_ms).toBe(300000);
  });

  it("filters by category", () => {
    createResolvedDare({ category: "action", matched: false });
    createResolvedDare({ category: "puzzle", matched: false, userId: "user-2" });

    const { entries } = computeLeaderboardEntries({
      fromTs: "2023-12-31T00:00:00.000Z",
      toTs: "2024-01-04T00:00:00.000Z",
      category: "action",
      withProofs: false,
      limit: 100,
    });

    expect(entries.length).toBe(1);
    expect(entries[0].userId).toBe("user-1");
  });

  it("enforces withProofs filter", () => {
    createResolvedDare({ matched: false, withProof: true });
    createResolvedDare({ matched: false, withProof: false, userId: "user-2" });

    const { entries } = computeLeaderboardEntries({
      fromTs: "2023-12-31T00:00:00.000Z",
      toTs: "2024-01-04T00:00:00.000Z",
      category: undefined,
      withProofs: true,
      limit: 100,
    });

    expect(entries.length).toBe(1);
    expect(entries[0].userId).toBe("user-1");
    expect(entries[0].latest_proof_thumb).toBeTruthy();
  });

  it("saves and retrieves snapshots", () => {
    createResolvedDare({ matched: false, resolvedAt: "2024-01-01T00:05:00.000Z" });
    const fromTs = new Date("2023-12-31T00:00:00.000Z");
    const toTs = new Date("2024-01-02T00:00:00.000Z");

    const { entries } = computeLeaderboardEntries({
      fromTs: fromTs.toISOString(),
      toTs: toTs.toISOString(),
      category: undefined,
      withProofs: false,
      limit: 100,
    });

    expect(entries.length).toBeGreaterThan(0);
    saveSnapshot({ period: "daily", category: null, withProofs: false, fromTs, toTs, entries });
    const snapshot = findSnapshotByWindow({
      period: "daily",
      category: null,
      withProofs: false,
      fromTs,
      toTs,
    });
    expect(snapshot).toBeTruthy();
    expect(JSON.parse(snapshot.data).length).toBe(entries.length);
  });
});

describe("leaderboard API", () => {
  it("returns cached snapshot with categories", async () => {
    createResolvedDare({ category: "action", matched: false, withProof: true });
    await rebuildSnapshot({ period: "daily", category: null, withProofs: false });

    const request = supertest(app);
    const response = await request.get("/api/leaderboard").query({ period: "daily", category: "*" });
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("public, max-age=30, stale-while-revalidate=300");
    expect(Array.isArray(response.body.entries)).toBe(true);
    expect(Array.isArray(response.body.categories)).toBe(true);
  });

  it("requires admin token for rebuild", async () => {
    createResolvedDare({ matched: false });
    const request = supertest(app);
    const forbidden = await request.post("/api/admin/leaderboard/rebuild").send({ period: "daily" });
    expect(forbidden.status).toBe(403);
    const ok = await request
      .post("/api/admin/leaderboard/rebuild")
      .set("X-Admin-Token", "admin-secret")
      .send({ period: "daily", withProofs: false });
    expect(ok.status).toBe(200);
    expect(Array.isArray(ok.body.entries)).toBe(true);
  });
});

describe("sharing endpoints", () => {
  it("serves result share payload when visibility allows", async () => {
    const dareId = createResolvedDare({ matched: true, withProof: true });
    const request = supertest(app);
    const api = await request.get(`/api/share/result/${dareId}`);
    expect(api.status).toBe(200);
    expect(api.headers["cache-control"]).toBe("public, max-age=60, stale-while-revalidate=600");
    expect(api.body.type).toBe("result");
    const html = await request.get(`/s/r/${dareId}`);
    expect(html.status).toBe(200);
    expect(html.text).toContain("__SHARE_DATA__");
  });

  it("returns 404 for private dare", async () => {
    const dareId = createResolvedDare({ visibility: "private" });
    const request = supertest(app);
    const api = await request.get(`/api/share/result/${dareId}`);
    expect(api.status).toBe(404);
    const html = await request.get(`/s/r/${dareId}`);
    expect(html.status).toBe(404);
  });

  it("serves proof share when approved", async () => {
    const dareId = createResolvedDare({ matched: true, withProof: true });
    const proofRow = db.prepare("SELECT id FROM proofs WHERE dare_id = ?").get(dareId);
    const request = supertest(app);
    const api = await request.get(`/api/share/proof/${proofRow.id}`);
    expect(api.status).toBe(200);
    expect(api.body.type).toBe("proof");
    const html = await request.get(`/s/p/${proofRow.id}`);
    expect(html.status).toBe(200);
  });
});
