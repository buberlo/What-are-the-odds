# What are the odds?!

A cinematic control room for running the high-stakes party game “What are the odds?!” in person or over video. Manage the roster, craft outrageous dares, collect secret picks, and reveal the outcome together from a single polished web UI.

## Highlights

- **Player roster dashboard** – Add or remove players on the fly, pick custom emoji and colors, and monitor each person’s wins, losses, and dares completed.
- **Dare staging studio** – Choose a challenger, target, odds, and prompt. Launch a new dare in seconds with an interface tuned for touch screens and laptops alike.
- **Live round controller** – Collect secret numbers, trigger a countdown reveal, then log whether the dare was completed, remixed, or declined.
- **Persistent log** – Every round lands in a session history so the group can relive the chaos and settle debates later.
- **Session pulse** – Spotlight the current MVP and overall stats so the crew sees who’s getting lucky (or not) tonight.
- **Glassmorphism aesthetic** – Purpose-built styling keeps the app readable in low light while delivering a playful party vibe.
- **Spicy AI dares** – The “Inspire me” button calls a transformer model for outrageous party dares, with curated fallbacks when the LLM misbehaves.

## System architecture

| Layer | Source | Notes |
| ----- | ------ | ----- |
| Web client | `src/` (Vite + React 18 + Three.js) | Ships as static assets served by nginx in production. All requests to `/api/inspire` are forwarded to the inference service through the ingress. |
| Dare generator API | `server/` (Node 22, Express, `@xenova/transformers`) | Loads the `Xenova/flan-t5-small` text-to-text model, validates the output, and falls back to a curated generator when the model misses the brief. Exposes `GET /api/inspire` and `/healthz`. |
| Kubernetes deployment | `k8s.yaml` + `kustomization.yaml` | Deploys two Deployments (`what-are-the-odds` and `what-are-the-odds-llm`), paired Services, and a TLS-enabled Ingress handled by cert-manager. |

## Feature flag: link-driven dares (Phase 1)

Phase 1 of the link-driven dare flow ships behind the `FEATURE_LINK_DARES` flag and is disabled by default. Enable it in both the web client and API to surface the new endpoints and UI:

```bash
# Web UI
VITE_FEATURE_LINK_DARES=1 npm run dev

# API / inference service
cd server
FEATURE_LINK_DARES=1 npm start
```

The server stores link dares in SQLite (via `better-sqlite3`). Run migrations once per environment:

```bash
cd server
FEATURE_LINK_DARES=1 npm run migrate
```

### API surface (flagged)

| Endpoint | Method | Description |
| -------- | ------ | ----------- |
| `/api/dares` | `POST` | Create a new link dare with commit–reveal hash, expiry window validation, and a signed invite JWT. |
| `/api/i/:slug` | `GET` | Fetch a redacted dare view when presenting an invite link (`t=<jwt>` query parameter required). |
| `/api/dares/:id/accept` | `POST` | Single-use invite acceptance. Requires `Idempotency-Key`, CSRF headers, and the invite JWT. |
| `/api/dares/:id/pick` | `POST` | Reveal the recipient’s number, verify the original commit hash, and resolve the dare. |
| `/api/dares/:id/stream` | `GET` (SSE) | Live stream of `dare.created`, `dare.accepted`, `dare.resolved`, `dare.expired`, plus heartbeats. |

### Client experience

With the flag on, the HUD header exposes a “Create dare” modal that walks through title, description, range, expiry, and the committed number, then returns a copy-ready invite URL and QR code. Visiting `/i/<slug>?t=<token>` renders the invite landing view with the countdown, fairness badge, accept button, and live result banner that updates via SSE.

### Testing

Server-side unit, integration, and E2E coverage lives in `server/test/link-dares.test.js`. Run them with:

```bash
cd server
npm test
```

The generator now returns structured responses of the form:

```json
{
  "suggestion": "Pour a salted caramel body shot…",
  "source": "curated" // "llm" when the transformer output is accepted
}
```

The React UI surfaces a badge next to the “Inspire me” button indicating whether the current prompt is AI-generated, curated, or one of the classic presets.

## Local development

> **Node requirements:** Vite 7 expects Node ≥ 20.19 or ≥ 22.12. Install the latest LTS (22.x) before working on the repo.

1. **Install dependencies for the web client**

   ```bash
   npm install
   ```

2. **Install dependencies for the inference service**

   ```bash
   cd server
   npm install
   ```

3. **Run the transformer service locally**

   The web dev server also defaults to port 8080, so run the LLM on 8081 (or any free port) while setting the cache directory:

   ```bash
   cd server
   PORT=8081 TRANSFORMERS_CACHE=./cache npm start
   ```

