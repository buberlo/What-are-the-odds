import sharp from "sharp";
import crypto from "crypto";
import db from "../db.js";
import { runMigrations } from "../migrations.js";
import {
  PROOF_WATERMARK,
} from "../config.js";
import {
  writeBuffer,
  openReadStream,
  statObject,
} from "../storage.js";

const pendingStmt = db.prepare(
  `SELECT * FROM proofs
   WHERE moderation = 'pending'
     AND NOT EXISTS (
       SELECT 1 FROM proof_assets a WHERE a.proof_id = proofs.id AND a.kind = 'jpeg'
     )`
);

const assetsStmt = db.prepare("SELECT * FROM proof_assets WHERE proof_id = ?");
const insertAsset = db.prepare(
  `INSERT INTO proof_assets (id, proof_id, kind, storage_key, mime, size_bytes, sha256)
   VALUES (?, ?, ?, ?, ?, ?, ?)`
);
const updateProof = db.prepare(
  `UPDATE proofs SET width = ?, height = ?, moderation = 'approved', updated_at = datetime('now') WHERE id = ?`
);
const insertEvent = db.prepare(
  `INSERT INTO events (id, dare_id, type, payload, at) VALUES (?, ?, ?, ?, ?)`
);

const dareStmt = db.prepare(
  `SELECT d.*, i.slug AS invite_slug FROM dares d
   LEFT JOIN dare_invites i ON i.dare_id = d.id
   WHERE d.id = ?`
);

const bufferFromStream = async (stream) => {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
};

const hashBuffer = (buffer) => crypto.createHash("sha256").update(buffer).digest();

const targetKeys = (storageKey) => {
  const parts = storageKey.split("/");
  const originalIndex = parts.lastIndexOf("original");
  const baseParts = originalIndex === -1 ? parts.slice(0, -1) : parts.slice(0, originalIndex);
  const filename = parts[parts.length - 1];
  const stem = filename.split(".")[0];
  const base = `${baseParts.join("/")}/public/img/${stem}`;
  return {
    jpeg: `${base}-1920.jpg`,
    thumb1280: `${base}-1280.jpg`,
    thumb640: `${base}-640.jpg`,
    thumb320: `${base}-320.jpg`,
    poster: `${base}-poster.jpg`,
  };
};

const watermarkOverlay = (width, height, slug, createdAt) => {
  const ts = new Date(createdAt).toISOString();
  const label = `${slug || "unknown"} · ${ts}`;
  const fontSize = Math.max(Math.floor(Math.min(width, height) * 0.035), 18);
  const padding = Math.max(Math.floor(fontSize * 0.8), 16);
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="rgba(0,0,0,0.5)" />
      </filter>
    </defs>
    <rect x="${width - (label.length * fontSize * 0.6) - padding * 2}" y="${height - fontSize - padding}" rx="${Math.floor(padding / 2)}" ry="${Math.floor(padding / 2)}" width="${label.length * fontSize * 0.6 + padding * 2}" height="${fontSize + padding}" fill="rgba(15,23,42,0.55)"/>
    <text x="${width - padding}" y="${height - Math.floor(padding / 2)}" font-size="${fontSize}" font-family="'Inter', 'Segoe UI', sans-serif" text-anchor="end" fill="#f8fafc" filter="url(#shadow)">${label}</text>
  </svg>`;
  return Buffer.from(svg);
};

const processProof = async (proof) => {
  const originalAsset = assetsStmt.all(proof.id).find((asset) => asset.kind === "original");
  if (!originalAsset) return;
  const stat = await statObject(originalAsset.storage_key);
  if (!stat.exists) return;
  const stream = await openReadStream(originalAsset.storage_key);
  const buffer = await bufferFromStream(stream);
  const image = sharp(buffer, { limitInputPixels: false });
  const base = await image
    .rotate()
    .resize({ width: 1920, height: 1920, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
  const metaBase = await sharp(base).metadata();
  let compositeSource = base;
  if (proof.watermark && PROOF_WATERMARK) {
    const dare = dareStmt.get(proof.dare_id);
    const overlay = watermarkOverlay(metaBase.width || 1920, metaBase.height || 1080, dare?.invite_slug, proof.created_at);
    compositeSource = await sharp(base)
      .composite([{ input: overlay, gravity: "southeast" }])
      .jpeg({ quality: 85 })
      .toBuffer();
  }
  const meta = await sharp(compositeSource).metadata();
  const makeSized = async (width) =>
    await sharp(compositeSource)
      .resize({ width, height: width, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
  const posterBuffer = await makeSized(640);
  const buffers = new Map([
    ["jpeg", compositeSource],
    ["thumb1280", await makeSized(1280)],
    ["thumb640", posterBuffer],
    ["thumb320", await makeSized(320)],
    ["poster", posterBuffer],
  ]);
  const keys = targetKeys(proof.storage_key);
  const writes = [];
  for (const [kind, blob] of buffers.entries()) {
    const key = keys[kind];
    await writeBuffer(key, blob, "image/jpeg");
    writes.push({ kind, key, blob });
  }
  db.exec("BEGIN");
  try {
    for (const { kind, key, blob } of writes) {
      insertAsset.run(crypto.randomUUID(), proof.id, kind, key, "image/jpeg", blob.length, hashBuffer(blob));
    }
    updateProof.run(meta.width || null, meta.height || null, proof.id);
    insertEvent.run(crypto.randomUUID(), proof.dare_id, "proof.processed", JSON.stringify({ id: proof.id }), new Date().toISOString());
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    console.error("proof processing failed", proof.id, err);
    throw err;
  }
};

export const processPendingProofs = async () => {
  runMigrations(db);
  const queue = pendingStmt.all();
  for (const proof of queue) {
    try {
      await processProof(proof);
    } catch (err) {
      // continue
    }
  }
};

if (import.meta.url === `file://${process.argv[1]}`) {
  processPendingProofs()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
