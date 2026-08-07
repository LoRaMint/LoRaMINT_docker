# Daten verwalten — Konzept der Oberfläche

| | |
|---|---|
| **Status** | Umgesetzt in Version 1.5 |
| **Stand** | 2026-08-03 |
| **Meilenstein** | 1.5 „Datenbankzugriff" (`version_meilstones.md`) |
| **Geltung** | `/management/data` und die Unterseiten darunter |

Dieses Dokument beschreibt, **wie sich die Verwaltungsseiten bedienen** — nicht,
wie sie gebaut sind. Es ist die Vorgabe, gegen die die Umsetzung geprüft wird;
weicht die Implementierung ab, ist entweder das Dokument oder der Code zu
korrigieren, nicht beides stillschweigend auseinanderzulassen.

---

## Ausgangslage

`/management/data` war auf `requireRole("management")` gesetzt und rendert nur
`<Planned/>`. Korrekturen an Messdaten liefen ausschließlich über die
SQL-Konsole — nur für die Admin-Gruppe, ohne Protokoll, ohne Sicherheitsnetz.

Ziel war **eine einzige Unterseite pro Datenmenge**, auf der gesucht, geändert
und gelöscht wird; identisch bedienbar für Messwerte, Logeinträge und später
Geräte. `/management/devices` stand zu diesem Zeitpunkt noch auf `<Planned/>`;
die Seite kam mit Meilenstein 1.6 und ist in `geraete-verwalten.md` beschrieben.
Sie folgt diesem Muster bewusst nur zum Teil — ihre Zeilen sind keine
Datenbankzeilen, sondern liegen in The Things Network.

## Die fünf Vorgaben

1. **Umschalter lesen ↔ bearbeiten.** Im Lesemodus ist eine versehentliche
   Änderung technisch unmöglich.
2. **Checkbox links pro Zeile.** Sie bestimmt, welche Zeilen eine Sammelaktion
   trifft — sowohl beim Speichern als auch beim Löschen.
3. **Speichern-Knopf pro Zeile** am rechten Zeilenende, für die einzelne
   Korrektur.
4. **Der Filter bestimmt auch die sichtbaren Spalten.**
5. **Das Änderungsprotokoll bleibt eine eigene, rein lesende Seite.**

---

## Der Seitenaufbau

Eine Unterseite pro Datenmenge, immer derselbe vertikale Aufbau:

```
Titel + ein Satz, worum es geht
Modusleiste       [ Lesen | Bearbeiten ]        Grund-Feld (im Bearbeitungsmodus)
Filterleiste      Filterfelder  ·  „Spalten ▾"  ·  Filtern / Zurücksetzen
Filter-Chips      Gerät: 70B3…1234 ×   Sensor: BME280 ×   Spalten: 5 von 11 ×
Trefferzeile      „412 Treffer — Seite 1 von 21"
Tabelle           ☐ │ Daten… │ [Speichern] [Verlauf]
Aktionsleiste     „3 ausgewählt"  [Auswahl speichern]   [Auswahl löschen] [Alle 412 löschen]
```

**Alles außer dem Grund-Feld steht in der URL** — Filter, Spaltenauswahl,
Sortierung, Seite und der Modus:

```
/management/data/measurements
  ?device_eui=70B3D57ED0001234&sensor=BME280
  &cols=recorded_at,measurand,value,unit,location
  &sort=recorded_at&dir=desc&page=1&edit=1
```

Damit funktionieren Neuladen, Zurück-Button und Lesezeichen ohne Client-Zustand,
und nach jeder Aktion landet man in exakt derselben Ansicht zurück.

### Eine Komponente, drei Ausprägungen

Dieselbe Seite bedient alle Datenmengen; sie unterscheidet sich nur in ihrer
Konfiguration (Spalten, Filter, Fähigkeiten):

| Datenmenge | bearbeitbar | auswählbar | löschbar |
|---|---|---|---|
| Messwerte | ja — Wert, Einheit, Messgröße, Sensor, Ort, Zeitpunkt | ja | ja |
| Logeinträge | ja — nur die Meldung | ja | ja |
| Änderungsprotokoll | nein | nein | nein |

