# LoRaMINT

## 1 System Overview

IoT data collection service for LoRaWAN sensors.
Receives measurement data from The Things Network (TTN) via webhook, stores it in PostgreSQL.

Production: https://loramint.sfz-ox.de

### 1.1 Tech Stack

- Runtime: Bun
- Language: TypeScript (strict)
- Framework: Hono v4
- Validation: Zod v4
- Database: PostgreSQL (15 dev / 16 prod)
- API Docs: Scalar (OpenAPI)
- CI/CD: GitHub Actions -> GHCR (ghcr.io/loramint/loramint_docker)

### 1.2 Project Structure

```
index.ts           Main application, routes
config.ts          Environment variables (TTN_APP_KEY, PORT)
types.ts           TypeScript types + Zod schemas
migrate.ts         Database migration runner
services/
  measurement.ts   Measurement logic (validate, store, list, CSV export)
  log-entry.ts     Log entry logic (validate, store, list)
lib/
  openapi.ts       OpenAPI metadata
  pagination.ts    Pagination (max 100, default 20)
  validator.ts     Zod validation middleware
migrations/
  001-initial-schema.ts
scripts/
  entrypoints.sh   Docker entrypoint (migrate + start)
dev_scripts/
  test-webhook.sh  Webhook test script (sends sample data)
```

### 1.3 API Endpoints (/api/v1)

POST /webhook              TTN webhook (Header: X-Downlink-Apikey)
GET  /measurements         Paginated measurements
GET  /measurements/export  CSV export
GET  /log-entries           Paginated log entries
GET  /health                Health check
GET  /docs                  Interactive API docs

### 1.4 Database

measurements: id, device_eui, measurand, unit, datatype, sensor, location, value, time_method, recorded_at, created_at
log_entries:  id, device_eui, message, created_at

### 1.5 Environment Variables

Development (.env):
  DATABASE_URL=postgres://loramint:loramint@localhost:5432/loramint
  TTN_APP_KEY=<key>
  PORT=8090

Production (.env.prod):
  DB_NAME, DB_USER, DB_PASSWORD, TTN_APP_KEY

### 1.6 Development

docker compose -f compose.dev.yml up -d   # Start PostgreSQL
bun install                                # Install dependencies
bun run migrate                            # Run migrations
bun run dev                                # Start server with hot reload

### 1.7 Production

Image is built via GitHub Action (trigger: git tag v*).
compose.prod.yml pulls the image from GHCR.

### 1.8 Dockerfile

Multi-stage Bun build (oven/bun:1):
  1. base: Working directory
  2. install: Dependencies (frozen lockfile)
  3. release: App code + entrypoint
  Runs as user "bun", port 8090.

---

## 2 Current Project: Web UI

### 2.1 Goal
Add a web frontend served from the same Hono server on the same port alongside the existing API.

### 2.2 Tech Stack (Frontend)
- UI: SolidJS (server-side rendered)
- SSR: @valentinkolb/ssr (bridges Hono + SolidJS)
- Styling: TailwindCSS v4 + DaisyUI v5

### 2.3 Implementation Steps
1. Install dependencies (solid-js, @valentinkolb/ssr, tailwindcss, daisyui, bun-plugin-tailwind)
2. SSR configuration + static file serving (config/ssr.ts, public/, serveStatic)
3. Minimal test page (verify SSR works)
4. Shared Layout (header with logo + nav, footer with legal links)
5. Landing Page (logos, description, links, service cards)
6. Legal Pages (Impressum, Datenschutz as templates)
7. Dockerfile + documentation update

### 2.4 New Directory Structure
```
config/
  ssr.ts                    SSR template configuration
public/
  global.css                TailwindCSS + DaisyUI entry point
  logo_loramint.svg         Copied from assets/logo/
  logo_sfz.svg              Copied from assets/logo/
frontend/
  pages/
    index.tsx               Route definitions (Hono router)
    home/page.tsx            Landing page
    impressum/page.tsx       Impressum
    datenschutz/page.tsx     Datenschutz
  components/
    layout/
      Layout.tsx             Shared layout (header + footer)
```

---

## 3 Chat Instructions

### 3.1 At the Start of Every Chat

- Ask the user which language to use for the conversation (German or English).

### 3.2 Key Decisions and Conventions

- Result pattern: Use `MutationResult<T>` for error handling, not exceptions.
- Validation: Zod for request structure, custom validation in services for business rules.
- Database: Use Bun's `sql` template tag, never string concatenation.
- Naming: camelCase in TypeScript, snake_case in database columns. Services handle the mapping.
- New endpoints: Add route in `index.ts`, business logic in `services/`, document with `describeRoute()`.
- New tables: Add migration file in `migrations/`, run `bun run migrate`.
- Dev scripts: Place in `dev_scripts/`.

---

## 4 Web UI Roadmap

### 4.1 Shared Layout
- Header with navigation
- Footer with links to Impressum and Datenschutz
- Used by all pages

### 4.2 Landing Page
- SFZ logo
- Measurement system logo
- Link to API documentation (/api/v1/docs)
- Link to GitHub repository
- Links to future services (add as they become available)

### 4.3 Legal Pages
- Impressum (template, fill in later)
- Datenschutzerklaerung (template, fill in later)
- Linked from footer on every page

### 4.4 Device Overview
- List of all devices (device_eui) that have sent data
- Last measurement timestamp per device
- Total measurement count per device

### 4.5 Filtered Export
- Filter by device, measurand, time range
- Download as CSV

### 4.6 Charts
- Visualize measurements over time
- Filter by device and measurand
