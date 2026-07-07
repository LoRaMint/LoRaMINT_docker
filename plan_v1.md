# Plan V1

Hier wird der Ablaufplan zum Release von Version 1.0 des LoRaMINT-Repos notiert.

## Übersicht

- [x] 1 – LICENSE (Custom NC-Lizenz entworfen; Rechtsprüfung empfohlen)
- [x] 2 – Test-Suite + Test-CI (API + CI; esp32-Protokolltest noch offen)
- [x] 3 – esp32: Absturz bei Nicht-ASCII beheben
- [x] 4 – Docker HEALTHCHECK
- [x] 5 – Timing-safe Webhook-Key-Vergleich
- [x] 6 – Globaler Error-Handler
- [x] 7 – CSV-Formel-Injection beheben
- [x] 8 – LA66-Provisionierung dokumentieren

**Nicht in 1.0 (bewusst verschoben):**
- Rate-Limiting der Datenendpunkte → **1.1**. Öffentlicher Lesezugriff auf
  `/measurements`, `/measurements/export`, `/log-entries` ist gewollt.
- Datenansicht / Dashboard in der Web-UI → **2.0**.

## Punkte im Einzelnen

### Stichpunkt 1 – LICENSE

Aktueller Stand: `LICENSE` mit einer **custom, source-available, nicht-
kommerziellen und widerruflichen** Lizenz gefüllt (Copyright: Matthias Ruf).
Erfüllt die drei Vorgaben: (1) NC-Nutzung erlaubt inkl. Bildung/Forschung/
Non-Profit; (2) Fremd-Komponenten unter `packages/arduino` bleiben unter ihren
eigenen Lizenzen; (3) Abschnitt 5 behält dem Lizenzgeber vor, die Lizenz
jederzeit zu ändern/widerrufen (auch für bereits veröffentlichte Versionen) –
die Lizenz ist ausdrücklich nicht unbefristet/unwiderruflich. Attribution
verpflichtend.

Ziel: Rechtsklare Lizenz gemäß den Vorgaben.

ToDo:
- [x] `LICENSE` mit finalem Entwurf ersetzt.
- [ ] **Rechtsprüfung empfohlen** (custom/widerrufliche Lizenz ist ungewöhnlich;
  keine Rechtsberatung durch die Erstellung hier). Ggf. mit SFZ abstimmen.

Erledigt? -> Ja (Entwurf; juristische Freigabe ausstehend)

### Stichpunkt 2 – Test-Suite + Test-CI

Aktueller Stand: API-Testsuite + CI stehen. `bun test` (23 Tests) deckt die
reine Logik ab: `measurements.validate`, `logEntries.validate`, Pagination und
`escapeCsvField` (CSV-Injection). `tsc --noEmit` läuft sauber (0 Fehler; dafür
`@types/babel__core` als devDep ergänzt). CI-Workflow `ci.yml` läuft Typecheck +
Tests bei Push/PR.

Ziel: Automatisierte Tests + CI, die bei jedem PR laufen.

ToDo:
- [x] API-Tests: Validierung, Pagination, CSV-Escaping (`*.test.ts`).
- [x] `test`- und `typecheck`-Scripts in `packages/api`.
- [x] CI-Workflow (`.github/workflows/ci.yml`): Typecheck + Tests bei PR/Push.
- [x] Lokal verifiziert (frozen install, typecheck, 23 Tests grün).
- [ ] Offen: DB-nahe Funktionen (`store`/`list`/`ingest`) via Integrationstest
  mit Test-DB; esp32-Encode/Decode-Round-Trip formalisieren (eigener
  Python-Test, da MicroPython-Toolchain).

Erledigt? -> Ja (Kern: API-Tests + CI; Integrations-/Protokolltests offen)

### Stichpunkt 3 – esp32: Absturz bei Nicht-ASCII beheben

Aktueller Stand: Behoben. `encode("ascii")` warf bei Umlauten/Nicht-ASCII eine
Exception mitten im Senden (`mintvalue.py`, `loramint.py`).

Ziel: Kein Crash bei Nicht-ASCII-Eingaben.

ToDo:
- [x] `encode("ascii", "replace")` in Log-, Feld- und String-Kodierung.

Erledigt? -> Ja

### Stichpunkt 4 – Docker HEALTHCHECK

Aktueller Stand: Erledigt. `HEALTHCHECK` im Dockerfile ruft `/api/v1/health`
via `bun -e fetch(...)` auf (nutzt `bun`, im Image garantiert vorhanden; PORT
aus der Env). Container wird bei wiederholtem Fehlschlag „unhealthy".

Ziel: Container-Gesundheit automatisch erkennen (Restart/Traffic-Steuerung).

ToDo:
- [x] `HEALTHCHECK`-Instruktion im Dockerfile.
- [ ] Offen: realer Build/Health-Status noch nicht via Docker geprüft
  (Daemon lokal aus) – spätestens der Tag-Build testet es.

Erledigt? -> Ja (Docker-Build-Verifikation ausstehend)

### Stichpunkt 5 – Timing-safe Webhook-Key-Vergleich

Aktueller Stand: Behoben. `verifyAppKey()` in `config.ts` vergleicht den Kandidaten
konstant-zeitig gegen `TTN_APP_KEY` (beide Seiten via SHA-256 auf feste Länge
gehasht, dann `timingSafeEqual`). Die Webhook-Route nutzt `verifyAppKey(apiKey)`.

Ziel: Konstant-zeitiger Vergleich des Webhook-Keys.

ToDo:
- [x] `verifyAppKey`-Helper (gehashter, konstant-zeitiger Vergleich).
- [x] Verifiziert: korrekter Key → 400 (Auth ok), falscher/Präfix/fehlender → 401.

Erledigt? -> Ja

### Stichpunkt 6 – Globaler Error-Handler

Aktueller Stand: Erledigt. `app.onError(...)` in `index.ts` fängt alle
unbehandelten Fehler der API-Routen, loggt das Original serverseitig und liefert
einheitlich `{ ok: false, error: "Internal server error" }` (500).

Ziel: `app.onError(...)` fängt alle unbehandelten Fehler, liefert einheitliches
`{ ok: false, error }` (500) und loggt das Original serverseitig.

ToDo:
- [x] Globaler Error-Handler auf der API-App.
- [x] Verifiziert: bei DB-Ausfall liefert `/measurements` JSON-500 statt Leak;
  `/health` bleibt ok.

Erledigt? -> Ja

### Stichpunkt 7 – CSV-Formel-Injection beheben

Aktueller Stand: Behoben. Felder, die mit `= + - @` (oder Tab/CR) beginnen,
könnten in Tabellenprogrammen als Formel interpretiert werden.

Ziel: CSV-Export gegen Formel-Injection absichern.

ToDo:
- [x] `escapeCsvField`-Helper: führendes Sonderzeichen mit `'` neutralisieren
  (`services/measurement.ts`).

Erledigt? -> Ja

### Stichpunkt 8 – LA66-Provisionierung dokumentieren

Aktueller Stand: Erledigt. `packages/esp32/README.md` erklärt jetzt, dass die
LA66 mit gesetzten Keys kommt und man sie nur **auslesen** (`AT+CFG`, `AT+DEUI=?`,
…) und in TTN registrieren muss; `txTimeout`-Hinweis inklusive.

Ziel: Klare Anleitung zur OTAA-Registrierung.

ToDo:
- [x] Provisionierungs-Abschnitt (Query-basiert) in die esp32-README.

Erledigt? -> Ja
