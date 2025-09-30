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
