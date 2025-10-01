const parseBool = (value) => value === "1" || value === "true" || value === "on";
const parseIntEnv = (value, fallback) => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const FEATURE_LINK_DARES = parseBool(process.env.FEATURE_LINK_DARES || "");
export const FEATURE_PROOFS = parseBool(process.env.FEATURE_PROOFS || "");
export const FEATURE_LEADERBOARDS = parseBool(process.env.FEATURE_LEADERBOARDS || "");
export const FEATURE_SHARING = parseBool(process.env.FEATURE_SHARING || "");
export const FEATURE_VIDEO_PROOFS = parseBool(process.env.FEATURE_VIDEO_PROOFS || "");
export const FEATURE_PROOF_MODERATION = parseBool(process.env.FEATURE_PROOF_MODERATION || "");
export const FEATURE_PROOF_BLUR = parseBool(process.env.FEATURE_PROOF_BLUR || "");
export const FEATURE_REALTIME_WS = parseBool(process.env.FEATURE_REALTIME_WS || "");
export const FEATURE_SECURITY_HARDENING = parseBool(process.env.FEATURE_SECURITY_HARDENING || "");
export const FEATURE_PERF_TELEM = parseBool(process.env.FEATURE_PERF_TELEM || "");

export const INVITE_JWT_SECRET = process.env.INVITE_JWT_SECRET || "dev-secret";
export const INVITE_JWT_SECRET_NEXT = process.env.INVITE_JWT_SECRET_NEXT || "";
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
export const PROOF_MAX_VIDEO_BYTES = parseIntEnv(process.env.PROOF_MAX_VIDEO_BYTES, 25 * 1024 * 1024);
export const PROOF_MAX_DURATION_MS = parseIntEnv(process.env.PROOF_MAX_DURATION_MS, 10000);
export const PROOF_WATERMARK = parseBool(process.env.PROOF_WATERMARK || "1");
export const PROOF_LIFECYCLE_ORIGINAL_DAYS = parseIntEnv(process.env.PROOF_LIFECYCLE_ORIGINAL_DAYS, 90);
export const PROOF_LIFECYCLE_PUBLIC_DAYS = parseIntEnv(process.env.PROOF_LIFECYCLE_PUBLIC_DAYS, 365);
export const TOKEN_ROTATION_MIN = parseIntEnv(process.env.TOKEN_ROTATION_MIN, 30);

export const FFMPEG_PATH = process.env.FFMPEG_PATH || "ffmpeg";
export const FFPROBE_PATH = process.env.FFPROBE_PATH || "ffprobe";

export const MODERATION_PROVIDER = process.env.MODERATION_PROVIDER || "stub";
export const MODERATION_BLOCK_ON_FAIL = parseBool(process.env.MODERATION_BLOCK_ON_FAIL || "1");

export const LEADERBOARD_TOP_N = parseIntEnv(process.env.LEADERBOARD_TOP_N, 100);
export const LEADERBOARD_RETENTION_DAILY = parseIntEnv(process.env.LEADERBOARD_RETENTION_DAILY, 60);
export const LEADERBOARD_RETENTION_WEEKLY = parseIntEnv(process.env.LEADERBOARD_RETENTION_WEEKLY, 26);
export const LEADERBOARD_VERSION = parseIntEnv(process.env.LEADERBOARD_VERSION, 1);

export const SHARE_BASE_URL = process.env.SHARE_BASE_URL || BASE_URL;
export const CDN_PUBLIC_BASE = process.env.CDN_PUBLIC_BASE || "";

export const REDIS_URL = process.env.REDIS_URL || "";
const parseOrigins = (value) =>
  (value || "")
    .split(/[,\s]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
export const REALTIME_ALLOWED_ORIGINS = parseOrigins(process.env.REALTIME_ALLOWED_ORIGINS);
export const REALTIME_PING_MS = parseIntEnv(process.env.REALTIME_PING_MS, 15000);
export const REALTIME_IDLE_TIMEOUT_MS = parseIntEnv(process.env.REALTIME_IDLE_TIMEOUT_MS, 120000);
export const WS_MAX_CONN_PER_IP = parseIntEnv(process.env.WS_MAX_CONN_PER_IP, 50);
export const WS_MSG_RATE_PER_MIN = parseIntEnv(process.env.WS_MSG_RATE_PER_MIN, 240);
export const WS_BURST = parseIntEnv(process.env.WS_BURST, 40);
export const TELEMETRY_ENDPOINT = process.env.TELEMETRY_ENDPOINT || "";
export const TELEMETRY_SAMPLE_RATE = Number.parseFloat(process.env.TELEMETRY_SAMPLE_RATE ?? "0.1");
