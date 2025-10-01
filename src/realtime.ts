import { FEATURE_REALTIME_WS } from "./flags";

type RealtimeEvent = {
  type: string;
  payload: unknown;
  dareId?: string;
};

type ConnectOptions = {
  dareId: string;
  onEvent: (event: RealtimeEvent) => void;
};

const supportsWebSocket = () => typeof window !== "undefined" && "WebSocket" in window;

const buildWsUrl = () => {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${window.location.host}/ws`;
};

const handleSse = (dareId: string, onEvent: (event: RealtimeEvent) => void) => {
  const source = new EventSource(`/api/dares/${encodeURIComponent(dareId)}/stream`);
  const listener = (event: MessageEvent<string>) => {
    try {
      const payload = event.data ? JSON.parse(event.data) : {};
      onEvent({ type: event.type, payload, dareId });
    } catch {
      onEvent({ type: event.type, payload: {}, dareId });
    }
  };
  const events = [
    "dare.accepted",
    "dare.resolved",
    "dare.expired",
    "proof.uploaded",
    "proof.processed",
    "proof.published",
    "proof.redacted",
    "proof.taken_down",
    "proof.moderation_pending",
    "proof.approved",
    "proof.rejected",
    "proof.moderation_approved",
    "proof.moderation_rejected",
  ];
  for (const type of events) source.addEventListener(type, listener as EventListener);
  source.addEventListener("heartbeat", () => {});
  return () => {
    for (const type of events) source.removeEventListener(type, listener as EventListener);
    source.close();
  };
};

export const connectRealtime = ({ dareId, onEvent }: ConnectOptions) => {
  if (!FEATURE_REALTIME_WS || !supportsWebSocket()) {
    return handleSse(dareId, onEvent);
  }
  let closed = false;
  let fallback = false;
  let ws: WebSocket | null = null;
  const cleanup = () => {
    closed = true;
    if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) {
      ws.close(1000, "client_close");
    }
    ws = null;
  };
  try {
    ws = new WebSocket(buildWsUrl());
  } catch {
    return handleSse(dareId, onEvent);
  }
  const openHandler = () => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: "sub", dareId }));
  };
  const messageHandler = (event: MessageEvent<string>) => {
    if (!event.data) return;
    try {
      const payload = JSON.parse(event.data);
      if (!payload || typeof payload !== "object") return;
      if (payload.type === "subscribed") return;
      if (payload.type === "error") {
        if (payload.error === "unauthorized") {
          fallback = true;
          cleanup();
          sseCleanup = handleSse(dareId, onEvent);
        }
        return;
      }
      onEvent({ type: payload.type, payload: payload.payload, dareId: payload.dareId });
    } catch {}
  };
  const closeHandler = () => {
    ws?.removeEventListener("open", openHandler);
    ws?.removeEventListener("message", messageHandler);
    ws?.removeEventListener("close", closeHandler);
    ws?.removeEventListener("error", errorHandler);
    if (!closed && !fallback) {
      sseCleanup = handleSse(dareId, onEvent);
    }
  };
  const errorHandler = () => {
    if (!closed) {
      fallback = true;
      cleanup();
      sseCleanup = handleSse(dareId, onEvent);
    }
  };
  ws.addEventListener("open", openHandler);
  ws.addEventListener("message", messageHandler);
  ws.addEventListener("close", closeHandler);
  ws.addEventListener("error", errorHandler);
  let sseCleanup: (() => void) | null = null;
  return () => {
    cleanup();
    if (sseCleanup) {
      sseCleanup();
      sseCleanup = null;
    }
  };
};
