# What are the odds?!

High-stakes party dares with commit–reveal fairness, live invite flows, and photo proof sharing. The repo contains both the Vite-powered web client and the Node-based API/worker service used in production.

## Feature overview

| Feature | Flag | Default | Notes |
| ------- | ---- | ------- | ----- |
| Link-driven dares (Phase 1) | `FEATURE_LINK_DARES` / `VITE_FEATURE_LINK_DARES` | off | Invite creation, JWT-secured landing page, commit–reveal resolution, SSE updates. |
| Proof pipeline (Phase 2) | `FEATURE_PROOFS` / `VITE_FEATURE_PROOFS` | off | Direct-to-storage uploads, sharp processing, thumbnails, publish controls, public proof pages. |
| Leaderboards & sharing (Phase 3) | `FEATURE_LEADERBOARDS` / `VITE_FEATURE_LEADERBOARDS`, `FEATURE_SHARING` / `VITE_FEATURE_SHARING` | off | Snapshot worker, leaderboard API/UI, shareable result/proof pages with OG meta. |
| Video proofs & moderation (Phase 4) | `FEATURE_VIDEO_PROOFS` / `VITE_FEATURE_VIDEO_PROOFS`, `FEATURE_PROOF_MODERATION` / `VITE_FEATURE_PROOF_MODERATION`, `FEATURE_PROOF_BLUR` / `VITE_FEATURE_PROOF_BLUR` | off | ≤10s video capture, mp4/webm transcoding, moderation queue, blur editor, lifecycle cleanup. |
| Realtime hardening (Phase 5) | `FEATURE_REALTIME_WS` / `VITE_FEATURE_REALTIME_WS`, `FEATURE_SECURITY_HARDENING` / `VITE_FEATURE_SECURITY_HARDENING`, `FEATURE_PERF_TELEM` / `VITE_FEATURE_PERF_TELEM` | off | WebSocket gateway with Redis fan-out, session token rotation, rate limiting, telemetry, CDN routing. |

Enable the matching client and server flags when developing a feature set.

## Getting started

### Prerequisites

- Node.js 22+
- npm 10+
- libvips (for sharp) when running the server locally on Linux/macOS
- Redis 7+ (for realtime pub/sub)
- ffmpeg + ffprobe (for video processing and poster extraction)

### Install dependencies

```bash
# Web client
npm install

# API / worker service
cd server
npm install
```

### Environment variables

A starter `.env.example` is provided:

```
VITE_FEATURE_LINK_DARES=0
VITE_FEATURE_PROOFS=0
VITE_FEATURE_LEADERBOARDS=0
VITE_FEATURE_SHARING=0
VITE_FEATURE_VIDEO_PROOFS=0
VITE_FEATURE_PROOF_MODERATION=0
VITE_FEATURE_PROOF_BLUR=0
FEATURE_LINK_DARES=0
FEATURE_PROOFS=0
FEATURE_LEADERBOARDS=0
FEATURE_SHARING=0
FEATURE_VIDEO_PROOFS=0
FEATURE_PROOF_MODERATION=0
FEATURE_PROOF_BLUR=0
BASE_URL=http://localhost:3000
INVITE_JWT_SECRET=dev-secret
ADMIN_API_TOKEN=
STORAGE_DRIVER=disk
DISK_ROOT=./storage
PUBLIC_ASSET_BASE=
PROOF_MAX_IMAGE_BYTES=10485760
PROOF_WATERMARK=1
PROOF_MAX_VIDEO_BYTES=26214400
PROOF_MAX_DURATION_MS=10000
PROOF_LIFECYCLE_ORIGINAL_DAYS=90
PROOF_LIFECYCLE_PUBLIC_DAYS=365
PROOF_WORKER_INTERVAL=30
S3_ENDPOINT=
S3_REGION=us-east-1
S3_BUCKET=
S3_ACCESS_KEY=
S3_SECRET_KEY=
FFMPEG_PATH=/usr/bin/ffmpeg
FFPROBE_PATH=/usr/bin/ffprobe
MODERATION_PROVIDER=stub
MODERATION_BLOCK_ON_FAIL=1
LEADERBOARD_TOP_N=100
LEADERBOARD_RETENTION_DAILY=60
LEADERBOARD_RETENTION_WEEKLY=26
SHARE_BASE_URL=http://localhost:3000
```

