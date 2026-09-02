# Model Radar Agent Notes

## Runtime And Entry Points

- Use Node 24 or newer and `npm ci`; this is one ESM Svelte 5/SvelteKit 2 app, not a monorepo.
- `src/routes/+page.server.ts` loads the SSR dashboard; `src/routes/+page.svelte` owns its interactive state; `src/lib/server/radar.ts` is the pricing/ranking orchestration layer.
- Keep credentials, upstream calls, database access, and forced refreshes under `src/lib/server/`. SvelteKit prevents `$lib/server` imports from reaching browser code.
- The production target is `@sveltejs/adapter-node`. Local-file libSQL uses `node:fs` and `@libsql/client/node`, so an edge adapter is not a drop-in replacement.

## Commands

- Development: `npm run dev` (Vite's strict default port is 5173; `.env.local` is loaded).
- Full verification: `npm run check && npm run lint && npm test && npm run build && npm audit`.
- One test file: `npx vitest run tests/scoring.test.ts`.
- One named test: `npx vitest run -t "reports increases"`.
- `npm run check` and `npm run prepare` regenerate SvelteKit types. Never edit `.svelte-kit/` or `build/`.
- There is no formatter configured; do not invent a formatting command.

## Data Rules

- OpenRouter is the sole upstream source for pricing and embedded Artificial Analysis benchmark indices. Artificial Analysis must remain attributed in the UI.
- Free `:free` variants and paid `:batch` variants are isolated in dedicated model-table tabs. The generic free router and zero-priced text or dynamic/negative-priced routes remain excluded in `src/lib/server/openrouter.ts`; non-text output models may have zero generic token fields and remain available as specialized models.
- Specialized image, audio, video, embedding, and other non-text output models appear in All paid and the dedicated Specialized tab. Never blend, rank, estimate, or persist their heterogeneous prices as token prices.
- The documented blend is 75% input plus 25% output. `CHEAP_MODEL_MAX_PRICE` defaults to `$1/M`; frontier means the top 10 token-priced paid models by AA Index; value is 75% AA Index and 25% log-price efficiency; budget recommendations use 50% AA Index and 50% log-price affordability among cheap models.
- Benchmark indices are attached directly to OpenRouter model IDs. Models without an AA Index remain unranked; do not scrape or fabricate missing scores.

## Caching And Sync

- Cache TTLs are deliberate: dashboard and OpenRouter are both 1 hour. In-flight requests are deduplicated.
- Public `GET /api/radar` must use cached sources. Only authenticated `POST /api/sync` may call `getRadarData(true)` and bypass caches; `CRON_SECRET` must be at least 32 bytes.
- Snapshots are UTC-dated and idempotent per model/day. Price changes compare against the most recent earlier date, not an earlier request on the same day.

## Database

- Development defaults to `file:.data/model-radar.db`; Turso needs both `DATABASE_URL` and `DATABASE_AUTH_TOKEN`.
- Schema setup is automatic and versioned in the ordered migration list in `src/lib/server/db/client.ts`; update that list for every schema change.
- Snapshot writes are batched in groups of 100 for Turso. Preserve batching and idempotent upserts when changing persistence.

## Security And Deployment

- CSP nonces and allowed sources live in `svelte.config.js`; other response headers live in `src/hooks.server.ts`. Update CSP explicitly before adding an external browser resource.
- `/api/health` is a liveness check and must not call OpenRouter or the database.
- Docker Compose binds `127.0.0.1:3000` by default for a same-host TLS reverse proxy. Local container storage must use `file:/app/data/model-radar.db`, not the workstation `.data` path.
- The container root filesystem is read-only; only `/app/data` and `/tmp` are writable. Do not introduce writes elsewhere.
- `model-radar-data` contains local price history. Never use `docker compose down --volumes` unless deletion is explicitly requested.
- The Dockerfile copies build inputs explicitly. If a new root config is required by `npm run build`, add it to the build-stage `COPY` list and keep the Node 24 base digest current.
- Use `.env.example` for host development and `.env.docker.example` for Compose; never commit populated env files.

## Frontend

- Use Svelte 5 runes and existing components under `src/lib/components`; global visual styles are in `src/app.css`.
