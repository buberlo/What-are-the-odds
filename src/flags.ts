const parseFlag = (value: unknown, defaultValue: boolean) => {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.toLowerCase();
    if (["1", "true", "on"].includes(normalized)) return true;
    if (["0", "false", "off"].includes(normalized)) return false;
  }
  return defaultValue;
};

export const FEATURE_LINK_DARES = parseFlag(
  import.meta.env.VITE_FEATURE_LINK_DARES,
  true,
);
export const FEATURE_PROOFS = parseFlag(import.meta.env.VITE_FEATURE_PROOFS, false);
export const FEATURE_LEADERBOARDS = parseFlag(
  import.meta.env.VITE_FEATURE_LEADERBOARDS,
  false,
);
export const FEATURE_SHARING = parseFlag(import.meta.env.VITE_FEATURE_SHARING, false);
export const FEATURE_VIDEO_PROOFS = parseFlag(import.meta.env.VITE_FEATURE_VIDEO_PROOFS, false);
export const FEATURE_PROOF_MODERATION = parseFlag(import.meta.env.VITE_FEATURE_PROOF_MODERATION, false);
export const FEATURE_PROOF_BLUR = parseFlag(import.meta.env.VITE_FEATURE_PROOF_BLUR, false);
export const FEATURE_REALTIME_WS = parseFlag(import.meta.env.VITE_FEATURE_REALTIME_WS, false);
export const FEATURE_SECURITY_HARDENING = parseFlag(import.meta.env.VITE_FEATURE_SECURITY_HARDENING, false);
export const FEATURE_PERF_TELEM = parseFlag(import.meta.env.VITE_FEATURE_PERF_TELEM, false);