Copy this file to `.env` (client root) and `.env` inside `server/` as needed, then toggle the flags you require.

Phase 4 introduces additional knobs:

- Video pipeline flags: `FEATURE_VIDEO_PROOFS`, `FEATURE_PROOF_MODERATION`, `FEATURE_PROOF_BLUR`, `VITE_FEATURE_VIDEO_PROOFS`, `VITE_FEATURE_PROOF_MODERATION`, `VITE_FEATURE_PROOF_BLUR`.
- Upload limits and tooling: `PROOF_MAX_VIDEO_BYTES`, `PROOF_MAX_DURATION_MS`, `FFMPEG_PATH`, `FFPROBE_PATH`.
- Storage lifecycle: `PROOF_LIFECYCLE_ORIGINAL_DAYS`, `PROOF_LIFECYCLE_PUBLIC_DAYS`.
- Moderation: `MODERATION_PROVIDER`, `MODERATION_BLOCK_ON_FAIL`.
- Worker cadence: `PROOF_WORKER_INTERVAL` (seconds between proof processor sweeps).

### Database migrations

The API uses SQLite via `better-sqlite3`.

```bash
cd server
FEATURE_LINK_DARES=1 FEATURE_PROOFS=1 npm run migrate
```

### Running locally

Start the API first, then the Vite dev server. Remember to enable the same flags for both services.

```bash
# API (port 3001 by default)
cd server
FEATURE_LINK_DARES=1 FEATURE_PROOFS=1 npm start

# Web client (port 8080)
cd ..
VITE_FEATURE_LINK_DARES=1 VITE_FEATURE_PROOFS=1 npm run dev
```

During development, configure Vite to proxy `/api` and `/p` to the API server by updating `vite.config.ts`:

```ts
export default defineConfig({
  server: {
    host: "::",
    port: 8080,
    proxy: {
      "/api": { target: "http://localhost:3001", changeOrigin: true },
      "/p": { target: "http://localhost:3001", changeOrigin: true },
    },
  },
  // ...
});
```

### Tests

Server unit/integration tests (Vitest):

```bash
cd server
npm test
```

Client tests are not yet automated; rely on manual QA for invite and proof flows until additional coverage is added.

## Phase 1: Link-driven dares

With feature flags enabled:

- **Create dare (UI)** – From the HUD modal, input title, category, odds, and expiry. The app calls `POST /api/dares`, enforcing expiry bounds (5 minutes to 7 days), generates a slug, and returns an invite URL + QR code.
- **Invite landing** – `/i/:slug?t=<jwt>` verifies the JWT, shows a live countdown, and listens to `/api/dares/:id/stream` (SSE) for state changes.
- **Acceptance** – `POST /api/dares/:id/accept` requires an `Idempotency-Key`, CSRF token, and invite JWT. Acceptances track IP/user-agent and transition the dare to `accepted` state.
- **Resolution** – `POST /api/dares/:id/pick` reveals the recipient’s number, validates the commit hash, and resolves the dare (`open → accepted → resolved`). The SSE stream broadcasts `dare.resolved` to all subscribers.

Key files:

- `src/components/LinkDareModal.tsx`
- `src/components/LinkDareInvitePage.tsx`
- `server/src/app.js` (routes and SSE)
- `server/test/proofs.test.js` (includes lifecycle coverage for proof pipeline and health)

## Phase 2: Photo proofs

The proof feature introduces presigned uploads, processing, and public proof pages. Highlights:

- **Presign** – `POST /api/proofs/presign` validates size/mime/sha256 and issues a single-use upload token (S3 presign or local proxy upload).
- **Finalize** – `POST /api/dares/:id/proofs` verifies checksum, records the proof, and enqueues processing.
- **Worker** – `server/src/workers/proofProcessor.js` uses sharp to create JPEG + thumbnails, optional watermark, and emits `proof.processed`.
- **Proof page** – `/p/:slug` serves an OG-rich HTML page for public/unlisted proofs linked to the dare.
- **UI updates** – The invite landing page prompts for proof upload when a dare is matched. The leaderboard (Stats panel) gains a “with proofs” toggle that fetches proof tiles when `FEATURE_PROOFS` is enabled.

Supporting files:

