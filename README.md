# Model Radar

Model Radar is a Svelte 5 and SvelteKit application for exploring paid AI models from OpenRouter, tracking comparable token prices, and comparing models with independent Artificial Analysis benchmarks supplied through OpenRouter. Daily token prices are persisted through Drizzle and libSQL, using a local file during development or Turso in production.

## Features

- Live token-priced and specialized model data from OpenRouter
- Image, audio, video, embedding, and other non-text output models in a dedicated view
- Generic free, zero-priced text, and dynamic-price routes excluded
- Artificial Analysis AA Index, Coding Index, and Agentic Index data from OpenRouter
- Local creator logos for major model providers with accessible fallbacks
- Cheap and frontier model segments
- Workload-based monthly cost estimates for comparable token-priced models
- Side-by-side comparison for up to four selected models
- Paginated model index with full-catalog search, filters, and sorting
- Cumulative input/output price-movement tracking with refreshed 15-day retention
- Daily idempotent price snapshots retained for 15 days
- Local libSQL development and Turso production persistence
- Secret-protected daily sync endpoint
- Server-rendered, responsive Svelte dashboard
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

OpenRouter's public model catalog supplies both pricing and available benchmark indices, so no upstream API key is required.

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

Only this authenticated endpoint bypasses the OpenRouter source cache. Public refreshes continue to use cached upstream data.

## Classification

- **Blended price:** 75% input price and 25% output price, per one million total tokens.
- **Cheap:** blended price at or below `CHEAP_MODEL_MAX_PRICE`, defaulting to `$1`.
- **Frontier:** the top 10 token-priced paid OpenRouter models with the highest AA Index.
- **Value score:** 75% normalized AA Index and 25% log-price efficiency.
- **Budget shortlist:** models below the cheap threshold ranked by a 50/50 blend of normalized AA Index and log-price affordability.
- **Special variants:** free and batch routes appear only in their dedicated model-table tabs and are excluded from paid rankings and recommendations.
- **Specialized outputs:** non-text output models appear in All paid and a dedicated Specialized tab. Their heterogeneous pricing is not blended, estimated, ranked, or persisted in token-price history.

OpenRouter attaches benchmark scores directly to its model IDs, so no fuzzy model matching is required. Models without an AA Index remain available for pricing but are excluded from frontier and value rankings.

## Production

```bash
npm run build
ORIGIN=https://your-app.example npm start
```

`npm start` loads `.env.local` when present. Place a TLS reverse proxy or managed platform in front of the Node server and enable Brotli or gzip there for dynamic SSR responses. Set `ORIGIN` to the public HTTPS origin so SvelteKit can validate request origins correctly.

## Docker Compose

The production image pins the currently published Node 24 LTS slim image by digest for reproducible builds, builds the SvelteKit application in a separate stage, and runs as an unprivileged user. Compose drops Linux capabilities, prevents privilege escalation, makes the root filesystem read-only, limits resources, and persists local libSQL data in a named volume.

For a subpath deployment, set the image build argument explicitly. The base path is compiled into SvelteKit and cannot be changed only at runtime:

```bash
docker build --build-arg BASE_PATH=/model-radar -t model-radar .
```

Create a `.env` file based on `.env.docker.example`, then configure at least `ORIGIN` and `CRON_SECRET`.

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

The container health check uses `GET /api/health` and does not call OpenRouter or the database.

## Data attribution

Pricing data is provided by [OpenRouter](https://openrouter.ai/). Benchmark scores are provided by [Artificial Analysis](https://artificialanalysis.ai/) and supplied through OpenRouter's public model API; both sources remain attributed in the application.
