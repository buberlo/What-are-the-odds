# What are the odds?!

A cinematic control room for running the high-stakes party game “What are the odds?!” in person or over video. Manage the roster, craft outrageous dares, collect secret picks, and reveal the outcome together from a single polished web UI.

## Features

- **Player roster dashboard** – Add or remove players on the fly, pick custom emoji and colors, and monitor each person’s wins, losses, and dares completed.
- **Dare staging studio** – Choose a challenger, target, odds, and prompt. Launch a new dare in seconds with an interface tuned for touch screens and laptops alike.
- **Live round controller** – Collect secret numbers, trigger a countdown reveal, then log whether the dare was completed, remixed, or declined.
- **Persistent log** – Every round lands in a session history so the group can relive the chaos and settle debates later.
- **Session pulse** – Spotlight the current MVP and overall stats so the crew sees who’s getting lucky (or not) tonight.
- **Glassmorphism aesthetic** – Purpose-built styling keeps the app readable in low light while delivering a playful party vibe.

## Tech stack

- [Vite](https://vitejs.dev/) + [React](https://react.dev/) with TypeScript for a fast, modern development experience.
- Hand-crafted CSS (no Tailwind or component kits) for a bespoke visual identity.
- Zero runtime dependencies beyond React so the production bundle stays tiny and self-contained.

## Getting started

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Run the dev server**

   ```bash
   npm run dev
   ```

   Vite will report the local URL (defaults to `http://localhost:5173`). Hot reloading is enabled by default.

3. **Lint the project**

   ```bash
   npm run lint
   ```

4. **Create a production build**

   ```bash
   npm run build
   ```

   The optimized assets land in `dist/` and can be served by any static HTTP server.

5. **Preview the production build locally**

   ```bash
   npm run preview
   ```

## Container & Kubernetes deployment

1. **Build a container image** using any static web server. Here’s a minimal example with [Caddy](https://caddyserver.com/):

   ```dockerfile
   FROM node:22-alpine AS build
   WORKDIR /app
   COPY package*.json .
   RUN npm install
   COPY . .
   RUN npm run build
   
   FROM caddy:2-alpine
   COPY --from=build /app/dist /srv
   EXPOSE 8080
   CMD ["caddy", "file-server", "--root", "/srv", "--listen", ":8080"]
   ```

2. **Push the image** to your registry (`docker buildx build --push ...`).

3. **Deploy to Kubernetes** with a simple Deployment + Service manifest:

   ```yaml
   apiVersion: apps/v1
   kind: Deployment
   metadata:
     name: what-are-the-odds
   spec:
     replicas: 1
     selector:
       matchLabels:
         app: what-are-the-odds
     template:
       metadata:
         labels:
           app: what-are-the-odds
       spec:
         containers:
           - name: web
             image: ghcr.io/your-user/what-are-the-odds:latest
             ports:
               - containerPort: 8080
   ---
   apiVersion: v1
   kind: Service
   metadata:
     name: what-are-the-odds
   spec:
     selector:
       app: what-are-the-odds
     ports:
       - name: http
         port: 80
         targetPort: 8080
     type: LoadBalancer
   ```

Expose the service via your preferred ingress solution and you’re ready to run the game from anywhere.

## Project scripts

| Script          | Description                                      |
| --------------- | ------------------------------------------------ |
| `npm run dev`   | Start the local dev server with hot reloading.    |
| `npm run build` | Generate a production-ready build in `dist/`.     |
| `npm run lint`  | Run ESLint across the project.                    |
| `npm run preview` | Serve the `dist/` output for a final smoke test. |

## License

MIT License. See [LICENSE](LICENSE) if you plan to redistribute your own version of the experience.
