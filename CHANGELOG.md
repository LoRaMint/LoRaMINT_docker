# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- ESP32 MicroPython library (`packages/esp32`): `LoRaMINT` class with `join()`,
  `sendLog()`, `sendValue()` and a UART connection check via `AT+VER=?`, plus a
  `MintValue` encoder. Port of the Arduino library for ESP32 + Dragino LA66.

### Fixed
- SSR dev overlay no longer leaks into production: dev mode is now opt-in
  (`NODE_ENV === "development"`) instead of "anything but production", so a
  missing or misconfigured `NODE_ENV` falls back to production. The `dev` script
  now sets `NODE_ENV=development` so local development is unaffected, and the
  Docker image defaults to `NODE_ENV=production`.

## [0.1.9] - 2026-06-26

### Changed
- Restructured the repository into a `packages/` monorepo: the API and web
  frontend moved to `packages/api` (self-contained Bun project with its own
  Dockerfile), and the Arduino libraries moved to `packages/arduino`. The Docker
  build context and publish workflow were updated accordingly. No functional
  changes to the API or firmware.

---

Releases up to and including [0.1.8] (2026-05-12) predate this changelog.

[Unreleased]: https://github.com/LoRaMint/LoRaMINT_docker/compare/v0.1.9...HEAD
[0.1.9]: https://github.com/LoRaMint/LoRaMINT_docker/releases/tag/v0.1.9
