const parseBool = (value) => value === "1" || value === "true" || value === "on";
const parseIntEnv = (value, fallback) => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const FEATURE_LINK_DARES = parseBool(process.env.FEATURE_LINK_DARES || "");
export const FEATURE_PROOFS = parseBool(process.env.FEATURE_PROOFS || "");
export const FEATURE_LEADERBOARDS = parseBool(process.env.FEATURE_LEADERBOARDS || "");
export const FEATURE_SHARING = parseBool(process.env.FEATURE_SHARING || "");

export const INVITE_JWT_SECRET = process.env.INVITE_JWT_SECRET || "dev-secret";
export const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
export const ADMIN_API_TOKEN = process.env.ADMIN_API_TOKEN || "";

export const STORAGE_DRIVER = (process.env.STORAGE_DRIVER || "disk").toLowerCase();
export const DISK_ROOT = process.env.DISK_ROOT || "./storage";
export const PUBLIC_ASSET_BASE = process.env.PUBLIC_ASSET_BASE || "";
export const S3_ENDPOINT = process.env.S3_ENDPOINT || "";
export const S3_REGION = process.env.S3_REGION || "us-east-1";
export const S3_BUCKET = process.env.S3_BUCKET || "";
export const S3_ACCESS_KEY = process.env.S3_ACCESS_KEY || "";
export const S3_SECRET_KEY = process.env.S3_SECRET_KEY || "";

export const PROOF_MAX_IMAGE_BYTES = parseIntEnv(process.env.PROOF_MAX_IMAGE_BYTES, 10 * 1024 * 1024);
export const PROOF_WATERMARK = parseBool(process.env.PROOF_WATERMARK || "1");

export const LEADERBOARD_TOP_N = parseIntEnv(process.env.LEADERBOARD_TOP_N, 100);
export const LEADERBOARD_RETENTION_DAILY = parseIntEnv(process.env.LEADERBOARD_RETENTION_DAILY, 60);
export const LEADERBOARD_RETENTION_WEEKLY = parseIntEnv(process.env.LEADERBOARD_RETENTION_WEEKLY, 26);
export const LEADERBOARD_VERSION = parseIntEnv(process.env.LEADERBOARD_VERSION, 1);

export const SHARE_BASE_URL = process.env.SHARE_BASE_URL || BASE_URL;
