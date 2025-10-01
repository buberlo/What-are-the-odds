import { MODERATION_PROVIDER, MODERATION_BLOCK_ON_FAIL } from "./config.js";

const parseDenylist = () => {
  const raw = process.env.PROOF_MODERATION_HASH_DENYLIST || "";
  return new Set(
    raw
      .split(/[,\s]+/)
      .map((entry) => entry.trim().toLowerCase())
      .filter((entry) => entry.length === 64 && !/[^a-f0-9]/.test(entry))
  );
};

const denylist = parseDenylist();

const stubModeration = ({ sha256Hex, mime, width, height, durationMs, storageKey }) => {
  if (sha256Hex && denylist.has(sha256Hex)) return { decision: "rejected", reason: "hash_denylist" };
  if (width && height && (width < 48 || height < 48)) return { decision: "rejected", reason: "too_small" };
  if (durationMs && durationMs > 9000) return { decision: "pending", reason: "long_duration" };
  const lowered = (storageKey || "").toLowerCase();
  if (lowered.includes("nsfw") || lowered.includes("ban")) return { decision: "pending", reason: "name_flag" };
  if (!mime) return { decision: MODERATION_BLOCK_ON_FAIL ? "pending" : "approved", reason: "missing_mime" };
  if (!/^image\//.test(mime) && !/^video\//.test(mime)) {
    return { decision: MODERATION_BLOCK_ON_FAIL ? "pending" : "approved", reason: "unknown_mime" };
  }
  return { decision: "approved" };
};

export const evaluateModeration = (payload) => {
  if (MODERATION_PROVIDER === "stub") {
    return stubModeration(payload);
  }
  return { decision: "approved" };
};