Bei beiden schreibbaren Datenmengen gilt dieselbe Trennung: die **Herkunft** ist
fest, der **Inhalt** ist korrigierbar. Bei einem Messwert sind das Gerät,
Datentyp, Zeitverfahren und Eingang; bei einem Logeintrag das Gerät und der
Eingang. Wer die Herkunft ändern wollte, hat den falschen Datensatz vor sich.

Eine weitere Datenmenge ist danach eine Spalten-, eine Filter- und eine
Fähigkeitenliste.

---

## 1. Der Modusschalter (Vorgabe 1)

Zwei Knöpfe (`join` mit `btn-active` auf dem aktuellen), Standard ist **Lesen**.

**Der Modus ist ein URL-Parameter, keine Client-Umschaltung.** Im Lesemodus
rendert der Server die Zellen als **reinen Text** — es gibt keine Eingabefelder
im Dokument, keine deaktivierten Felder, keine `readonly`-Attribute, die sich in
den Entwicklerwerkzeugen entfernen ließen. Es gibt schlicht nichts anzufassen.
Ebenso wenig gibt es die Speichern-Knöpfe, die Checkboxen und die Aktionsleiste.

Das ist gleichzeitig die Absicherung: die POST-Route prüft die Rolle ohnehin
erneut, aber im Lesemodus entsteht gar nicht erst ein Formular, das sie prüfen
müsste.

Beim Wechsel in den Lesemodus mit ungespeicherten Änderungen fragt der
`beforeunload`-Wächter nach.

## 2. Die Tabelle

- Etablierter Look: `overflow-x-auto rounded-box border border-base-300` +
  `table table-sm table-zebra` (wie `StatusBoard.tsx` und `/sql`).