- `src/components/ProofCaptureModal.tsx`
- `src/components/ProofSharePanel.tsx`
- `src/utils/hash.ts`
- `server/src/proofs.js`
- `server/src/storage.js`
- `server/test/proofs.test.js`

### Storage drivers

- Disk: set `STORAGE_DRIVER=disk` and `DISK_ROOT` to a writable directory (default `./storage`).
- S3-compatible: set `STORAGE_DRIVER=s3` and the corresponding credentials/endpoint. Optionally set `PUBLIC_ASSET_BASE` to serve from a CDN.

## Docker images

Two Dockerfiles exist at the repo root:

| File | Purpose |
| ---- | ------- |
| `Dockerfile` | Builds the Vite bundle (with configurable `VITE_FEATURE_*` build args) and serves it via `nginx:alpine`. |
| `Dockerfile.api` | Packages the API/worker service on `node:22-slim`, installing libvips + build toolchain for `better-sqlite3` and exposes port 8080. |
| `Dockerfile.inference` | Builds the “Inspire me” transformer service (Flan-T5 via `@xenova/transformers`) and exposes port 8080 for text generation. |

Example build + push:

```bash
# Web (enable flags at build time as needed)
docker build -t localhost:32000/what-are-the-odds:latest \
  --build-arg VITE_FEATURE_LINK_DARES=1 \
  --build-arg VITE_FEATURE_PROOFS=1 .
docker push localhost:32000/what-are-the-odds:latest

# API
docker build -f Dockerfile.api -t localhost:32000/what-are-the-odds-api:latest .
docker push localhost:32000/what-are-the-odds-api:latest

# Inspire-me inference service
docker build -f Dockerfile.inference -t localhost:32000/what-are-the-odds-llm:latest .
docker push localhost:32000/what-are-the-odds-llm:latest
```

## Kubernetes

`k8s.yaml` provisions application, API, realtime, worker, and support resources:

- `what-are-the-odds` – nginx serving the static web bundle (port 80).
- `what-are-the-odds-api` – Node API (port 8080) with `/healthz` probes and ffmpeg baked in.
- `what-are-the-odds-ws` – WebSocket gateway deployment subscribing to Redis fan-out.
- `what-are-the-odds-proof-worker` – background deployment looping `node src/workers/proofProcessor.js` according to `PROOF_WORKER_INTERVAL`.
- `what-are-the-odds-proof-lifecycle` – nightly CronJob executing `node src/workers/proofLifecycle.js`.
- `redis` – single-node Redis backing pub/sub and rate limiting.
- `what-are-the-odds-llm` – transformer inference service powering “Inspire me” (port 8080).

Services expose each deployment internally. The primary ingress routes `/api/*`, `/ws`, and `/p/*` to the API, with an additional canary ingress sending 10% of `/ws` traffic to the WS pods. A shared `proof-storage` PVC backs API/worker/lifecycle/WS pods, a location-specific snippet permits 30 MB uploads on `/api/proofs/upload/`, and HPAs cover API, WS, and worker deployments. ConfigMap/Secret pairs supply feature flags, storage credentials, realtime parameters, and invite JWT key pairs.

Rollout commands:

```bash
kubectl apply -f k8s.yaml
kubectl rollout restart deployment/what-are-the-odds
kubectl rollout restart deployment/what-are-the-odds-api
kubectl rollout restart deployment/what-are-the-odds-proof-worker
kubectl rollout restart deployment/what-are-the-odds-llm
```

## Health & operations

- `GET /healthz` – API liveness/readiness probe.
- Proof worker: the `what-are-the-odds-proof-worker` deployment loops `node src/workers/proofProcessor.js`, sweeping every `PROOF_WORKER_INTERVAL` seconds (run `npm run process-proofs` locally as needed).
- Lifecycle worker: the `what-are-the-odds-proof-lifecycle` CronJob (or `node src/workers/proofLifecycle.js`) archives originals and prunes derived assets once they age beyond configured TTLs.
- WebSocket gateway: `what-are-the-odds-ws` pods expose `/healthz`; watch connection counts and `ws_*` telemetry events when `FEATURE_PERF_TELEM` is on.
- Redis: the `redis` deployment backs pub/sub and rate limiting—monitor memory/eviction stats and persistence if long-lived channels are required.
- Events table tracks dare + proof events for audit/stream replay.

