# Repo-Umstrukturierung – Umsetzungsplan

Ziel: Das bestehende Repo so umbauen, dass die **Web/API-Schnittstelle**
sauber von den **Sensor-Libraries (Arduino)** getrennt ist – ohne
Funktionalität zu verändern.

**Ansatz:** Klare Ordner-Trennung unter `packages/`, **kein Bun-Workspace**.
Da aktuell nur **ein** Package (`api`) echte JS-Dependencies hat, bringt ein
Workspace keinen Nutzen, sondern nur die „Lockfile-im-Root + Docker-Context"-
Komplexität. `packages/api` bleibt daher ein **eigenständiges Bun-Projekt**
mit eigener `package.json` und eigener `bun.lock`.

> Ein echter Bun-Workspace wird erst dann eingeführt, wenn ein **zweites**
> JS-Package (z. B. das SDK aus Phase 6) hinzukommt, das Code/Typen mit der
> API teilen soll. Siehe Phase 6.

## Zielstruktur

```
loramint/
├── packages/
│   ├── api/                  # Eigenständiges Bun-Projekt (Backend + SSR-Frontend)
│   │   ├── index.ts
│   │   ├── config.ts
│   │   ├── types.ts
│   │   ├── migrate.ts
│   │   ├── preload.ts
│   │   ├── config/           # ssr.ts
│   │   ├── frontend/         # SolidJS pages/components/styles
│   │   ├── lib/
│   │   ├── services/
│   │   ├── migrations/
│   │   ├── public/
│   │   ├── scripts/
│   │   ├── package.json      # eigene Deps
│   │   ├── bun.lock          # ← liegt beim Code
│   │   ├── bunfig.toml
│   │   ├── tsconfig.json
│   │   └── Dockerfile
│   │
│   ├── arduino/              # Arduino-Libraries (nur Dateien, kein Bun)
│   │   ├── LoRaMINT/
│   │   ├── Adafruit_BME280_Library/
│   │   ├── Adafruit_BusIO/
│   │   ├── Adafruit_Unified_Sensor/
│   │   └── README.md
│   │
│   └── esp32/                # MicroPython-Lib (vorerst LEER, kommt später)
│       └── .gitkeep
│
├── docs/                     # zentrale Doku + Diagramme
├── compose.dev.yml
├── compose.prod.yml
└── README.md                 # Root: nur Übersicht/Verweise
```

---

## Vorgehen in Phasen

Jede Phase ist ein eigener, in sich lauffähiger Schritt mit einem Commit.
Nach jeder Phase muss das Projekt weiterhin baubar/lauffähig sein.

### Phase 0 – Vorbereitung & Baseline
- [ ] Aktuellen Stand verifizieren: `bun install`, `bun run dev`, Health-Check
      (`curl /api/v1/health`) erfolgreich → als Referenz dokumentieren.
- [ ] Branch `feature/monorepo-restructure` ist aktiv (erledigt).
- [ ] Diese Datei (`monorepo_plan.md`) als Fortschritts-Tracker nutzen.

### Phase 1 – Ordnergerüst anlegen
- [x] Verzeichnisse `packages/api/`, `packages/arduino/` und `packages/esp32/`
      anlegen.
- [x] `packages/esp32/.gitkeep` anlegen → leerer Platzhalter für die spätere
      MicroPython-Lib (wird erst später programmiert, jetzt nur reservieren).
      (`.gitkeep` auch in `api/` und `arduino/`, bis Code einzieht.)
- [x] Noch **kein** Code verschoben → Struktur steht, alles baut wie bisher.
- [x] (Kein Root-`package.json`/Workspace – bewusst ausgelassen.)

### Phase 2 – API als eigenständiges Projekt nach `packages/api/`
- [x] Code nach `packages/api/` verschieben (git mv, History erhalten):
      `index.ts`, `config.ts`, `types.ts`, `migrate.ts`, `preload.ts`,
      `config/`, `frontend/`, `lib/`, `services/`, `migrations/`,
      `public/`, `scripts/`.
- [x] **Mitverschieben** (NICHT im Root lassen): `package.json`, `bun.lock`,
      `bunfig.toml`, `tsconfig.json`.
- [x] Relative Import-Pfade geprüft – funktionieren unverändert (alles
      zusammen verschoben).
- [x] `.gitignore` angepasst: `public/global.css` → `**/public/global.css`
      (Pfad-Anker greift sonst nach dem Verschieben nicht mehr).
- [x] Verifiziert: `bun install` + `bun run scripts/build-css.ts` + Server-Start
      aus `packages/api/` → `/api/v1/health` ok, `/api/v1/docs` 200, SSR `/` 200.
- [ ] **Offen (Phase 5):** `.env` liegt noch im Root → Bun lädt es nicht aus
      `packages/api/`. Für Dev muss `.env` mitziehen oder compose-Pfade anpassen.

### Phase 3 – Arduino-Libraries nach `packages/arduino/`
- [x] `arduino/*` nach `packages/arduino/` verschieben (git mv, inkl. ZIPs);
      altes `arduino/` + `.gitkeep` entfernt.
- [x] Root-README-Pfade von `arduino/` → `packages/arduino/` aktualisiert
      (Verify: keine Alt-Verweise mehr via git grep).
- [ ] ZIP-Erzeugung dokumentieren/automatisieren (optional Script) – offen,
      ggf. Phase 5.
- [x] **Keine** `package.json` nötig (kein Bun/JS hier).

