# Model Radar

<img src="static/model-radar.svg" alt="Model Radar logo" width="96" />

**Live pricing. Independent benchmarks. Comparable costs. One dashboard.**

Model Radar is a self-hosted dashboard for exploring AI models available through [OpenRouter](https://openrouter.ai/). It combines current pricing, Artificial Analysis benchmark indices, workload estimates, price movements, and model capabilities in one searchable view.

> [!TIP]
> No upstream API key is required. OpenRouter's public catalogs provide model data, pricing, and available benchmark indices.

## AI development disclosure

Model Radar was developed with substantial assistance from generative AI tools.

AI output is treated as a draft, not proof that the software works. Humans decide the behavior and own the testing, debugging, security review, and maintenance.

## What it shows

- **Model intelligence:** AA Index, Coding Index, and Agentic Index from Artificial Analysis, supplied by OpenRouter.
- **Comparable pricing:** input, output, blended, and estimated monthly costs for token-priced models.
- **Specialized pricing:** native rates for image, audio, video, embedding, speech, transcription, and other non-text models.
- **Recommendations:** the strongest models overall and the best options below a configurable budget threshold.
- **Price movements:** independently tracked input and output changes with 15-day retention.
- **Model comparison:** capability, pricing, context, modalities, and benchmarks for up to four models.
- **Full catalog tools:** search, capability filters, category tabs, sorting, and pagination.
- **Latest news:** recent model articles from [Artificial Analysis](https://artificialanalysis.ai/articles).

## Quick start

Requires **Node.js 24 or newer**.

```bash
cp .env.example .env.local
npm ci
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). Model Radar creates the local database at `.data/model-radar.db` on first use.

## Deploy with Docker Compose

Copy the Docker environment template, set your public origin, then build and start the service:

```bash
cp .env.docker.example .env
# Set ORIGIN in .env and CRON_SECRET if you use scheduled sync
docker compose up -d --build
```

Open [http://localhost:3000](http://localhost:3000) for a local deployment. Compose binds to `127.0.0.1` by default; keep that binding and route public traffic through a same-host TLS reverse proxy.

```bash
docker compose ps
docker compose logs -f app
docker compose down
```

> [!WARNING]
> The `model-radar-data` volume contains local price history. Do not run `docker compose down --volumes` unless you intend to delete it.

The container runs as an unprivileged user with a read-only root filesystem, dropped Linux capabilities, resource limits, and writable mounts only for `/app/data` and `/tmp`. Its `GET /api/health` check does not call OpenRouter or the database.

### Subpath deployments

The SvelteKit base path is compiled into the image and cannot be changed only at runtime:

```bash
docker build --build-arg BASE_PATH=/model-radar -t model-radar .
docker compose up -d
```

## How rankings work

| Measure | Definition |
| --- | --- |
| **Blended price** | 75% input price and 25% output price per one million tokens |
| **Cheap** | Blended price at or below `CHEAP_MODEL_MAX_PRICE`, which defaults to `$1` |
| **State of the art** | The 10 highest-AA-Index token-priced paid models |
| **Value score** | 75% normalized AA Index and 25% log-price efficiency |
| **Budget shortlist** | 50% normalized AA Index and 50% log-price affordability among cheap models |

Models without an AA Index remain visible but are not ranked. OpenRouter attaches benchmark indices directly to model IDs, so Model Radar does not scrape scores or guess model matches.

> [!IMPORTANT]
> Specialized prices use different units and cannot be compared as token prices. These models appear in **All paid**, but they are never blended, ranked, given workload estimates, or stored in token-price history.

Free `:free` and paid `:batch` variants are isolated in dedicated table tabs and excluded from paid rankings and recommendations. Generic free routing, zero-priced text routes, and dynamic or negative-priced routes are excluded.

## Configuration

| Variable | Purpose | Default |
| --- | --- | --- |
| `CHEAP_MODEL_MAX_PRICE` | Maximum blended price for the cheap segment | `1` |
| `CRON_SECRET` | Protects `POST /api/sync`; must be at least 32 bytes | None |
| `DATABASE_URL` | Local libSQL file or remote Turso URL | `file:.data/model-radar.db` |
| `DATABASE_AUTH_TOKEN` | Required when `DATABASE_URL` is remote | None |
| `ORIGIN` | Public HTTPS origin used by SvelteKit in production | None |
| `BODY_SIZE_LIMIT` | Maximum request body size | `16K` |

Start from `.env.example` for host development or `.env.docker.example` for Docker Compose. Never commit populated environment files.

## Data and sync

Local development uses libSQL. For Turso, set the server-only credentials:

```env
DATABASE_URL=libsql://model-radar-your-org.turso.io
DATABASE_AUTH_TOKEN=your-token
```

Schema migrations run automatically. Daily snapshots are idempotent per model and retained for 15 days; price changes compare against the most recent earlier date and track input and output independently.

The public dashboard and OpenRouter source both use a one-hour cache. To force one authenticated refresh, set `CRON_SECRET` and call the sync endpoint:

```bash
curl -X POST \
  -H "Authorization: Bearer $CRON_SECRET" \
  https://your-app.example/api/sync
```

Only `POST /api/sync` bypasses source caches. Public refreshes continue to use cached upstream data.

## License

Model Radar is licensed under the [MIT License](LICENSE).

### Data attribution

Pricing and model metadata are provided by [OpenRouter](https://openrouter.ai/). Benchmark indices are produced by [Artificial Analysis](https://artificialanalysis.ai/) and supplied through OpenRouter's public model API. Both sources remain attributed in the application.

The MIT License applies to this repository's source code. Upstream data and services remain subject to their providers' terms.
