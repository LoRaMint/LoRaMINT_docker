# Zeitzonen — Konzept der Anzeige

| | |
|---|---|
| **Status** | Geplant, noch nicht umgesetzt |
| **Stand** | 2026-08-08 |
| **Meilenstein** | offen (`version_meilstones.md`) |
| **Geltung** | Alle Zeitangaben der Oberfläche, besonders `/plots` |

Dieses Dokument beschreibt, **wie die Anwendung Zeit anzeigen soll** — nicht, wie
sie es heute tut. Es ist die Vorgabe, gegen die die Umsetzung geprüft wird;
weicht die Implementierung ab, ist entweder das Dokument oder der Code zu
korrigieren, nicht beides stillschweigend auseinanderzulassen.

Schwesterdokumente: `daten-verwalten.md` (1.5), `geraete-verwalten.md` (1.6).

---

## Ausgangslage

Die Anwendung zeigt Zeit auf **drei** verschiedene Arten, und keine davon ist
irgendwo als Entscheidung festgehalten:

| Wo | Was | Beispiel |
| --- | --- | --- |
| Statusseite, Geräteseiten, Geräteprotokoll, Profil | fest `Europe/Berlin` | `8.8.2026, 00:48:02` |
| Verwaltungstabellen, Änderungsprotokoll, SQL-Konsole | rohes `toISOString()` | `2026-08-07T22:48:02.314Z` |
| **Plots** | Plotly bekommt die UTC-Strings roh und rechnet Zeitzonen nicht um | Achse steht auf **UTC** |

Der dritte Punkt ist der Anlass. Die Plot-Achse ist `type: "date"` und bekommt
die Zeitstempel als das, was der CSV-Export liefert: `2026-08-07T22:48:02.314Z`.
Plotly rechnet nicht um. Eine Messreihe, die laut Statusseite um 00:48 ankam,
liegt im Plot also bei 22:48 des Vortags.

Das ist keine fehlende Einstellung, sondern eine stillschweigend falsche — und
weil der Fehler im Winter eine Stunde und im Sommer zwei beträgt, fällt er auch
niemandem durch Gewöhnung auf.

## Die drei Vorgaben

1. **Gespeichert wird immer UTC.** Das ist bereits so und bleibt so.
2. **Angezeigt wird standardmässig in der Zeitzone des Browsers.**
3. **Auf der Plot-Seite ist die Zone umstellbar**, weil ein Plot etwas ist, das
   man vergleicht, exportiert und weitergibt.

Der **CSV-Export bleibt unverändert UTC** (`…Z`). Die Zeitzone ist eine Frage der
Darstellung, nicht der Daten; nachgelagerte Auswertungen sollen nicht brechen.

---

## Zwei Festlegungen, die den Zuschnitt bestimmen

### Bearbeitbare Tabellen behalten UTC-ISO

In `DataTable` ist der angezeigte Zeitstempel zugleich der Inhalt des
Eingabefeldes **und** der `data-previous`-Wert, gegen den `services/manage.ts`
mit `IS NOT DISTINCT FROM $n::timestamptz` auf zwischenzeitliche Änderungen
prüft. Eine lokalisierte Schreibweise müsste Postgres parsen, und die Prüfung
würde bei *jedem* Speichern einen Konflikt melden.

Daraus die Regel: **was man bearbeitet oder maschinell weiterverwendet, bleibt
eindeutig.** Verwaltungstabellen, Änderungsprotokoll und SQL-Konsole werden nicht
angefasst; umgestellt werden nur die reinen Leseansichten.

### Ohne JavaScript steht UTC da, sichtbar beschriftet

Der Server rendert zuerst und kennt die Zeitzone des Browsers nicht. Er schreibt
deshalb die UTC-Zeit mit dem Kürzel dahinter; ein kleines Skript ersetzt sie
durch die Browserzeit und lässt das Kürzel weg. So liest niemand eine Zeit in der
falschen Zone, ohne es zu merken — und die Seite bleibt ohne JavaScript
brauchbar, wie der Rest der Anwendung auch.

---

## Umsetzung

### 1. `lib/time-zone.ts` (neu, rein, testbar)

Ohne Netz und ohne Konfiguration, deshalb direkt testbar wie `lib/ttn-ids.ts`:

- `wallClockIn(iso, timeZone)` — der Zeitpunkt als *naive* Ortszeit
  `YYYY-MM-DDTHH:mm:ss.sss`, gebaut über
  `Intl.DateTimeFormat(…, { timeZone }).formatToParts`. Das ist der Kniff, den
  der Plot braucht: Plotly rechnet nicht um, also muss die Ortszeit schon im
  Wert stecken.
