# Model Radar

Model Radar is a Svelte 5 and SvelteKit application for tracking paid AI model prices from OpenRouter and comparing them with independent Artificial Analysis benchmarks. Daily prices are persisted through Drizzle and libSQL, using a local file during development or Turso in production.

## Features

- Live paid-model pricing from OpenRouter
- Free, zero-priced, and dynamic-price routes excluded
- Artificial Analysis Intelligence, Coding, Math, speed, and latency metrics
- Cheap and frontier model segments
- Workload-based monthly cost estimates
- Daily idempotent price snapshots and increase/drop detection
- Local libSQL development and Turso production persistence
- Secret-protected daily sync endpoint
- Server-rendered, responsive Svelte dashboard
- Dependency-free SVG value map
- CSP nonces, security headers, rate limits, request deduplication, and upstream timeouts

## Stack

- Svelte 5.56 and SvelteKit 2.70, powered by Vite 8
- SvelteKit Node adapter
- Drizzle ORM with `@libsql/client`
- Turso Cloud in production or a local libSQL file in development
- Vitest, ESLint, and `svelte-check`

## Run locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

The app is available at `http://localhost:5173`. A local database is created at `.data/model-radar.db` on first load.

Create a free Artificial Analysis API key at [artificialanalysis.ai/documentation](https://artificialanalysis.ai/documentation) and set `ARTIFICIAL_ANALYSIS_API_KEY`. OpenRouter pricing works without a key, while ranking-dependent recommendations remain explicitly unavailable until it is configured.

## Turso

Create a Turso database and configure the server-only credentials:

```env
DATABASE_URL=libsql://model-radar-your-org.turso.io
DATABASE_AUTH_TOKEN=your-token
```

The application runs its small, versioned schema migration automatically. `DATABASE_AUTH_TOKEN` is never imported into client code because all database modules live under `$lib/server`.

## Daily sync

Set `CRON_SECRET` to at least 32 random bytes, then send one request per day:

```bash
curl -X POST \
  -H "Authorization: Bearer $CRON_SECRET" \
  https://your-app.example/api/sync
```

Only this authenticated endpoint bypasses the source caches. The public refresh route cannot exhaust the Artificial Analysis quota.

## Classification

- **Blended price:** 75% input price and 25% output price, per one million total tokens.
- **Cheap:** blended price at or below `CHEAP_MODEL_MAX_PRICE`, defaulting to `$1`.
- **Frontier:** the top 10 matched OpenRouter models by Artificial Analysis Intelligence Index.
- **Value score:** 68% normalized intelligence, 22% log-price efficiency, and 10% output speed.

Model matching is constrained by creator and scored from normalized model names. The matched Artificial Analysis configuration and confidence are visible in each model's detail panel.

## Production

```bash
npm run build
ORIGIN=https://your-app.example npm start
```

`npm start` loads `.env.local` when present. Place a TLS reverse proxy or managed platform in front of the Node server and enable Brotli or gzip there for dynamic SSR responses. Set `ORIGIN` to the public HTTPS origin so SvelteKit can validate request origins correctly.

## Docker Compose

The production image pins the currently published Node 24 LTS slim image by digest for reproducible builds, builds the SvelteKit application in a separate stage, and runs as an unprivileged user. Compose drops Linux capabilities, prevents privilege escalation, makes the root filesystem read-only, limits resources, and persists local libSQL data in a named volume.

Create a `.env` file based on `.env.docker.example`, then configure at least `ORIGIN`, `ARTIFICIAL_ANALYSIS_API_KEY`, and `CRON_SECRET`.

Build and start the service:

```bash
docker compose up -d --build
```

Inspect its status and logs:

```bash
docker compose ps
docker compose logs -f app
```

Stop the service without deleting price history:

```bash
docker compose down
```

The named `model-radar-data` volume survives container replacement. Do not add `--volumes` to `docker compose down` unless you intentionally want to delete local price history.

### Server deployment

The secure default publishes the application only on `127.0.0.1:3000`. Put Caddy, Nginx, Traefik, or another TLS reverse proxy in front of it and forward requests to that address. Set `ORIGIN` to the external HTTPS URL.

If the container must be reached directly from another host, set:

```env
MODEL_RADAR_BIND_ADDRESS=0.0.0.0
```

Restrict the published port with the server firewall and terminate TLS before exposing the application publicly.

For Turso, replace the local database settings in `.env`:

```env
DATABASE_URL=libsql://model-radar-your-org.turso.io
DATABASE_AUTH_TOKEN=your-token
```

The local volume may remain attached when using Turso; the application will not write database data to it.

The container health check uses `GET /api/health` and does not consume OpenRouter or Artificial Analysis quota.

## Data attribution

Pricing data is provided by [OpenRouter](https://openrouter.ai/). Benchmark data is provided by [Artificial Analysis](https://artificialanalysis.ai/) through its free API and is attributed in the application as required by its terms.
