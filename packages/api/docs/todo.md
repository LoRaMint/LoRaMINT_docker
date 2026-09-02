# Offene Punkte

| | |
|---|---|
| **Status** | Rückstand, nichts davon umgesetzt |
| **Stand** | 2026-08-14 |
| **Geltung** | Deployment, Recht, fachliche Nacharbeiten, Aufräumen |

Diese Liste hält den gemeldeten Rückstand fest, damit er nicht in jeder Sitzung
neu rekonstruiert werden muss. Sie beschreibt **was offen ist**, nicht wie es
umgesetzt wird — die Umsetzung wird jeweils gesondert geplant.

Schwesterdokumente: `daten-verwalten.md` (1.5), `geraete-verwalten.md` (1.6),
`zeitzonen.md` (1.7), `benutzereinstellungen.md` (1.7).

---

## 1. Dringend — Deployment und Recht

Der öffentlich laufende Stand ist seit zwei Releases ungepflegt. Diese vier
Punkte gehören zusammen und sollten in einem Rollout erledigt werden.

- **Instanz läuft auf 1.6.1.** Ausstehend sind zwei Releases (1.7, 1.8) mit vier
  Brüchen. Der Sechs-Schritte-Ablauf ist geschrieben, aber nie ausgeführt:
  Hash erzeugen → sichern → Stack umstellen → Teil B eintippen → gegenprüfen →
  Superuser klären.
- **Impressum und Datenschutzerklärung sind produktiv Platzhalter.** Der Text
  liegt in `rechtstexte/` und in `matthias_1_7.env`, eingetragen ist er nirgends.
  Bei öffentlicher Erreichbarkeit ist das unabhängig von allem anderen offen.
- **`SESSION_SECRET` ist verbrannt** — es stand im `docker inspect`. Ein Ersatz
  liegt in `matthias_1_7.env`, ausgerollt ist er nicht.
- **Superuser-Frage offen.** Das Postgres-Image legt `POSTGRES_USER` als
  Superuser an, der Eigentümer ist es also per Konstruktion. Der Gewinn von 1.7
  greift trotzdem — die Anwendung fragt nur noch über die eingeschränkten Rollen
  ab. Eine eigene Eigentümerrolle mit `CREATEROLE` statt Superuser wäre ein
  einmaliger, nicht automatisierter psql-Schritt.

## 2. Fachlich zurückgestellt

- **Designdurchgang mit Claude Design** — ursprünglicher Anlass der
  Bausteinrunde. Das Vorschau-Bündel wurde nie gebaut; das dunkle Theme ist eine
  erste Fassung, gebaut damit es funktioniert, nicht damit es gut aussieht.
- **`audit_log` hat keine Gruppenspalte.** Die Tabelle enthält volle
  Zeileninhalte und ist deshalb auf die Datenrolle beschränkt — Gruppenmitglieder
  sehen die Historie ihrer *eigenen* Messwerte nicht. Saubere Lösung: eine
  Gruppenspalte in `audit_log`.
- **Altbestand eines Geräts nachziehen.** Beim Zuordnen wird bewusst nichts
  rückwirkend geändert. Ob es dafür eine ausdrückliche Aktion geben soll, ist
  nicht entschieden.
- **Plot-Zone in der URL statt im `localStorage`** (aus `zeitzonen.md`). Ein
  geteilter Link trägt die Zone heute nicht mit.
- **Doppelspurigkeit Leseansicht = Ortszeit / editierbare Tabellen = UTC-ISO**
  (aus `zeitzonen.md`). Bewusst so gebaut; als Entscheidung festgehalten, nicht
  als Mangel.

## 3. Aufräumen

- **`version_meilstones.md` ist bei 1.8 falsch.** Dort steht „lesen und ändern
  nur mit Rolle **und** Gruppe"; tatsächlich genügt die Gruppenzugehörigkeit
  allein. So widerspricht die Meilensteintabelle der übrigen Doku.
- **Lokale Branch-Reste**, nichts davon gepusht: `backup/vor-datei-entfernung`,
  `backup-v1.8.0`, `backup/vor-historien-umschreibung`, `backup/v1.6.0`,
  `feature/geraeteverwaltung`, `backup/v1.6.1` sowie zwei `refs/original/…`.
  Die ersten beiden `refs/original/`-Einträge enthalten noch
  `matthias_compose_1_7.yml` — solange sie liegenbleiben, wären sie beim
  nächsten `filter-branch --all` wieder dieselbe Falle.
- **`matthias_1_7.env`** heißt nach dem 1.8-Release irreführend. Inhaltlich
  ändert sich nichts, nur der Name.
- **Fünf Testgeräte** liegen weiterhin in der TTN-Application `test-loramint`.

---

## Priorität

Rechtstexte und Deployment zusammen: öffentlich laufender Stand, seit zwei
Releases ungepflegt, Platzhalter in den Rechtsseiten, offengelegtes
Sitzungsgeheimnis. Alles andere kann warten.