- `formatInstant(iso, timeZone | null)` — die Darstellung für die Leseansichten,
  `de-DE`, mit Zonenkürzel wenn serverseitig gerendert.

### 2. `frontend/components/LocalTime.tsx` (neu)

```tsx
<time datetime={iso} data-local>{formatInstant(iso, "UTC")} UTC</time>
```

Der `datetime`-Wert ist der exakte UTC-Zeitpunkt und bleibt es — daraus rechnet
das Skript, und Vorlesewerkzeuge werten genau dieses Attribut aus.

### 3. Das Skript im Layout

In `frontend/components/layout/Layout.tsx`, neben das vorhandene Inline-Skript
für die Menüs — kein Bundling nötig, und es läuft damit auf jeder Seite. Es sucht
`time[data-local]`, liest `datetime` und schreibt `toLocaleString("de-DE")` ohne
`timeZone`-Option hinein, was genau die Browserzone bedeutet.

### 4. Die Leseansichten umstellen

Das feste `toLocaleString("de-DE", { timeZone: "Europe/Berlin" })` weicht
`<LocalTime iso={…} />`. Immer dasselbe Muster, unter anderem in:

- `frontend/components/status/StatusBoard.tsx`
- `frontend/pages/management/devices-page.tsx`
- `frontend/pages/management/device-page.tsx` (zwei Stellen)
- `frontend/pages/management/device-log-page.tsx`
- `frontend/pages/profile/page.tsx`

### 5. Die Plot-Seite

`frontend/pages/plots/page.tsx` bekommt neben die Filter ein `<select>`,
vorbelegt mit `Intl.DateTimeFormat().resolvedOptions().timeZone`.

`frontend/pages/plots/client.ts`:

- Beim Aufbau der Punkte `wallClockIn(t, zone)` statt des rohen Strings.
- Die gewählte Zone in den Achsentitel: `Zeit (Europe/Berlin)`. Wichtig, weil
  Plots als PNG heruntergeladen werden — ein exportiertes Bild ohne Zonenangabe
  ist später nicht mehr einzuordnen.
- Auswahl in `localStorage` merken, damit sie ein Neuladen übersteht.

Der API-Aufruf bleibt unverändert: `from`/`to` gehen weiter in UTC an den Server.

### 6. Nicht angefasst

Der CSV-Export in `services/measurement.ts`, `DataTable`/`Cell`, die
Verwaltungsseiten und die SQL-Konsole.

---

## Prüfen

1. `bunx tsc --noEmit` und `bun test` — neu `lib/time-zone.test.ts` mit den
   Fällen, die zählen: die Zeitumstellungen in `Europe/Berlin` (2026-03-29 fehlt
   eine Stunde, 2026-10-25 gibt es eine doppelt), eine Zone mit negativem
   Versatz, eine mit halber Stunde (`Asia/Kolkata`) und `UTC` selbst.
2. Statusseite und Geräteseiten stimmen mit der Uhr des Rechners überein. Mit
   abgeschaltetem JavaScript steht dort UTC mit Kürzel.
3. In den Entwicklerwerkzeugen die Zeitzone auf `America/New_York` stellen: alle
   Leseansichten wandern mit, die Verwaltungstabellen bleiben auf UTC-ISO.
4. **Der eigentliche Fehler:** ein Messwert, dessen Zeit auf der Statusseite
   bekannt ist, liegt im Plot an derselben Stelle. Vorher lag er zwei Stunden
   daneben.
5. Umschalten auf `UTC` verschiebt die Kurve sichtbar; der Achsentitel nennt die
   Zone, und ein heruntergeladenes PNG trägt sie mit.
6. Ein Zeitraumfilter über eine Sommerzeitumstellung hinweg zeigt keine Lücke und
   keinen Sprung.

---

## Offene Punkte

- **Umfang der Zonenliste.** Vorgesehen ist eine kurze, kuratierte Auswahl
  (Browserzone, `Europe/Berlin`, `UTC` und einige gebräuchliche) statt aller rund
  400 IANA-Zonen. Wer Messreihen aus anderen Regionen vergleicht, bräuchte die
  vollständige Liste.
- **Wo die Auswahl lebt.** `localStorage` übersteht das Neuladen, steht aber
  nicht in der URL — ein geteilter Plot-Link trägt die Zone also nicht mit.
  Andersherum wäre ebenfalls vertretbar.
- **Zwei Darstellungen bleiben.** Nach dieser Änderung zeigt die Anwendung
  weiterhin Leseansichten in Ortszeit und bearbeitbare Tabellen in UTC-ISO. Das
  ist eine bewusste Regel, aber keine Vereinheitlichung.
