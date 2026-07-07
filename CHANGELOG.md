# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/LoRaMint/LoRaMINT_docker/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/LoRaMint/LoRaMINT_docker/compare/v0.1.9...v1.0.0
[0.1.9]: https://github.com/LoRaMint/LoRaMINT_docker/releases/tag/v0.1.9
