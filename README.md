# LoRaMINT

LoRaWAN measurement data collection service. Receives webhook messages from The Things Network (TTN) and stores sensor measurements and device log entries in PostgreSQL.

## Setup

```bash
docker compose -f compose.dev.yml up -d
cp .env.example .env
bun install
bun run migrate
bun run dev
```

## Endpoints

All endpoints are under `/api/v1`.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/webhook` | TTN webhook receiver |
| `GET` | `/api/v1/measurements` | Paginated measurements (`?page=1&per_page=20`) |
| `GET` | `/api/v1/measurements/export` | CSV export of all measurements |
| `GET` | `/api/v1/log-entries` | Paginated log entries (`?page=1&per_page=20`) |
| `GET` | `/api/v1/health` | Health check |
| `GET` | `/api/v1/docs` | Interactive API docs |
| `GET` | `/api/v1/openapi.json` | OpenAPI spec |
| `GET` | `/api/v1/llms.txt` | API docs as markdown |

## Tech Stack

Bun, TypeScript, Hono, PostgreSQL, Zod