4. **Proxy API calls when using `npm run dev`**

   Vite’s dev server expects `/api/inspire` to be served from the same origin. Add a temporary proxy block to `vite.config.ts` while developing:

   ```ts
   export default defineConfig({
     server: {
       host: "::",
       port: 8080,
       proxy: {
         "/api": {
           target: "http://localhost:8081",
           changeOrigin: true,
         },
       },
     },
     // …
   });
   ```

   Restart Vite after making the change.

5. **Start the web client**

   ```bash
   npm run dev
   ```

   The site will be available at `http://localhost:8080`. “Inspire me” will now hit the local transformer service and the UI badge will reflect whether the response came from AI (`🔥 AI dare`), the curated fallback (`🎲 Curated dare`), or the static preset deck (`📚 Classic dare`).

6. **Optional sanity checks**

   ```bash
   npm run lint     # type-aware ESLint
   npm run build    # creates dist/ for production
   npm run preview  # serves dist/ on port 4173 by default
   ```

## Container images

Two Dockerfiles live at repository root:

- `Dockerfile` builds the Vite bundle in a Node 22 Alpine builder, then serves it with `nginx:alpine` using `nginx.conf` for single-page routing.
- `Dockerfile.inference` installs the Node inference service on `node:22-slim`, adds `libgomp1` for ONNX runtime, and starts `server/index.js`. The container exposes port 8080 and persists the transformer cache at `/app/cache` (configurable via `TRANSFORMERS_CACHE`).

Example build & push flow (mirrors the commands used in the repo):

```bash
# Web UI
docker build -t localhost:32000/what-are-the-odds-web:latest .
docker push localhost:32000/what-are-the-odds-web:latest

# Inference service
docker build -f Dockerfile.inference -t localhost:32000/what-are-the-odds-llm:latest .
docker push localhost:32000/what-are-the-odds-llm:latest
```

## Kubernetes deployment

All manifests live in `k8s.yaml` and are wrapped by `kustomization.yaml` so you can deploy with one command:

```bash
kubectl apply -k .
```

The manifest provisions:

- `Deployment what-are-the-odds` – serves the web bundle on port 80 from `localhost:32000/what-are-the-odds-web:latest`.
- `Deployment what-are-the-odds-llm` – runs the transformer API on port 8080 from `localhost:32000/what-are-the-odds-llm:latest` with a 1 Gi ephemeral cache.
- `Service` objects for each deployment (ClusterIP on ports 80 and 8080).
- An `Ingress` bound to class `public` with TLS handled by cert-manager using the `letsencrypt-prod` ClusterIssuer. TLS SANs cover:
  - `whate-are-the-odds.com`
  - `www.whate-are-the-odds.com`

> **Prerequisites**
>
> - cert-manager installed with a `ClusterIssuer/letsencrypt-prod` in the cluster.
> - An ingress controller registered as class `public`.
> - DNS A records for the domains above pointing at the ingress.
> - A registry reachable as `localhost:32000` (e.g., the MicroK8s registry add-on).

### Operational tips

- **Deployments** – Scale the web or inference deployments independently with `kubectl scale deployment what-are-the-odds[-llm] --replicas=N`.
- **Health checks** – The inference pod exposes `/healthz` used by readiness and liveness probes. The web pod is probed on `/`.
- **Logs** – The transformer service logs a single structured line per request, e.g. `[inspire] source=llm` or `[inspire] source=curated`. Errors are emitted as `[inspire] source=error …` with the stack trace.
- **Certificates** – Inspect progress with `kubectl describe certificate what-are-the-odds-com-tls -n <namespace>`.

## Inspire API reference

```
GET /api/inspire
```

Response:

```json
{
  "suggestion": "Sit across the challenger's lap while describing…",
  "source": "curated"  // "llm" when the transformer output is accepted
}
```

Error responses include `{"error": "Failed to generate dare"}` with HTTP 500 and a corresponding log entry.

The service enforces:

- 8–24 word suggestions.
- Mandatory mention of “target” or “challenger”.
- Filters for violence, minors, animals, drugs, and template leakage.
- Automatic punctuation and curated fallback prompts covering body shots, blindfolds, roleplay, and other party-friendly dares.

## Project scripts (web)

| Script | Description |
| ------ | ----------- |
| `npm run dev` | Start the Vite dev server (default port 8080). |
| `npm run build` | Generate a production build in `dist/`. |
| `npm run preview` | Serve `dist/` locally for a final smoke test. |
| `npm run lint` | Run ESLint across the project. |

The inference service has its own `npm start` script inside `server/package.json`.

## License

MIT License. See [LICENSE](LICENSE) if you plan to redistribute your own version of the experience.
