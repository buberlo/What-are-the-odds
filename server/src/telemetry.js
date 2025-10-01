import {
  FEATURE_PERF_TELEM,
  TELEMETRY_ENDPOINT,
  TELEMETRY_SAMPLE_RATE,
} from "./config.js";

const shouldSend = () =>
  FEATURE_PERF_TELEM && TELEMETRY_ENDPOINT && Math.random() < (Number.isFinite(TELEMETRY_SAMPLE_RATE) ? TELEMETRY_SAMPLE_RATE : 0);

export const emitTelemetry = (kind, payload) => {
  if (!shouldSend()) return;
  fetch(TELEMETRY_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, ...payload }),
    keepalive: true,
  }).catch(() => {});
};