## Verification checklist

1. With all Phase 3 flags off, `/leaderboard` and `/s/*` should 404 (server and client).
2. Enable `FEATURE_LEADERBOARDS`/`VITE_FEATURE_LEADERBOARDS`, run the worker, then hit `/leaderboard` – table renders once snapshots exist.
3. Call `POST /api/admin/leaderboard/rebuild` with `X-Admin-Token` to rebuild on demand; inspect `Cache-Control` headers on the public GET.
4. Toggle “with proofs only” in the UI and confirm rows lacking approved proofs disappear while thumbnails remain clickable.
5. Enable `FEATURE_SHARING`/`VITE_FEATURE_SHARING`; share routes `/s/r/:dareId` and `/s/p/:proofId` should render OG meta plus share controls (verify via `curl` for meta tags).
6. Attempt to share private dares/proofs – responses should return 404, while unlisted stays accessible via direct link and public remains indexable.
7. Monitor the API logs for `leaderboard.updated` events to confirm snapshot identifiers are captured after worker runs.
8. Enable `FEATURE_REALTIME_WS`/`VITE_FEATURE_REALTIME_WS`, point `REDIS_URL` at Redis, and confirm two browser tabs receive live updates from `/ws` while SSE continues to function when WS is disabled.
9. Flood a single client with `ping`/`sub` frames to trigger the token bucket, verifying the connection closes (4008) without impacting other subscribers.
10. Rotate `INVITE_JWT_SECRET_NEXT`, deploy, then swap the active secret—tokens signed with the previous `kid` continue to verify during the transition.

## Phase 3: Leaderboards & sharing

With leaderboards and sharing enabled:

- **Snapshot worker** – Generates daily (00:05 UTC), weekly (Monday 00:10 UTC), and all-time (hourly on change) snapshots, retaining 60/26/1 windows respectively. Each job emits a `leaderboard.updated` event and enforces versioned idempotency.
- **Leaderboard API** – `GET /api/leaderboard` serves cached snapshots with optional `period`, `category`, `withProofs`, and `limit` filters (public cache headers). `POST /api/admin/leaderboard/rebuild` allows admin-triggered rebuilds when `X-Admin-Token` matches `ADMIN_API_TOKEN`.
- **Client UI** – `/leaderboard` presents daily/weekly/all-time tabs, category filter, and a “with proofs only” toggle that surfaces proof thumbnails linking to `/p/:slug`.
- **Share endpoints** – `GET /api/share/result/:dareId` and `GET /api/share/proof/:proofId` return OG/Twitter payloads with visibility checks. SSR routes `/s/r/:dareId` and `/s/p/:proofId` expose public tiles with Web Share / copy fallbacks (Cache-Control: `public, max-age=60, stale-while-revalidate=600`).
- **Feature gating** – Set both client and server flags (`FEATURE_LEADERBOARDS`, `FEATURE_SHARING`, `VITE_FEATURE_*`) alongside Phase 1/2 flags to activate the flow.

## Phase 4: Video proofs & moderation

Enable the Phase 4 feature flags to extend the proof system:

- **Video capture & upload** – The proof modal adds a video tab with MediaRecorder support (10-second cap, countdown, and fallback file input). Presign/finalize accept `type: "video"`, validate client hashes, and store originals under `/proofs/{yyyy}/{mm}/{dareId}/original/*`.
- **Transcoding worker** – The proof processor probes uploads via `ffprobe`, transcodes to mp4 (H.264/AAC) and webm (VP9/Opus), extracts poster frames, and writes derived assets under `/public/vid/*` with optional GIF teasers. Watermarks apply when `PROOF_WATERMARK=1`.
- **Moderation gates** – Proofs remain `moderation='pending'` until processing completes. Automated heuristics populate `moderation_reviews`, public publishes are blocked until approval, and admins can approve/reject via `POST /api/admin/moderation/:proofId`.
- **Client blur editor** – Uploaders can draw rectangular masks over posters (`POST /api/proofs/:id/blur`), producing redacted poster/jpeg assets while keeping originals private.
- **Lifecycle tasks** – `node src/workers/proofLifecycle.js` archives long-lived originals and prunes derived assets for private/taken-down proofs based on `PROOF_LIFECYCLE_ORIGINAL_DAYS` and `PROOF_LIFECYCLE_PUBLIC_DAYS`.
- **Security hardening** – Proof finalize/blur endpoints are rate limited per IP, and Helmet publishes a CSP (with `blob:` allowances) plus strict referrer policy to keep capture secure without leaking invite URLs.
- **Feature flags** – Toggle `FEATURE_VIDEO_PROOFS`, `FEATURE_PROOF_MODERATION`, `FEATURE_PROOF_BLUR` (and the matching `VITE_*`) alongside the base proof flags to activate capture, moderation, and blur flows.

