const truthy = (value: unknown) =>
  typeof value === "string" && ["1", "true", "on"].includes(value.toLowerCase());

export const FEATURE_LINK_DARES = truthy(import.meta.env.VITE_FEATURE_LINK_DARES);
export const FEATURE_PROOFS = truthy(import.meta.env.VITE_FEATURE_PROOFS);
export const FEATURE_LEADERBOARDS = truthy(import.meta.env.VITE_FEATURE_LEADERBOARDS);
export const FEATURE_SHARING = truthy(import.meta.env.VITE_FEATURE_SHARING);
