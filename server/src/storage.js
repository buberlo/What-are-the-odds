import { mkdir, stat as fsStat, rename as fsRename, rm as fsRm } from "fs/promises";
import { createReadStream, createWriteStream, existsSync } from "fs";
import { dirname, resolve } from "path";
import crypto from "crypto";
import { pipeline } from "stream/promises";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  CopyObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  DISK_ROOT,
  PUBLIC_ASSET_BASE,
  S3_ACCESS_KEY,
  S3_BUCKET,
  S3_ENDPOINT,
  S3_REGION,
  S3_SECRET_KEY,
  STORAGE_DRIVER,
} from "./config.js";

const ensureWithinRoot = (root, key) => {
  const abs = resolve(root, key);
  if (!abs.startsWith(resolve(root))) {
    throw new Error("invalid storage key");
  }
  return abs;
};

const mimeFromExtension = (key) => {
  if (key.endsWith(".jpg") || key.endsWith(".jpeg")) return "image/jpeg";
  if (key.endsWith(".png")) return "image/png";
  if (key.endsWith(".webp")) return "image/webp";
  if (key.endsWith(".heic")) return "image/heic";
  if (key.endsWith(".heif")) return "image/heif";
  if (key.endsWith(".avif")) return "image/avif";
  if (key.endsWith(".gif")) return "image/gif";
  if (key.endsWith(".mp4")) return "video/mp4";
  if (key.endsWith(".webm")) return "video/webm";
  if (key.endsWith(".mov")) return "video/quicktime";
  return "application/octet-stream";
};

class DiskStorage {
  constructor(root) {
    this.root = root;
    this.directUploads = false;
    if (!existsSync(root)) {
      mkdir(root, { recursive: true }).catch(() => {});
    }
  }

  async statObject(key) {
    const path = ensureWithinRoot(this.root, key);
    try {
      const info = await fsStat(path);
      return { exists: true, size: info.size, contentType: mimeFromExtension(key), updatedAt: info.mtimeMs };
    } catch (err) {
      if (err.code === "ENOENT") return { exists: false };
      throw err;
    }
  }

  async writeObject(key, buffer, contentType) {
    const path = ensureWithinRoot(this.root, key);
    await mkdir(dirname(path), { recursive: true });
    await new Promise((resolvePromise, rejectPromise) => {
      const out = createWriteStream(path);
      out.on("error", rejectPromise);
      out.on("finish", resolvePromise);
      out.end(buffer);
    });
    if (contentType && !key.endsWith(contentType)) {
      // noop, retained for interface parity
    }
  }

  async writeStream(key, stream) {
    const path = ensureWithinRoot(this.root, key);
    await mkdir(dirname(path), { recursive: true });
    const out = createWriteStream(path);
    await pipeline(stream, out);
  }

  async readStream(key) {
    const path = ensureWithinRoot(this.root, key);
    return createReadStream(path);
  }

  async moveObject(oldKey, newKey) {
    const from = ensureWithinRoot(this.root, oldKey);
    const to = ensureWithinRoot(this.root, newKey);
    await mkdir(dirname(to), { recursive: true });
    await fsRename(from, to);
  }

  async deleteObject(key) {
    try {
      const path = ensureWithinRoot(this.root, key);
      await fsRm(path, { force: true });
    } catch (err) {
      if (err.code === "ENOENT") return;
      throw err;
    }
  }

  getPublicUrl(key) {
    if (PUBLIC_ASSET_BASE) return `${PUBLIC_ASSET_BASE.replace(/\/$/, "")}/${key}`;
    return null;
  }
}

class S3Storage {
  constructor() {
    if (!S3_BUCKET) throw new Error("S3_BUCKET required for s3 storage driver");
    this.client = new S3Client({
      region: S3_REGION,
      endpoint: S3_ENDPOINT || undefined,
      forcePathStyle: Boolean(S3_ENDPOINT),
      credentials:
        S3_ACCESS_KEY && S3_SECRET_KEY
          ? { accessKeyId: S3_ACCESS_KEY, secretAccessKey: S3_SECRET_KEY }
          : undefined,
    });
    this.directUploads = true;
  }

  async statObject(key) {
    try {
      const command = new HeadObjectCommand({ Bucket: S3_BUCKET, Key: key });
      const response = await this.client.send(command);
      return {
        exists: true,
        size: Number(response.ContentLength ?? 0),
        contentType: response.ContentType || mimeFromExtension(key),
        updatedAt: response.LastModified ? response.LastModified.getTime() : Date.now(),
      };
    } catch (err) {
      if (err.name === "NotFound" || err.$metadata?.httpStatusCode === 404) {
        return { exists: false };
      }
      throw err;
    }
  }

  async getUploadTarget(key, contentType, expiresInSeconds = 600) {
    const command = new PutObjectCommand({ Bucket: S3_BUCKET, Key: key, ContentType: contentType });
    const url = await getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
    return { url, headers: { "Content-Type": contentType }, method: "PUT" };
  }

  async readStream(key) {
    const command = new GetObjectCommand({ Bucket: S3_BUCKET, Key: key });
    const response = await this.client.send(command);
    return response.Body; // stream
  }

  async writeObject(key, buffer, contentType) {
    const command = new PutObjectCommand({ Bucket: S3_BUCKET, Key: key, Body: buffer, ContentType: contentType });
    await this.client.send(command);
  }

  async deleteObject(key) {
    const command = new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: key });
    await this.client.send(command);
  }

  async moveObject(oldKey, newKey, contentType) {
    const command = new CopyObjectCommand({
      Bucket: S3_BUCKET,
      CopySource: `${S3_BUCKET}/${oldKey}`,
      Key: newKey,
      ContentType: contentType,
      MetadataDirective: "REPLACE",
    });
    await this.client.send(command);
    await this.deleteObject(oldKey);
  }

  getPublicUrl(key) {
    if (PUBLIC_ASSET_BASE) return `${PUBLIC_ASSET_BASE.replace(/\/$/, "")}/${key}`;
    return null;
  }
}

let driver;
if (STORAGE_DRIVER === "s3") {
  driver = new S3Storage();
} else {
  driver = new DiskStorage(DISK_ROOT);
}

export default driver;
export const STORAGE_IS_DIRECT = driver.directUploads;

export const hashStream = async (stream) => {
  const hash = crypto.createHash("sha256");
  await pipeline(stream, hash);
  return hash.digest();
};

export const ensureUploadDir = async (key) => {
  if (STORAGE_DRIVER === "s3") return;
  const path = ensureWithinRoot(DISK_ROOT, key);
  await mkdir(dirname(path), { recursive: true });
};

export const openReadStream = async (key) => {
  if (STORAGE_DRIVER === "s3") {
    return driver.readStream(key);
  }
  return driver.readStream ? driver.readStream(key) : createReadStream(ensureWithinRoot(DISK_ROOT, key));
};

export const writeBuffer = async (key, buffer, contentType) => {
  await driver.writeObject(key, buffer, contentType);
};

export const deleteKey = async (key) => {
  await driver.deleteObject(key);
};

export const moveObject = async (oldKey, newKey, contentType) => {
  if (driver.moveObject) {
    await driver.moveObject(oldKey, newKey, contentType);
  } else {
    const stream = await driver.readStream(oldKey);
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    await driver.writeObject(newKey, Buffer.concat(chunks), contentType);
    await driver.deleteObject(oldKey);
  }
};

export const statObject = async (key) => driver.statObject(key);

export const resolvePublicUrl = (key) => driver.getPublicUrl(key);
