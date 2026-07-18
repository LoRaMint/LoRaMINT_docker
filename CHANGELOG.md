# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.3.0] - 2026-07-18

### Added
- Site favicon: a LoRaMINT icon served as SVG with a 32×32 PNG fallback for
  browsers without SVG-favicon support.

### Changed
- Header navigation groups the `/plots`, `/export` and `/status` pages under a
  single "Daten" dropdown (a no-JS `<details>` menu) instead of separate tabs,
  with a chevron indicator and a high-contrast, brand-coloured panel.
- Header bar uses a slightly stronger background (`base-300`) for better
  contrast against the page content.

## [1.2.0] - 2026-07-18

### Added
- Interactive `/export` page: pick a device, measurand, sensor, location,
  datatype and a time range, see how many measurements match, and download the
  filtered CSV. A configurable UI on top of the existing
  `GET /measurements/export` endpoint (no API change), replacing the raw export
  link on the home page.
- Server-rendered `/status` board: a debugging overview showing the latest
  measurement per device+sensor and the latest log entry per device, each with
  how many rows that group has sent and how long ago it was last seen, ordered by
  most recent activity. Auto-refreshes every 30 seconds; no client bundle. Backed
  by new `measurements.status()` / `logEntries.status()` service queries.
- Interactive `/plots` page: pick a device, measurands, sensors, location and a
  time range to plot measurement series as connected lines with per-point
  markers, rendered client-side with a self-hosted Plotly bundle (no third-party
  requests). Switch between an overlaid multi-axis view and stacked per-measurand
  charts, and export the chart as PNG (1–5× resolution factor) or SVG.
- `GET /measurements/metadata` returns the distinct `device_eui`s, measurands,
  sensors and locations present in the data (optionally narrowed by `device_eui`
  for cascading dropdowns), used to populate the `/plots` and `/export` filters.

## [1.1.0] - 2026-07-12

### Added
- `GET /measurements` and `GET /measurements/export` now accept optional query
  filters (`device_eui`, `measurand`, `sensor`, `location`, `datatype`,
  `from`/`to`) to narrow down results server-side, in preparation for the
  upcoming dashboard.

### Changed
- ESP32 library restructured into a `loramint` package installable via `mip`
  (`mpremote mip install github:LoRaMint/LoRaMINT_docker/packages/esp32`); the API
  import becomes `from loramint import LoRaMINT, MintValue`. Added example
  programs for value, log, temperature, humidity and pressure.

## [1.0.0] - 2026-07-07

### Added
- ESP32 MicroPython library (`packages/esp32`): `LoRaMINT` class with `join()`,
  `sendLog()`, `sendValue()` and a UART connection check via `AT+VER=?`, plus a
  `MintValue` encoder. Port of the Arduino library for ESP32 + Dragino LA66.
- Custom non-commercial `LICENSE`, `plan_v1.md` road-to-1.0 plan and
  `version_meilstones.md` roadmap.
- ESP32 README: LA66 OTAA provisioning section (read the device keys, register
  them in TTN).
- Docker `HEALTHCHECK` for the API image (checks `/api/v1/health`).
- API test suite (`bun test`: validation, pagination, CSV escaping) and a CI
  workflow (`ci.yml`) running typecheck + tests on push/PR.

### Changed
- Unhandled API errors now return a consistent JSON 500 via a global error
  handler instead of leaking internals.
- `packages/arduino` slimmed down: removed the bundled Adafruit libraries and the
  committed `.zip` files (reference them via the Arduino Library Manager /
  Adafruit instead), consolidated the READMEs, and modernized the examples
  (BMP280 detection, 1-minute send interval, cleanup).

### Fixed
- SSR dev overlay no longer leaks into production: dev mode is now opt-in
  (`NODE_ENV === "development"`) instead of "anything but production", so a
  missing or misconfigured `NODE_ENV` falls back to production. The `dev` script
  now sets `NODE_ENV=development` so local development is unaffected, and the
  Docker image defaults to `NODE_ENV=production`.
- ESP32: sending a value or log with non-ASCII characters no longer raises; such
  characters are replaced with `?` instead of crashing mid-send.

### Security
- CSV export now neutralizes spreadsheet formula injection: fields starting with
  `=`, `+`, `-`, `@`, tab or CR are prefixed with a single quote.
- Webhook API key is now compared in constant time (`verifyAppKey`, both sides
  SHA-256 hashed) instead of `!==`, closing a timing side channel.

## [0.1.9] - 2026-06-26

### Changed
- Restructured the repository into a `packages/` monorepo: the API and web
  frontend moved to `packages/api` (self-contained Bun project with its own
  Dockerfile), and the Arduino libraries moved to `packages/arduino`. The Docker
  build context and publish workflow were updated accordingly. No functional
  changes to the API or firmware.

---

Releases up to and including [0.1.8] (2026-05-12) predate this changelog.

[Unreleased]: https://github.com/LoRaMint/LoRaMINT_docker/compare/v1.3.0...HEAD
[1.3.0]: https://github.com/LoRaMint/LoRaMINT_docker/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/LoRaMint/LoRaMINT_docker/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/LoRaMint/LoRaMINT_docker/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/LoRaMint/LoRaMINT_docker/compare/v0.1.9...v1.0.0
[0.1.9]: https://github.com/LoRaMint/LoRaMINT_docker/releases/tag/v0.1.9