### Phase 4 – Docker & CI anpassen
- [x] `Dockerfile` per git mv nach `packages/api/Dockerfile` (Inhalt **unverändert** –
      COPY-Pfade stimmen, da Context = `packages/api`).
- [x] **Build-Context = `packages/api`** (nicht Root!). Dadurch liegt
      `bun.lock` direkt im Context → COPY-Pfade im Dockerfile bleiben unverändert.
- [x] `packages/api/.dockerignore` ergänzt (node_modules, .env, generierte
      `public/global.css` etc. raus aus dem Context).
- [x] `.github/workflows/publish.yml` angepasst: `context: packages/api`,
      `file: packages/api/Dockerfile`.
- [x] `compose.prod.yml` (nutzt fertiges Image, kein `build:`) und
      `compose.dev.yml` (nur Postgres) geprüft → keine Pfadänderung nötig.
- [x] Lokaler Docker-Build erfolgreich
      (`docker build -f packages/api/Dockerfile packages/api`); Container-Smoke-Test:
      `/api/v1/health` ok, `/api/v1/docs` 200.

### Phase 5 – Doku & Aufräumen
Aufgeteilt in Zwischenschritte 5.1–5.6.

- [x] **5.1 `.env`-Handling:** `.env` + `.env.example` → `packages/api/`
      (Bun lädt `.env` aus CWD); `.env.prod.example` + `matthias.env` (Prod-
      Credentials) bleiben Root bei `compose.prod.yml`. `matthias.env` ist
      nicht getrackt / nie committed (verifiziert).
- [x] **5.2 `packages/api/README.md`** aus Root-Abschnitten 1+2 (Pfade
      angepasst); `dev_scripts/` als Phase-2-Nachzügler nach `packages/api/`.
- [x] **5.3 `packages/arduino/README.md`** aus Root-Abschnitt 3 (package-relativ).
- [x] **5.4 Root-`README.md`** zu Monorepo-Übersicht umgeschrieben
      (Architektur-Diagramm, Package-Tabelle, Quick-Start, Deploy-Kurzabschnitt).
- [x] **5.5 `docs/` → `packages/api/docs/`** (API/TS-bezogen); `diagrams/`
      unangetastet (gitignored, lokales Python-Analyse-Tool).
- [x] **5.6 Aufräumen:** verwaistes Root-`node_modules/` gelöscht;
      `monorepo_plan.md` bleibt im Root (Umbau-Protokoll). Finaler E2E-Check:
      Server bootet aus `packages/api/`, `/health`, `/docs`, `/`, `/openapi.json`
      alle 200/ok.

### Phase 6 (später) – esp32 MicroPython-Lib befüllen
- [ ] `packages/esp32/` mit der eigentlichen MicroPython-Lib füllen
      (Ordner existiert bereits aus Phase 1 als `.gitkeep`-Platzhalter).
- [ ] `.gitkeep` entfernen, sobald echte Dateien vorhanden sind.
- [ ] Eigene `README.md` mit Installations-/Flash-Anleitung.
- [ ] **Kein Bun/JS** – analog zu `arduino/` reine Lib-Dateien.
- [ ] Erst angehen, wenn die Lib programmiert wird.

### Phase 7 (optional, später) – SDK + ggf. Workspace
- [ ] `packages/sdk/` als TypeScript-Client für die API anlegen
      (generiert aus `openapi.json`).
- [ ] **Erst jetzt** lohnt sich ein Bun-Workspace, wenn SDK ↔ API Typen/Code
      teilen sollen: Root-`package.json` mit `"workspaces": ["packages/*"]`,
      `bun.lock` wandert ins Root, Docker-Context dann auf Root + `.dockerignore`.
      (Hinweis: `arduino/` und `esp32/` sind keine JS-Packages und bleiben vom
      Workspace unberührt.)
- [ ] Nur anfangen, wenn konkreter Bedarf besteht.

---

## Wichtige Prüfpunkte (Definition of Done je Phase)
1. `cd packages/api && bun install` läuft fehlerfrei.
2. `bun run dev` startet den Server.
3. `curl http://localhost:8090/api/v1/health` → `{"status":"ok"}`.
4. `/api/v1/docs` lädt (SSR + Scalar funktionieren).
5. Docker-Build erfolgreich (`docker build packages/api`).
6. Git-History der verschobenen Dateien bleibt erhalten (`git mv`).

## Risiken / Achtung
- **Bun-Preload & SSR-Plugin**: `bunfig.toml` `preload`-Pfad muss relativ
  zum (mitverschobenen) `bunfig.toml` stimmen.
- **TailwindCSS-Build** (`scripts/build-css.ts`): Pfade zu `public/` und
  `frontend/styles` prüfen.
- **Docker COPY-Pfade**: häufigste Fehlerquelle – durch Context = `packages/api`
  aber minimiert.
- **CI-Tags** (`v*`): Release-Flow bleibt unverändert, nur `context` + `file`.
- **`.env` / compose**: Pfade nach dem Verschieben prüfen.

---

## Fortschritt
- [x] Phase 0 – Branch erstellt
- [x] Phase 1 – Ordnergerüst
- [x] Phase 2 – API nach `packages/api/`
- [x] Phase 3 – Arduino nach `packages/arduino/`
- [x] Phase 4 – Docker & CI
- [x] Phase 5 – Doku & Aufräumen
- [ ] Phase 6 – esp32 MicroPython-Lib befüllen (später)
- [ ] Phase 7 – SDK + ggf. Workspace (optional)