## Phase 5: Realtime & hardening

- **WebSocket gateway** – `ws://<host>/ws` accepts room subscriptions (via `{ type: "sub", dareId }`) with heartbeat/idle timeouts and falls back to SSE when the flag is disabled or the WebSocket fails. Messages mirror the existing SSE payloads.
- **Redis bus** – Events published with `publishBus` fan out through Redis so API pods, the WS gateway, and SSE fallback all receive the same stream.
- **Session tokens** – The new `session_tokens` table rotates `session-token` cookies after `TOKEN_ROTATION_MIN` minutes, revoking older JTIs while preserving the existing `anon-id` identity.
- **Security controls** – `FEATURE_SECURITY_HARDENING` enforces allowed origins, per-IP connection caps, token-bucket message limits, and backpressure disconnects (1 MB/200 message queue). Private dares require participation before joining a room.
- **Telemetry & CDN** – With `FEATURE_PERF_TELEM` enabled, sampled RED metrics for HTTP routes and WS events land at `TELEMETRY_ENDPOINT`. Public assets resolve via `CDN_PUBLIC_BASE` so share pages and proofs hit the CDN by default.
- **Infrastructure** – Additional `what-are-the-odds-ws` deployment + HPA, Redis backing service, PVC-backed storage reuse, and a canary ingress route `/ws` traffic gradually. API and worker HPAs observe CPU/memory and queue depth respectively.

### Realtime runbook

1. **Provision Redis** – deploy the bundled `redis` manifest (or point `REDIS_URL` at your managed instance) before enabling WebSockets.
2. **Enable flags** – set `FEATURE_REALTIME_WS=1` on the API/WS pods (and `VITE_FEATURE_REALTIME_WS=1` for the web build). Turn on `FEATURE_SECURITY_HARDENING` when you are ready for origin checks and per-IP limits; enable `FEATURE_PERF_TELEM` only after `TELEMETRY_ENDPOINT` is reachable.
3. **Deploy canary** – apply `k8s.yaml` and watch the `what-are-the-odds-ws` pods and the canary ingress (`nginx.ingress.kubernetes.io/canary-weight=10`). Verify `ws_connect`/`ws_close` telemetry and Redis load.
4. **Promote** – increase the canary weight (or update the primary ingress to route `/ws` directly) once error rate and latency look healthy.
5. **Rotate invite keys** – populate `INVITE_JWT_SECRET_NEXT`, deploy, then flip `INVITE_JWT_SECRET` to the new value and clear `INVITE_JWT_SECRET_NEXT`; existing tokens continue to verify via the kid hash.
6. **Monitor** – HPAs now scale API/WS pods. Track Redis memory, WS connection counts, and telemetry throughput; fall back to SSE by toggling `FEATURE_REALTIME_WS` off if needed (clients automatically reconnect via EventSource).

## Repo structure

```
.
├── Dockerfile           # Web bundle container
├── Dockerfile.api       # API/worker container
├── k8s.yaml             # Combined deployments, services, ingress
├── nginx.conf           # SPA routing for nginx stage
├── server/
│   ├── migrations/      # SQLite migrations (incl. proofs)
│   ├── src/
│   │   ├── app.js       # Express app + routes
│   │   ├── proofs.js    # Proof APIs + pages
│   │   ├── storage.js   # Disk/S3 abstraction
│   │   └── workers/     # Proof processing worker
│   └── test/            # Vitest suites
└── src/
    ├── components/      # React components (dare modal, invite page, proof UI)
    ├── utils/           # Shared helpers (hashing, cookies)
    └── flags.ts         # Feature flag helpers for client
```

## License

MIT. See [LICENSE](LICENSE) for redistribution details.
