import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import supertest from "supertest";
import os from "os";
import path from "path";
import { promises as fs } from "fs";
import crypto from "crypto";
import sharp from "sharp";

let app;
let db;
let serverInstance;
let tempRoot;
let processPendingProofs;
let videoModule;

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
  process.env.FEATURE_VIDEO_PROOFS = "true";
  process.env.FEATURE_PROOF_MODERATION = "true";
  process.env.FEATURE_PROOF_BLUR = "true";
  process.env.FEATURE_LEADERBOARDS = "false";
  process.env.FEATURE_SHARING = "true";
  process.env.STORAGE_DRIVER = "disk";
  process.env.DISK_ROOT = tempRoot;
  process.env.DATABASE_URL = ":memory:";
  process.env.BASE_URL = "http://localhost:3000";
  process.env.SHARE_BASE_URL = "http://localhost:3000";
  process.env.ADMIN_API_TOKEN = "admin-secret";
  ({ default: app } = await import("../src/app.js"));
  ({ default: db } = await import("../src/db.js"));
  ({ processPendingProofs } = await import("../src/workers/proofProcessor.js"));
  videoModule = await import("../src/media/video.js");
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
        "X-CSRF-Token": csrfToken,
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

describe("video proof lifecycle", () => {
  it("processes short video and enforces moderation gate", async () => {
    const prevVideoFlag = process.env.FEATURE_VIDEO_PROOFS;
    const prevModerationFlag = process.env.FEATURE_PROOF_MODERATION;
    process.env.FEATURE_VIDEO_PROOFS = "true";
    process.env.FEATURE_PROOF_MODERATION = "true";
    const request = supertest(app);
    const dare = await createDare(request);
    const token = new URL(dare.inviteUrl).searchParams.get("t");
    await resolveDare(request, dare.dareId, token);

    const videoBuffer = Buffer.from("fake-video-data");
    const hash = crypto.createHash("sha256").update(videoBuffer).digest("hex");

    const probeSpy = vi.spyOn(videoModule, "probeVideo").mockResolvedValue({
      durationMs: 8000,
      width: 640,
      height: 360,
      rotation: 0,
    });
    const buildSpy = vi.spyOn(videoModule, "buildVideoDerivatives").mockImplementation(async ({ workspace }) => {
      const posterBuffer = await sharp({
        create: { width: 640, height: 360, channels: 3, background: { r: 45, g: 115, b: 210 } },
      })
        .jpeg()
        .toBuffer();
      const mp4Path = workspace.pathFor("proof.mp4");
      const webmPath = workspace.pathFor("proof.webm");
      await fs.writeFile(mp4Path, Buffer.from("mp4-output"));
      await fs.writeFile(webmPath, Buffer.from("webm-output"));
      return {
        mp4Path,
        webmPath,
        posterBuffer,
        gifBuffer: null,
        width: 640,
        height: 360,
      };
    });

    const presign = await request
      .post("/api/proofs/presign")
      .set({ "Cookie": baseCookies, "X-CSRF-Token": csrfToken })
      .send({
        dareId: dare.dareId,
        type: "video",
        mime: "video/mp4",
        sizeBytes: videoBuffer.length,
        sha256: hash,
      });
    expect(presign.status).toBe(200);

    const uploadUrl = new URL(presign.body.url, "http://localhost");
    const upload = await request
      .put(uploadUrl.pathname)
      .set({
        "Cookie": baseCookies,
        "Content-Type": "video/mp4",
        "Content-Length": String(videoBuffer.length),
        "X-CSRF-Token": csrfToken,
      })
      .send(videoBuffer);
    expect(upload.status).toBe(204);

    const finalize = await request
      .post(`/api/dares/${dare.dareId}/proofs`)
      .set({ "Cookie": baseCookies, "X-CSRF-Token": csrfToken })
      .send({ key: presign.body.key, sha256: hash, type: "video" });
    expect(finalize.status).toBe(201);

    const proofId = finalize.body.proofId;

    const prePublish = await request
      .post(`/api/proofs/${proofId}/publish`)
      .set({ "Cookie": baseCookies, "X-CSRF-Token": csrfToken })
      .send({ visibility: "public" });
    expect(prePublish.status).toBe(409);

    await processPendingProofs();

    const proof = db.prepare("SELECT * FROM proofs WHERE id = ?").get(proofId);
    expect(proof.type).toBe("video");
    expect(proof.duration_ms).toBe(8000);

    const assetKinds = db
      .prepare("SELECT kind FROM proof_assets WHERE proof_id = ? ORDER BY kind")
      .all(proofId)
      .map((row) => row.kind)
      .sort();
    expect(assetKinds).toEqual(["mp4", "original", "poster", "webm"].sort());

    const publish = await request
      .post(`/api/proofs/${proofId}/publish`)
      .set({ "Cookie": baseCookies, "X-CSRF-Token": csrfToken })
      .send({ visibility: "public" });
    expect(publish.status).toBe(200);

    probeSpy.mockRestore();
    buildSpy.mockRestore();
    process.env.FEATURE_VIDEO_PROOFS = prevVideoFlag;
    process.env.FEATURE_PROOF_MODERATION = prevModerationFlag;
  }, 20000);
});
