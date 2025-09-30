import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";
import os from "os";
import path from "path";
import { promises as fs } from "fs";
import crypto from "crypto";
import sharp from "sharp";
import { processPendingProofs } from "../src/workers/proofProcessor.js";

let app;
let db;
let serverInstance;
let tempRoot;

const csrfToken = "test-csrf";
const anonId = "anon-test";
const baseCookies = `csrf-token=${csrfToken}; anon-id=${anonId}`;

const resetDb = () => {
  db.exec(
    "DELETE FROM proof_assets; DELETE FROM proofs; DELETE FROM proof_upload_tokens; DELETE FROM acceptances; DELETE FROM dare_invites; DELETE FROM dares; DELETE FROM events; DELETE FROM invite_jti; DELETE FROM idempotency_keys;"
  );
};

const createSampleImage = async () =>
  await sharp({
    create: {
      width: 640,
      height: 480,
      channels: 3,
      background: { r: 240, g: 75, b: 35 },
    },
  })
    .png()
    .toBuffer();

const createDare = async (request) => {
  const expiry = new Date(Date.now() + 10 * 60000).toISOString();
  const response = await request
    .post("/api/dares")
    .set("Cookie", baseCookies)
    .set("X-CSRF-Token", csrfToken)
    .send({
      title: "Upload Proof Dare",
      description: "Test",
      category: "test",
      rangeN: 10,
      expiryTs: expiry,
      visibility: "private",
      committedNumber: 4,
    });
  expect(response.status).toBe(201);
  return response.body;
};

const resolveDare = async (request, dareId, inviteToken) => {
  await request
    .post(`/api/dares/${dareId}/accept`)
    .set({
      "Cookie": baseCookies,
      "X-CSRF-Token": csrfToken,
      "Idempotency-Key": `accept-${dareId}`,
    })
    .send({ inviteToken });
  await request
    .post(`/api/dares/${dareId}/pick`)
    .set({
      "Cookie": baseCookies,
      "X-CSRF-Token": csrfToken,
      "Idempotency-Key": `pick-${dareId}`,
    })
    .send({ role: "recipient", value: 4 });
};

beforeAll(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "proofs-"));
  process.env.FEATURE_LINK_DARES = "true";
  process.env.FEATURE_PROOFS = "true";
  process.env.STORAGE_DRIVER = "disk";
  process.env.DISK_ROOT = tempRoot;
  process.env.DATABASE_URL = ":memory:";
  ({ default: app } = await import("../src/app.js"));
  ({ default: db } = await import("../src/db.js"));
  serverInstance = app.listen(0);
});

afterAll(async () => {
  await serverInstance?.close();
  if (tempRoot) await fs.rm(tempRoot, { recursive: true, force: true });
});

beforeEach(async () => {
  resetDb();
  await fs.rm(tempRoot, { recursive: true, force: true });
  await fs.mkdir(tempRoot, { recursive: true });
});

describe("healthz", () => {
  it("returns ok", async () => {
    const request = supertest(app);
    const response = await request.get("/healthz");
    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
  });
});

describe("proof presign validation", () => {
  it("rejects unsupported mime", async () => {
    const request = supertest(app);
    const dare = await createDare(request);
    const token = new URL(dare.inviteUrl).searchParams.get("t");
    await resolveDare(request, dare.dareId, token);
    const response = await request
      .post("/api/proofs/presign")
      .set({ "Cookie": baseCookies, "X-CSRF-Token": csrfToken })
      .send({
        dareId: dare.dareId,
        type: "photo",
        mime: "image/gif",
        sizeBytes: 1024,
        sha256: "a".repeat(64),
      });
    expect(response.status).toBe(400);
  });
});

describe("proof lifecycle", () => {
  it("runs presign to publish end-to-end", async () => {
    const request = supertest(app);
    const dare = await createDare(request);
    const token = new URL(dare.inviteUrl).searchParams.get("t");
    await resolveDare(request, dare.dareId, token);

    const image = await createSampleImage();
    const hash = crypto.createHash("sha256").update(image).digest("hex");

    const presign = await request
      .post("/api/proofs/presign")
      .set({ "Cookie": baseCookies, "X-CSRF-Token": csrfToken })
      .send({
        dareId: dare.dareId,
        type: "photo",
        mime: "image/png",
        sizeBytes: image.length,
        sha256: hash,
      });
    expect(presign.status).toBe(200);
    expect(presign.body.key).toMatch(/^proofs\//);
    expect(presign.body.url).toContain("/api/proofs/upload/");

    const uploadUrl = new URL(presign.body.url, "http://localhost");
    const uploadPath = uploadUrl.pathname;
    const upload = await request
      .put(uploadPath)
      .set({
        "Cookie": baseCookies,
        "Content-Type": "image/png",
        "Content-Length": String(image.length),
      })
      .send(image);
    expect(upload.status).toBe(204);

    const finalize = await request
      .post(`/api/dares/${dare.dareId}/proofs`)
      .set({ "Cookie": baseCookies, "X-CSRF-Token": csrfToken })
      .send({ key: presign.body.key, sha256: hash, type: "photo" });
    expect(finalize.status).toBe(201);

    await processPendingProofs();

    const proofId = finalize.body.proofId;
    const proof = db.prepare("SELECT * FROM proofs WHERE id = ?").get(proofId);
    expect(proof).toBeTruthy();
    expect(proof.moderation).toBe("approved");

    const assetRows = db
      .prepare("SELECT kind FROM proof_assets WHERE proof_id = ? ORDER BY kind")
      .all(proofId);
    const kinds = assetRows.map((row) => row.kind).sort();
    expect(kinds).toEqual(["jpeg", "original", "poster", "thumb1280", "thumb320", "thumb640"].sort());

    const getProof = await request
      .get(`/api/proofs/${proofId}`)
      .set("Cookie", baseCookies);
    expect(getProof.status).toBe(200);
    expect(getProof.body.assets.poster.url).toContain("/api/proofs/assets/");

    const publish = await request
      .post(`/api/proofs/${proofId}/publish`)
      .set({ "Cookie": baseCookies, "X-CSRF-Token": csrfToken })
      .send({ visibility: "public", caption: "Victory", hashtags: ["#Custom"] });
    expect(publish.status).toBe(200);
    expect(publish.body.caption).toBe("Victory");
    expect(publish.body.hashtags).toContain("#Custom");

    const listPublic = await request
      .get("/api/proofs")
      .set("Cookie", baseCookies)
      .query({ visibility: "public" });
    expect(listPublic.status).toBe(200);
    expect(Array.isArray(listPublic.body.proofs)).toBe(true);
    expect(listPublic.body.proofs[0]?.id).toBe(proofId);

    const html = await request.get(`/p/${publish.body.slug}`);
    expect(html.status).toBe(200);
    expect(html.headers["content-type"]).toContain("text/html");
    expect(html.text).toContain("Victory");
    expect(html.text).toContain("og:image");
    expect(html.text).toContain("Completed:");

    const takedown = await request
      .delete(`/api/proofs/${proofId}`)
      .set({ "Cookie": baseCookies, "X-CSRF-Token": csrfToken });
    expect(takedown.status).toBe(204);

    const afterDelete = await request.get(`/api/proofs/${proofId}`).set("Cookie", baseCookies);
    expect(afterDelete.status).toBe(404);
  }, 20000);
});