- **Links die Checkbox** (Vorgabe 2), und im Tabellenkopf an derselben Stelle
  eine **Kopf-Checkbox zum Alle-Auswählen und Alle-Abwählen**:
  - Sie ist ein Umschalter: leer → alle Zeilen der Seite ankreuzen; angekreuzt →
    alle abwählen. Ein Bedienelement, kein Knopfpaar.
  - Sie zeigt drei Zustände. Ist ein Teil der Zeilen ausgewählt, steht sie auf
    `indeterminate` (der waagerechte Strich) — so unterscheidet man „nichts
    ausgewählt" von „einiges ausgewählt" und weiß, was der nächste Klick tut.
  - **Sie wirkt auf die sichtbare Seite, nicht auf alle Treffer.** Das ist die
    Grenze, die man beim Klicken sieht. Für die 412 Treffer gibt es den eigenen
    Knopf in der Aktionsleiste, der seine Zahl im Text trägt.
  - Nach dem Blättern beginnt die Auswahl leer, weil das Formular pro Seite
    abgeschickt wird. Der Zähler in der Aktionsleiste sagt jederzeit, worauf
    sich die Sammelknöpfe beziehen („3 ausgewählt").
  - Sie braucht JavaScript und ist die einzige Stelle, an der ohne JavaScript
    etwas fehlt — die Zeilen-Checkboxen selbst funktionieren weiter, nur das
    Sammelankreuzen entfällt. Reine Bequemlichkeit, kein Funktionsverlust.
- **Mitte: die Daten.** Im Bearbeitungsmodus stehen in den änderbaren Spalten
  Eingabefelder im Stil `input input-sm input-ghost w-full` — rahmenlos, Rand
  erst bei Hover und Fokus. Sonst liest sich eine Tabelle mit 25 × 6 Feldern wie
  ein Formularstapel statt wie Daten.
- Nicht änderbar, auch im Bearbeitungsmodus als Text: `id`, `device_eui`,
  `datatype`, `time_method`, `created_at` — die Herkunft der Messung.
- **Geänderte Zellen werden markiert** (farbiger linker Rand, Titel „vorher:
  235"), sobald sie vom Ausgangswert abweichen. Kosmetik: welche Felder wirklich
  abweichen, entscheidet der Server.
- **Rechts pro Zeile** (Vorgabe 3): `[Speichern]` (`btn btn-xs btn-primary`,
  hervorgehoben sobald die Zeile Änderungen hat) und `[Verlauf]` (`btn btn-xs
  btn-ghost`) — letzterer verlinkt auf das Änderungsprotokoll, gefiltert auf
  genau diese Zeile.
- Spaltenköpfe sind Sortier-Links; Leerzustand als Zeile über die volle Breite.

**Es gibt keine Detailseite pro Datensatz.** Alle Felder sind über die
Spaltenauswahl erreichbar, und der Verlauf hat mit der Protokollseite bereits
einen Ort. Damit bleibt es bei genau einem Schreibpfad — der Tabelle.

## 3. Speichern: eine Zeile oder eine Auswahl

**Zeilenweise** (Vorgabe 3): Der Knopf ist ein Submit-Button mit Namen und Wert,
`<button name="saveRow" value="<uuid>">`. Der Browser sendet nur den *geklickten*
Submit-Button mit — der Server weiß damit ohne eine Zeile JavaScript, welche
Zeile gemeint war. Gespeichert wird **direkt, ohne Zwischenseite**: es ist eine
Zeile, ein ausdrücklicher Klick auf genau diese Zeile, und die Rückmeldung nennt,
was geändert wurde.

**Sammelweise** (Vorgabe 2): `[Auswahl speichern]` schreibt die Änderungen der
**angekreuzten** Zeilen; Änderungen in nicht angekreuzten Zeilen bleiben
unangetastet und stehen nach dem Neuaufbau der Seite nicht mehr da. Da hier
beliebig viele Zeilen betroffen sein können, kommt eine **Bestätigungsseite**,
die ausschließlich die geänderten Zellen auflistet (Zeile, Feld, alt → neu). Bei
drei Zeilen sind das drei Zeilen und ein Klick.

Die Regel dahinter: **eine Zeile mit gezieltem Klick geht direkt, alles
Mengenhafte wird vorher gezeigt.**

**Ein Feld „Grund der Änderung"** in der Modusleiste gilt für das, was in diesem
Zug gespeichert wird, und wandert ins Protokoll.

## 4. Löschen

- `[Auswahl löschen]` (`btn btn-error btn-sm`) — dieselben Checkboxen.
- `[Alle 412 Treffer löschen]` als **getrennter Knopf**: eine fehlerhafte
  Messreihe hat vierhundert Zeilen, die hakt niemand seitenweise an; aber die
  große Aktion darf nie versehentlich aus der kleinen entstehen.
- Beides führt auf eine **Bestätigungsseite mit den betroffenen Zeilen** (die
  ersten 20, dann „… und 392 weitere") — eine Zahl allein überzeugt niemanden
  davon, dass der Filter richtig saß; die Zeilen tun es. Die Zahl steht im
  Knopftext: „412 Messwerte endgültig löschen".
- Löschen speichert nichts mit. Stehen ungespeicherte Änderungen in der Tabelle,
  weist die Bestätigungsseite darauf hin, dass sie verloren gehen. Eine Aktion
  pro Klick.
- Die Löschknöpfe stehen deutlich abgesetzt vom Speichern-Knopf; Rot bedeutet
  auf der Seite genau eine Sache.

**Große Löschungen laufen in Blöcken.** `MANAGE_MAX_DELETE` (Vorgabe 10000) ist
keine Obergrenze, sondern die Blockgröße: eine Löschung über den Filter nimmt so
viele Blöcke, wie sie braucht, jeder als eigene kurze Transaktion. Der Grund ist
die Tabelle — eine einzelne Anweisung über vierhunderttausend Zeilen hält
Sperren auf genau der `measurements`, in die der Webhook schreibt, solange sie
läuft; zwischen den Blöcken sind sie frei.

Zwischen zwei Blöcken steht eine Fortschrittsseite: „30.000 von 412.000
gelöscht", ein Knopf für den nächsten Block, einer zum Anhalten. Mit JavaScript
läuft es von allein weiter, ohne genügt ein Klick je Block — wie überall auf
diesen Seiten ist JavaScript Bequemlichkeit, kein Funktionsverlust.

Alle Blöcke gehören zu **einem** `batch_id`, den der erste eröffnet und die
folgenden mitbekommen: im Protokoll ist es ein Vorgang und als einer
zurückzunehmen. Serverseitig wird nichts gemerkt — Filter, Vorschauzeitpunkt,
Vorgang und der bisherige Stand reisen im Formular. Ein geschlossener Browser
hält die Löschung an, wo sie steht; das Entfernte ist entfernt, protokolliert
und rücknehmbar, der Rest steht noch. Dieselbe Löschung erneut gestartet setzt
schlicht fort, weil die bereits gelöschten Zeilen nicht mehr passen.

Die Bestätigungsseite nennt zusätzlich, wie viele Protokollzeilen entstehen —
eine je gelöschter Zeile, mit Vollabbild. Das ist der Preis der
Rücknehmbarkeit, und er gehört vor die Entscheidung, nicht hinter sie.

## 5. Der Filter — Zeilen und Spalten (Vorgabe 4)

Ein GET-Formular, zwei Bereiche:

- **Zeilenfilter:** für Messwerte Gerät, Sensor, Messgröße, Ort, Zeitraum von/bis
  (dieselben Kaskaden-Selects wie unter „Export", Daten aus
  `measurements.metadata()`). Für Logeinträge Gerät, Zeitraum, Textsuche.
- **Spaltenwahl:** ein `<details>`-Aufklapper „Spalten ▾" mit einer Checkbox je
  Spalte, plus „Alle" / „Standard". Ergebnis landet als `cols=` in der URL. Eine
  Datenmenge definiert ihre Standardspalten; die Herkunftsspalten sind
  standardmäßig aus, weil sie ohnehin nicht änderbar sind.
- Knöpfe **Filtern** (primary) und **Zurücksetzen** (ghost, Link auf die nackte
  URL). Aktive Filter darunter als `badge`-Chips mit „×"-Link, der genau diesen
  einen Parameter entfernt — auch die Spaltenauswahl als ein Chip („Spalten: 5
  von 11").

**Eine ausgeblendete Spalte ist nicht änderbar** und wird beim Speichern nicht
angefasst. Das ist keine Einschränkung, sondern die zweite Hälfte der
Übersichtlichkeit: was nicht auf der Seite steht, kann sie auch nicht ändern.

Zur Einordnung: die Spaltenwahl ist eine **Anzeigehilfe, keine
Sicherheitsgrenze** — sie steht in der URL und wird vom Aufrufer selbst
bestimmt. Was überhaupt änderbar ist, entscheidet die Feld-Whitelist auf dem
Server. Wer die Rolle hat, darf `unit` ändern, ob die Spalte gerade eingeblendet
war oder nicht.

## 6. Das Änderungsprotokoll (Vorgabe 5)

`/management/data/audit`, dieselbe Seitenkomponente ohne Bearbeitungsmodus, ohne
Checkboxen, ohne Aktionsleiste. Filter: Benutzer, Zeitraum, Datenmenge, Aktion
und `row_id` — letzteres ist das Ziel des `[Verlauf]`-Knopfes aus der Tabelle.
Pro Zeile Zeitpunkt, Benutzer, Aktion, Grund; die Feldänderungen als
aufklappbares `<details>` (von → nach).

**Einträge sind in der Anwendung unveränderlich.** Kein Bearbeiten, kein
Löschen, für keine Rolle. Die Regel gehört in die Datenbank: die
Verwaltungsverbindung bekommt auf `audit_log` nur `INSERT` und `SELECT`. Ein
Protokoll, das sich aus derselben Oberfläche aufräumen lässt, die es überwacht,
beweist nichts. Die SQL-Konsole bleibt der Notausgang für den Fall, dass etwas
massiv schiefgelaufen ist — was dort passiert, steht bewusst nicht im Protokoll.

**Die Admin-Rolle kann eine Änderung zurücknehmen** — das ist etwas anderes als
sie zu löschen. Der ursprüngliche Eintrag bleibt unangetastet, die umgekehrte
Operation läuft, und sie wird als eigener Eintrag festgehalten, der über
`reverts_id` auf den zeigt, den er aufhebt. Eine Korrektur, ihre Rücknahme und
die Rücknahme der Rücknahme sind drei Zeilen und eine lesbare Kette.

Zwei Ebenen: die **Übersicht** listet Vorgänge (je `batch_id` eine Zeile) und
nimmt einen Vorgang als Ganzes zurück; die **Vorgangsseite** zeigt die einzelnen
Änderungen darin und nimmt jede für sich zurück. Wer vierhundert Messwerte
gelöscht hat, hat einen Vorgang ausgelöst, keine vierhundert.

Gelesen wird das Protokoll von derselben Rolle, die die Daten darin ändert:
`management`. Zurücknehmen darf nur `admin`. Im Menü steht es unter
„Verwaltung", neben den beiden Seiten, deren Änderungen es festhält.

---

## Durchgehende Bedienregeln

**Rückmeldung immer gleich.** Nach jeder schreibenden Aktion POST → Redirect →
GET auf dieselbe gefilterte URL (kein „Formular erneut senden?" beim Neuladen).
Die Meldung reist als *Code* im Query-String und wird serverseitig auf einen
festen deutschen Satz abgebildet — wie die Fehlercodes auf `/login`; es wird nie
aufrufergesteuerter Text gerendert. Erfolg grün (`border-success/40
bg-success/10`), Fehler als `role="alert"` in `text-error`.

**Nebenläufigkeit.** Jedes Eingabefeld führt seinen Ausgangswert als verstecktes
`prev`-Feld mit; das `UPDATE` nimmt ihn in die `WHERE`-Klausel. Null betroffene
Zeilen heißt nicht „Fehler", sondern „jemand war schneller" — die Seite wird mit
den aktuellen Werten neu aufgebaut und sagt, welche Zeilen betroffen waren. Beim
Löschen über den Filter wird zusätzlich der Vorschauzeitpunkt als obere Grenze
mitgeführt (`created_at <= …`), damit frisch eingegangene Messwerte nicht in eine
Löschung geraten, die sie nie angezeigt hat; weicht die Trefferzahl trotzdem ab,
wird nicht gelöscht, sondern erneut vorgelegt.

**Ohne JavaScript vollständig bedienbar.** Filtern, Spaltenwahl, Blättern,
Sortieren, Moduswechsel, Bearbeiten, Speichern und Löschen sind Formulare und
Links. JavaScript verbessert drei Kleinigkeiten: die „ganze Seite
auswählen"-Checkbox, die Markierung geänderter Zellen und den
`beforeunload`-Wächter.

**Die Oberfläche entscheidet nichts.** Sichtbarkeit ist Kosmetik; jede Route
prüft die Rolle erneut — die Regel, die `Layout.tsx` schon für die Navigation
formuliert. Beim Speichern werden ausschließlich Felder aus einer Whitelist
gelesen; ein untergeschobenes `device_eui` existiert für den Handler nicht.

---

## Routen und Dateien

```
/management/data                            GET   Übersicht (3 Karten)
/management/data/measurements               GET   Suchen · Ändern · Löschen
/management/data/measurements/save          POST  Zeile direkt | Auswahl mit Bestätigung
/management/data/measurements/delete        POST  Bestätigung / Ausführung
/management/data/log-entries                GET   Suchen · Ändern · Löschen
/management/data/log-entries/save           POST  wie oben
/management/data/log-entries/delete         POST  Bestätigung / Ausführung
/management/data/audit                      GET   Vorgänge, nur lesen
/management/data/audit/:batchId             GET   die Änderungen eines Vorgangs
/management/data/audit/revert               POST  nur admin — Bestätigung / Ausführung
/management/devices                         GET   eigenes Konzept, s. geraete-verwalten.md
```

Die beiden schreibbaren Datenmengen teilen sich denselben Satz Routen: sie
werden von `registerResourceRoutes` aus ihrer Ressourcen-Konfiguration erzeugt,
einmal je Spec (`frontend/pages/index.tsx`). Das Änderungsprotokoll hat eigene
Routen, weil es weder speichert noch löscht, sondern zurücknimmt.

Die Bestätigungswege sind bewusst reine POST-Routen mit zwei Zuständen (ohne
`confirm` die Vorschau, mit `confirm=1` die Ausführung) — das Muster aus
`frontend/pages/sql/page.tsx`. Kein GET darauf, weil eine löschende Adresse
sonst im Verlauf, im Prefetch und in fremden `<img>`-Tags landen kann.

```
frontend/pages/management/
├─ routes.tsx                    registerResourceRoutes + registerAuditRoutes
├─ data-page.tsx                 Übersicht (ersetzt den früheren <Planned/>)
├─ devices-page.tsx              damals unverändert; seit 1.6 die Geräteübersicht
├─ resource-page.tsx             DIE Seite — nimmt eine Ressourcen-Konfiguration
├─ resources.ts                  Spalten/Filter/Fähigkeiten je Datenmenge
├─ confirm-save-page.tsx
├─ confirm-delete-page.tsx
├─ confirm-revert-page.tsx
├─ audit-page.tsx                Vorgangsübersicht
├─ audit-batch-page.tsx          die Änderungen eines Vorgangs
├─ audit-labels.ts               Aktion/Datenmenge als deutscher Text
└─ client.ts                     die drei JavaScript-Kleinigkeiten (public/manage.js)

frontend/components/manage/
├─ PageHeading.tsx    die achtfach kopierte h2-Zeile
├─ ModeSwitch.tsx     Lesen/Bearbeiten + Grund-Feld
├─ FilterBar.tsx      Zeilenfilter, Spaltenwahl, Chips
├─ DataTable.tsx      Checkbox-Spalte, Zellen als Text oder Feld, Zeilenaktionen
└─ spec.ts            die Typen, die eine Datenmenge beschreiben
```

Ein eigenes `ConfirmPanel` gibt es nicht: die drei Bestätigungsseiten sind
verschieden genug — geänderte Zellen, zu löschende Zeilen, zurückzunehmende
Vorgänge —, dass eine gemeinsame Komponente nur ein Bündel Flags geworden wäre.

Navigation: im `sections`-Array von `frontend/components/layout/Layout.tsx`
bleibt „Verwaltung → Daten verwalten / Geräte verwalten". Die drei Datenmengen
werden über die Übersichtskarten erreicht, nicht über eine dritte Menüebene;
jede Unterseite hat oben einen Rücksprung „← Daten verwalten".

---

## Festgelegt

- **Umfang**: alle drei Unterseiten (Messwerte, Logeinträge, Änderungsprotokoll).
- **Berechtigung**: `management` darf filtern, bearbeiten und löschen; `admin`
  erbt über die Rollenleiter (`lib/roles.ts`). Route bleibt auf
  `requireRole("management")`.
- **Nachvollziehbarkeit**: Audit-Tabelle, Migration `002`. Der Eintrag wird in
  derselben Transaktion geschrieben wie die Änderung — es kann keine Änderung
  ohne Protokolleintrag geben.
- **Protokoll unveränderlich** in der Anwendung.
- **„Alle Treffer löschen"** als eigener Knopf mit Zeilenvorschau.
- **Bestätigung**: zeilenweises Speichern direkt, Sammelspeichern und jedes
  Löschen mit Vorschau.

## Wie die offenen Punkte gelöst wurden

- **Migrationen.** `migrate.ts` hat weiterhin keine Versionstabelle: jede
  Migration läuft bei jedem Start, also ist jede für sich idempotent
  (`CREATE … IF NOT EXISTS`). `002-audit-log.ts` und `003-audit-revert.ts` sind
  in `migrate.ts` von Hand importiert — die Reihenfolge im Import *ist* die
  Reihenfolge.
- **Cookie-authentifizierte Routen.** Die Verwaltung läuft über die SSR-Routen
  unter `/management/…`, nicht über `/api/v1`: die API authentifiziert
  weiterhin nur per TTN-Key und bleibt davon unberührt.
- **CSRF.** Kein Token, sondern eine `Origin`-Prüfung als Middleware
  (`sameOrigin` in `frontend/pages/index.tsx`) vor jeder schreibenden Route.
  Ein Formular ohne passenden `Origin`-Kopf wird abgewiesen, bevor der Handler
  es sieht.
- **Datenbankrolle.** `loramint_manage`, angelegt und aufgefrischt von
  `scripts/ensure-roles.ts` beim Containerstart (von Hand:
  `dev_scripts/create-manage-role.sql`). `SELECT/INSERT/UPDATE/DELETE` auf
  `measurements` und `log_entries`, auf `audit_log` nur `SELECT` und `INSERT` —
  daher ist das Protokoll aus der Oberfläche heraus nicht zu ändern. Fehlt die
  Rolle, öffnen die Seiten lesend und sagen es.
- **Indizes.** In `002-audit-log.ts` mit angelegt:
  `measurements_device_time_idx` und `measurements_time_idx` auf dem Ausdruck
  `COALESCE(recorded_at, created_at) DESC` — auf demselben, mit dem der
  Zeitfilter rechnet, sonst wird der Index nicht benutzt —, dazu
  `measurements_sensor_idx` und `log_entries_device_idx`. Für die
  Protokollseite und den `[Verlauf]`-Knopf `audit_log_time_idx`,
  `audit_log_row_idx` und `audit_log_batch_idx`, für die Rücknahmekette
  `audit_log_reverts_idx` (Migration `003`).
