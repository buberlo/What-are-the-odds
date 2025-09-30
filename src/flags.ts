export const FEATURE_LINK_DARES =
  typeof import.meta.env.VITE_FEATURE_LINK_DARES === "string"
    ? ["1", "true", "on"].includes(import.meta.env.VITE_FEATURE_LINK_DARES)
    : false;
