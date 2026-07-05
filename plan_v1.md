# Plan V1

Hier wird der Ablaufplan zum Release von Version 1.0 des LoRaMINT-Repos notiert.

## Übersicht

- [ ] 1 – LICENSE finalisieren
- [ ] 2 – Test-Suite + Test-CI
- [x] 3 – esp32: Absturz bei Nicht-ASCII beheben
- [ ] 4 – Docker HEALTHCHECK (Entscheidung offen)
- [x] 5 – Timing-safe Webhook-Key-Vergleich
- [ ] 6 – Globaler Error-Handler (Entscheidung offen)
- [x] 7 – CSV-Formel-Injection beheben
- [x] 8 – LA66-Provisionierung dokumentieren

**Nicht in 1.0 (bewusst verschoben):**
- Rate-Limiting der Datenendpunkte → **1.1**. Öffentlicher Lesezugriff auf
  `/measurements`, `/measurements/export`, `/log-entries` ist gewollt.
- Datenansicht / Dashboard in der Web-UI → **2.0**.

## Punkte im Einzelnen

### Stichpunkt 1 – LICENSE finalisieren

Aktueller Stand: Root-`LICENSE` als Platzhalter angelegt („draft", alle Rechte
vorbehalten). Noch keine echte Lizenz gewählt.

Ziel: Eine finale Open-Source-Lizenz (z. B. MIT / Apache-2.0) festlegen und in
`LICENSE` eintragen. Sublib-Lizenzen unter `packages/arduino` bleiben unberührt.

ToDo:
- Lizenz auswählen (mit Projektbeteiligten abstimmen).
- `LICENSE` mit finalem Text ersetzen.

Erledigt? -> Nein (Platzhalter vorhanden)

### Stichpunkt 2 – Test-Suite + Test-CI

Aktueller Stand: Keine Projekt-Tests. Einziger Workflow ist `publish.yml`
(baut/pusht nur auf Tag). Kein Typecheck-/Test-Lauf bei PRs.

Ziel: Automatisierte Tests + CI, die bei jedem PR laufen.

ToDo:
- API-Tests: Validierung/`ingest`, Pagination, CSV-Export.
- Protokoll-Test: Encode/Decode-Round-Trip (den Wegwerf-Test formalisieren).
- `test`- und `typecheck`-Scripts (`tsc --noEmit`) in `packages/api`.
- CI-Workflow (`.github/workflows/ci.yml`): Typecheck + Tests bei PR/Push.

Erledigt? -> Nein (aufgeschoben – nach den kleineren Punkten)

### Stichpunkt 3 – esp32: Absturz bei Nicht-ASCII beheben

Aktueller Stand: Behoben. `encode("ascii")` warf bei Umlauten/Nicht-ASCII eine
Exception mitten im Senden (`mintvalue.py`, `loramint.py`).

Ziel: Kein Crash bei Nicht-ASCII-Eingaben.

ToDo:
- [x] `encode("ascii", "replace")` in Log-, Feld- und String-Kodierung.

Erledigt? -> Ja

### Stichpunkt 4 – Docker HEALTHCHECK

Aktueller Stand: `/api/v1/health` existiert, wird aber weder im Dockerfile noch
in Compose automatisch geprüft.

Ziel: Container-Gesundheit automatisch erkennen (Restart/Traffic-Steuerung).

ToDo:
- Entscheidung, ob für 1.0 gewünscht (Erklärung erfolgt).
- Falls ja: `HEALTHCHECK`-Instruktion im Dockerfile (z. B. `wget` auf `/health`).

Erledigt? -> Nein (Entscheidung offen)

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

Aktueller Stand: Unerwartete Fehler (z. B. DB nicht erreichbar in `store()`)
werden nicht zentral gefangen → generisches/inkonsistentes 500.

Ziel: `app.onError(...)` fängt alle unbehandelten Fehler, liefert einheitliches
`{ ok: false, error }` (500) und loggt das Original serverseitig.

ToDo:
- Entscheidung, ob für 1.0 gewünscht (Erklärung erfolgt).
- Falls ja: globalen Error-Handler + einheitliches Fehlerformat einbauen.

Erledigt? -> Nein (Entscheidung offen)

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
