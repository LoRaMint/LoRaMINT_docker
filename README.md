# LoRaMINT

IoT data collection service for LoRaWAN sensors. Receives measurement data from The Things Network (TTN) via webhook and stores it in PostgreSQL.

**Production:** [loramint.sfz-ox.de](https://loramint.sfz-ox.de)

## 1 Application and Usage

### 1.1 API Endpoints

All endpoints are under `/api/v1`.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/webhook` | TTN webhook receiver (Header: `X-Downlink-Apikey`) |
| `GET` | `/measurements` | Paginated measurements (`?page=1&per_page=20`) |
| `GET` | `/measurements/export` | CSV export of all measurements |
| `GET` | `/log-entries` | Paginated log entries (`?page=1&per_page=20`) |
| `GET` | `/health` | Health check |
| `GET` | `/docs` | Interactive API documentation (Scalar) |
| `GET` | `/openapi.json` | OpenAPI specification |
| `GET` | `/llms.txt` | API documentation as markdown |

### 1.2 Data Model

**measurements** - Stored sensor readings:
- `device_eui` - Device identifier (16 hex characters)
- `measurand` - What is measured (e.g. "temperature")
- `unit` - Unit of measurement (e.g. "celsius")
- `datatype` - Data type: `float`, `integer`, or `string`
- `sensor`, `location` - Sensor and location identifiers
- `value` - Measured value
- `time_method` - Timestamp method: `server`, `custom`, or `none`
- `recorded_at` - Time of measurement

**log_entries** - Device log messages:
- `device_eui` - Device identifier
- `message` - Log message

### 1.3 Production Deployment

The production image is built via GitHub Action and pushed to GHCR. A new release is triggered by a git tag:

```bash
git tag v1.0.0
git push origin v1.0.0
```

The image is published at `ghcr.io/loramint/loramint_docker:latest`.

Deploy with Docker Compose:

```bash
cp .env.prod.example .env.prod
# Edit .env.prod (DB_NAME, DB_USER, DB_PASSWORD, TTN_APP_KEY)
docker compose -f compose.prod.yml --env-file .env.prod up -d
```

### 1.4 Tech Stack

Bun, TypeScript, Hono, PostgreSQL, Zod, SolidJS, TailwindCSS v4, DaisyUI v5

### 1.5 Color Scheme

Custom DaisyUI theme `loramint`, based on a split-complementary scheme derived from the LoRaMINT and SFZ logos.

| Role | Hex | Usage |
|------|-----|-------|
| **Primary** | `#143C55` | Petrol blue (LoRaMINT logo) – headers, buttons, links |
| **Secondary** | `#A81C13` | Strong red – highlights, call-to-action |
| **Accent** | `#723437` | Dark wine red – subtle accents |
| **Neutral** | `#51707A` | Blue-grey – borders, muted text |
| **Success** | `#86B94C` | Green (SFZ logo) – success states |

Defined in `frontend/styles/global.css`.

---

## 2 Development Setup

### 2.1 Prerequisites

The following tools must be installed:

- [Bun](https://bun.sh/) (JavaScript/TypeScript runtime)
- [Docker](https://www.docker.com/) and Docker Compose

### 2.2 Setup

**1. Clone the repository**

```bash
git clone https://github.com/LoRaMint/LoRaMINT_docker.git
cd LoRaMINT_docker
```

**2. Create environment variables**

```bash
cp .env.example .env
```

The `.env` file contains:

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgres://loramint:loramint@localhost:5432/loramint` |
| `TTN_APP_KEY` | API key for TTN webhook authentication | `your-ttn-api-key` |
| `PORT` | Server port | `8090` |

The defaults work for local development. You can set `TTN_APP_KEY` to any value (it is only checked on the webhook endpoint).

**3. Start PostgreSQL**

```bash
docker compose -f compose.dev.yml up -d
```

Starts a PostgreSQL 15 instance on `localhost:5432` with the credentials from `.env`.

**4. Install dependencies**

```bash
bun install
```

**5. Run database migrations**

```bash
bun run migrate
```

Creates the `measurements` and `log_entries` tables (idempotent, safe to run multiple times).

**6. Start the dev server**

```bash
bun run dev
```

Starts the server at `http://localhost:8090` with hot reload. Changes to `.ts` files are picked up automatically.

### 2.3 Verify it works

```bash
# Health check
curl http://localhost:8090/api/v1/health

# Expected response: {"status":"ok"}
```

The interactive API documentation is available at `http://localhost:8090/api/v1/docs`.

### 2.4 Project Structure

```
index.ts                 Main application, route definitions
config.ts                Environment variable loading
types.ts                 Zod schemas and TypeScript types
migrate.ts               Database migration runner
services/
  measurement.ts         Measurement logic (validation, storage, queries, CSV export)
  log-entry.ts           Log entry logic (validation, storage, queries)
config/
  ssr.ts                 SSR configuration and HTML template
public/
  global.css             TailwindCSS + DaisyUI imports
  logo_loramint.svg      LoRaMINT logo
  logo_sfz.svg           SFZ logo
lib/
  openapi.ts             OpenAPI helper functions
  pagination.ts          Pagination utilities
  validator.ts           Zod validation middleware
migrations/
  001-initial-schema.ts  Database schema
scripts/
  entrypoints.sh         Docker entrypoint (migration + start)
```

### 2.5 Development Workflow

1. Edit `.ts` files - hot reload picks up changes automatically
2. New database fields: add a migration in `migrations/`, then run `bun run migrate`
3. New endpoint: add a route in `index.ts`, put business logic in `services/`
4. Test the API: `http://localhost:8090/api/v1/docs` or `curl`

### 2.6 Reset the Database

To start with a fresh database:

```bash
docker compose -f compose.dev.yml down -v   # Removes the volume
docker compose -f compose.dev.yml up -d      # Restart
bun run migrate                              # Recreate schema
```
