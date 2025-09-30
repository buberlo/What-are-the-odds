# What are the odds?!

High-stakes party dares with commit–reveal fairness, live invite flows, and photo proof sharing. The repo contains both the Vite-powered web client and the Node-based API/worker service used in production.

## Feature overview

| Feature | Flag | Default | Notes |
| ------- | ---- | ------- | ----- |
| Link-driven dares (Phase 1) | `FEATURE_LINK_DARES` / `VITE_FEATURE_LINK_DARES` | off | Invite creation, JWT-secured landing page, commit–reveal resolution, SSE updates. |
| Proof pipeline (Phase 2) | `FEATURE_PROOFS` / `VITE_FEATURE_PROOFS` | off | Direct-to-storage uploads, sharp processing, thumbnails, publish controls, public proof pages. |

Enable the matching client and server flags when developing a feature set.

## Getting started

### Prerequisites

- Node.js 22+
- npm 10+
- libvips (for sharp) when running the server locally on Linux/macOS

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
FEATURE_LINK_DARES=0
FEATURE_PROOFS=0
BASE_URL=http://localhost:3000
INVITE_JWT_SECRET=dev-secret
STORAGE_DRIVER=disk
DISK_ROOT=./storage
PUBLIC_ASSET_BASE=
PROOF_MAX_IMAGE_BYTES=10485760
PROOF_WATERMARK=1
S3_ENDPOINT=
S3_REGION=us-east-1
S3_BUCKET=
S3_ACCESS_KEY=
S3_SECRET_KEY=
```

Copy this file to `.env` (client root) and `.env` inside `server/` as needed, then toggle the flags you require.

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

`k8s.yaml` provisions three deployments:

- `what-are-the-odds` – nginx serving the static web bundle (port 80).
- `what-are-the-odds-api` – Node API/worker (port 8080) with `/healthz` probes.
- `what-are-the-odds-llm` – transformer inference service powering “Inspire me” (port 8080).

Services expose each deployment internally, and the ingress routes `/api/*` and `/p/*` to the API, `/api/inspire` to the LLM deployment, and all other traffic hitting the web deployment. The ConfigMap/Secret combo supplies feature flags and storage credentials. Adjust the default `emptyDir` volume for proofs to a persistent volume in production.

Rollout commands:

```bash
kubectl apply -f k8s.yaml
kubectl rollout restart deployment/what-are-the-odds
kubectl rollout restart deployment/what-are-the-odds-api
kubectl rollout restart deployment/what-are-the-odds-llm
```

## Health & operations

- `GET /healthz` – API liveness/readiness probe.
- Proof worker: run `npm run process-proofs` (or schedule a CronJob) to process pending proofs.
- Events table tracks dare + proof events for audit/stream replay.

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
