/// <reference types="vite/client" />

import type { SharePayload } from "./types";

declare global {
  interface Window {
    __SHARE_DATA__?: SharePayload;
  }
}

export {};
