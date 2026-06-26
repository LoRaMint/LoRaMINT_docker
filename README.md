# LoRaMINT

IoT platform for LoRaWAN sensors. Sensor nodes send measurement data over
LoRaWAN to The Things Network (TTN), which forwards it via webhook to the
LoRaMINT backend, where it is validated and stored in PostgreSQL.

**Production:** [loramint.sfz-ox.de](https://loramint.sfz-ox.de)

## Architecture

```
Sensor node  ──LoRaWAN──>  TTN  ──webhook──>  LoRaMINT API  ──>  PostgreSQL
(Arduino /                                    (Hono + SSR
 ESP32)                                        web frontend)
```

The sensor firmware encodes a measurement and transmits it via the Dragino LA66
shield. TTN decodes the uplink and POSTs it to `/api/v1/webhook`, where the API
validates and persists it. The same service also serves the web frontend and the
interactive API docs.

## Repository Structure

This is a monorepo. Each package is self-contained and independently usable.

| Package | Description | Docs |
|---------|-------------|------|
| [`packages/api`](packages/api) | Backend API + server-rendered web frontend (Bun, Hono, SolidJS, PostgreSQL). The deployable service. | [README](packages/api/README.md) |
| [`packages/arduino`](packages/arduino) | Arduino library for LoRaMINT sensor nodes (LoRaMINT + Adafruit sensor drivers). | [README](packages/arduino/README.md) |
| [`packages/esp32`](packages/esp32) | MicroPython library for ESP32 sensor nodes. _Planned – not yet implemented._ | – |

Only `packages/api` is a JavaScript/Bun project; the sensor libraries are
plain firmware code with no JS tooling.

## Quick Start

**Run the backend locally** (full instructions in the
[API README](packages/api/README.md)):

```bash
docker compose -f compose.dev.yml up -d   # PostgreSQL (from repo root)
cd packages/api
cp .env.example .env
bun install
bun run migrate
bun run dev                               # http://localhost:8090
```

**Program a sensor node:** see the
[Arduino README](packages/arduino/README.md).

## Production Deployment

The production image is built from `packages/api` via GitHub Action on a git tag
(`v*`) and published to `ghcr.io/loramint/loramint_docker`. Deploy from the
repository root with Docker Compose:

```bash
cp .env.prod.example .env.prod
# Edit .env.prod (DB_NAME, DB_USER, DB_PASSWORD, TTN_APP_KEY)
docker compose -f compose.prod.yml --env-file .env.prod up -d
```

See the [API README](packages/api/README.md#13-production-deployment) for details.

## Tech Stack

Bun, TypeScript, Hono, PostgreSQL, Zod, SolidJS, TailwindCSS v4, DaisyUI v5
(API) · Arduino / C++ (sensor library) · MicroPython (planned).
