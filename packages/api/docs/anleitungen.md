# Anleitungen schreiben und Dateien verwalten

| | |
|---|---|
| **Gilt ab** | 1.16.0 |
| **Rolle** | `editor` (Administratoren haben sie) |
| **Seiten** | `/management/anleitungen`, `/management/dateien` |
| **Öffentlich** | `/anleitungen`, `/anleitungen/<pfad>`, `/downloads`, `/paket/<ordner>` |

Schwesterdokumente: `daten-verwalten.md` (1.5), `geraete-verwalten.md` (1.6),
`konfiguration-verwalten.md` (Rechtsseiten, deren Text aus der
Einstellungstabelle kommt — dasselbe Muster, das die Anleitungen jetzt
verlassen haben). Das Aussehen regelt `guidelines/design/design-system.md`.

## Was sich geändert hat

Anleitungen entstanden bisher im Code. Die Workshop-Seite war **eine**
Einstellung (`CONTENT_WORKSHOP`), die ESP32-Anleitung waren 433 Zeilen
handgeschriebenes JSX. Eine neue Anleitung hiess damit: eine neue Version der
Webseite, ein Release, ein Deployment.

Das ist vorbei. Anleitungen werden auf der laufenden Seite geschrieben, in einem
Baum angelegt und verschoben, und die Dateien dazu liegen in **einer**
Verwaltung mit Ordnern.

Drei Zusicherungen von früher gelten nicht mehr, und das ist jedes Mal Absicht:

| Früher | Jetzt |
|---|---|
| Die Navigation war ein festes, zweistufiges Array | Der ganze Baum, verschachtelt, aus der Datenbank |
| `/downloads/:name` war **ein** Pfadsegment – Unterordner waren nicht verboten, sondern unmöglich | Beliebig tiefe Pfade, abgesichert durch drei Prüfungen (siehe unten) |
| Eine hochgeladene Datei erschien sofort öffentlich, ausser sie wurde ausgeblendet | Nichts erscheint, bis es **freigeschaltet** wird |

`CONTENT_WORKSHOP` gibt es nicht mehr. Eine alte Zeile in der
`settings`-Tabelle stört nicht – sie wird beim Start als unbekannt gemeldet und
ignoriert –, aber sie tut auch nichts mehr. Der Text gehört von Hand in eine
neue Anleitungsseite (siehe „Bestand übernehmen").

---

## 1 · Der Baum

Eine Anleitung ist eine Seite mit einer Adresse. Die Adresse ergibt sich aus dem
Weg durch den Baum:

```
/anleitungen                     die selbst geschriebene Übersicht
/anleitungen/workshop            ein Thema
/anleitungen/workshop/tag-3      eine Unterseite
```

**Höchstens fünf Ebenen** (`MAX_DEPTH` in `lib/guide-tree.ts`). Die Daten
liessen mehr zu; das Kopfmenü rendert den ganzen Baum, und auf einem Handy ist
eine fünfte Verschachtelung eine Einrückung über den Bildschirmrand hinaus. Die
Grenze steht deshalb im Dienst und nicht in der Anzeige: sie ist ein Satz unter
dem Feld, keine Seite, die kaputt aussieht.

**Eine Seite unter eine ihrer eigenen Unterseiten zu hängen, wird abgelehnt.**
Das ist die eine Regel, die keine Datenbank-Bedingung sein kann – ein
Fremdschlüssel kennt eine Kante, keine Kette – und die alles darunter auf einmal
zerlegt: die Elternkette würde zum Ring, und das Menü rendert, bis der Stack
voll ist.

### Anlegen, verschieben, sortieren

Alles auf `/management/anleitungen`, alles mit Formularen: **ohne JavaScript
vollständig bedienbar**. Verschieben ist ein Auswahlfeld und ein Knopf, nicht
ein Ziehen mit der Maus – schöner wäre Ziehen, aber ohne Maus unmöglich, und die
Regel in diesem Projekt ist, dass eine Seite mit Formularen allein benutzbar
bleibt.

### Entwurf und veröffentlicht

Eine neue Seite ist **immer** ein Entwurf. Ein Entwurf

- steht in keinem Menü,
- antwortet für alle anderen mit **404** (nicht 403: „gibt es, darfst du aber
  nicht" ist mehr, als ein anonymer Besucher wissen muss),
- ist für Bearbeiter sichtbar, mit einem Hinweis darüber.

Eine **veröffentlichte Unterseite unter einem unveröffentlichten Thema** ist
erreichbar, erscheint aber nicht im Menü. Das ist kein Versehen: `treeOf` lässt
ein Kind fallen, dessen Elternteil herausgefiltert wurde, statt es an die Wurzel
zu heben – sonst würde eine Unterseite ihr Thema mitveröffentlichen.

### Alte Adressen

Umbenennen und Verschieben ändern die Adresse – die der Seite **und die jeder
Unterseite**. Jede davon wird gemerkt und leitet ab sofort dauerhaft (301) auf
die neue um. Ein gedrucktes Arbeitsblatt zeigt also nicht ins Leere.

Die Liste wächst mit jeder Umbenennung und steht unten auf
`/management/anleitungen`. Einträge sind winzig; wer eine Adresse für eine neue
Seite freigeben will, entfernt sie dort.

### Die Übersichtsseite

`/anleitungen` ist **selbst eine Anleitung**, angelegt auf oberster Ebene mit
der Adresse `uebersicht`. Keine erzeugten Kacheln: eine gemachte Übersicht kann
sagen, welche Anleitung man zuerst liest, eine erzeugte kann nur das Menü
wiederholen.

Solange es sie nicht gibt, listet `/anleitungen` die Themen und sagt
Bearbeitern, wie die Seite entsteht.

---

## 2 · Was in einer Anleitung stehen darf

Markdown, in der Teilmenge aus `lib/markdown.ts`. **Escapt wird zuerst, Markup
entsteht danach** – ein `<script>` im Feld kommt als die fünf Zeichen heraus,
die jemand getippt hat. Diese Seiten sind öffentlich; das ist die
Sicherheitseigenschaft, und jeder Baustein hält sich daran.

Über die Rechtsseiten hinaus gibt es hier:

| Was | Schreibweise |
|---|---|
| Codeblock mit Kopier-Knopf | ` ```python ` … ` ``` ` |
| Tabelle | `\| a \| b \|` mit `\|---\|---\|` darunter |
| Bild | `![Beschreibung](/downloads/bild.png)` |
| Bildunterschrift | `![alt](/downloads/bild.png "Die Unterschrift")` |
| Hinweiskasten | `> Text` |
| Aufklapp-Abschnitt | `:::klapp Häufige Probleme` … `:::` |
| Anker auf jeder Überschrift | `## Aufbau` → `[dorthin](#aufbau)` |

Ein paar Feinheiten, die man sonst selbst herausfinden müsste:

- **Bildunterschrift nur auf einer eigenen Zeile.** Steht das Bild mitten im
  Satz, wird die Unterschrift ein `title` (Tooltip) statt einer `<figcaption>`.
  Grund: `<figure>` darf nicht in einem `<p>` stehen, und ein Browser schliesst
  den Absatz sonst still – das Dokument bekäme eine andere Form, als es gelesen
  wird.
- **Der Aufklapp-Abschnitt überlebt Leerzeilen und Codeblöcke.** Ein `:::` *in*
  einem Codeblock beendet ihn nicht.
- **Bilder nur von diesem Server.** Ein `<img>` wird ohne Klick geladen, eine
  fremde Quelle schickte die IP-Adresse jedes Besuchers an einen Dritten.
- Ein vergessenes `` ``` `` oder `:::` beendet das Dokument, statt den Rest zu
  verschlucken – der schlechteste Moment für eine verschwindende Seite ist der,
  in dem man sie schreibt.

Der **Kopier-Knopf** an Codeblöcken und die **Lightbox** an Bildern kommen von
`/public/guides.js` und gelten auf jeder Anleitung, auch in der Vorschau. Ohne
JavaScript fehlt beides und sonst nichts.

### Vorschau

Der Knopf „Vorschau" schickt den Text zum Server und rendert ihn, ohne ihn zu
speichern. Ein Textfeld sagt nicht, ob eine Trennzeile richtig war; der Umweg
lohnt sich deshalb. Was im Feld steht, bleibt dabei stehen – gespeichert ist
weiterhin nichts.

---

## 3 · Dateien

Eine zentrale Verwaltung unter `/management/dateien`, **mit beliebig tiefen
Ordnern**, und dieselbe Ansicht noch einmal am Fuss jedes Anleitungs-Editors.
Der Grund für das Doppelte: die Adresse einer Datei ist das, was in den Text
geschrieben wird, also muss die Liste in Reichweite sein – gehören tut sie aber
zu keiner einzelnen Anleitung.

Die Spalte **Im Text** im Editor zeigt den fertigen Markdown-Schnipsel zum
Kopieren. Ein Bild wird eingebunden, alles andere verlinkt.

### Freischalten

**Nichts erscheint auf `/downloads`, bis es freigeschaltet wird.** Die Vorgabe
hat sich umgedreht: mit einem Baum aus Arbeitsmaterial sind Zwischenbilder,
Entwürfe und Fotos der Normalfall und ein öffentliches Regal die Ausnahme.

**Freischaltung ist kein Zugriffsschutz.** Eine nicht freigeschaltete Datei
bleibt unter ihrer Adresse erreichbar – sie muss es, sonst verschwände ein im
Text eingebundenes Bild. Wer die Adresse kennt, kommt an die Datei. Es geht um
die Liste, nicht um den Zugriff.

### Umbenennen und Verschieben

Beides ändert die Adresse, und **nichts leitet weiter** – anders als bei den
Anleitungsseiten. Jeder Link auf die alte Adresse geht ins Leere: in einer
Anleitung, in einer verschickten Mail, auf einem gedruckten Blatt. Die Endung
bleibt, weil sie entscheidet, wie der Server die Datei ausliefert; aus
`skript.py` kann kein `bild.png` werden.

Einen Ordner umzubenennen ändert die Adresse **jeder Datei darin**. Hinweis und
Freischaltung ziehen mit um – sonst verschwände eine freigeschaltete Datei beim
Umbenennen aus der öffentlichen Liste.

### Ordner löschen

Nur leere. `rmdir` weigert sich bei Inhalt, also ist die Zusage die des Kernels
und nicht eine Liste, die einen Moment vorher gelesen wurde. Absichtlich nicht
rekursiv: ein Klick soll kein Semester Material mitnehmen können.

### Das Paket

Je Ordner ein ZIP unter `/paket/<ordner>`, auf der Downloadseite als Knopf.
Enthalten ist genau, was **freigeschaltet** ist, Unterordner eingeschlossen, mit
der Struktur darin. Die Downloadseite ist öffentlich; ein Umweg über das Paket
darf die Freischaltung nicht aushebeln.

Eine eigene Adresse und nicht `/downloads/<ordner>.zip`: `loramint.zip` ist eine
echte hochgeladene Datei, die beiden Adressen würden auf einem Ordner namens
`loramint` kollidieren.

Über 50 MB (`MAX_PACKET_BYTES`) wird abgelehnt statt gepackt – `zipSync` baut
das Archiv im Speicher, und ein Klick soll kein Speicherproblem sein. Abgelehnt
mit einem Satz, nicht stillschweigend gekürzt: ein ZIP ohne die Datei, für die
jemand gekommen ist, ist schlechter als kein ZIP.

---

## 4 · Der eine Punkt, an dem es gefährlich wird

`/downloads/<pfad>` ist die Stelle, an der aus „Ordner erlauben" „Dateisystem
öffentlich" würde. Früher trug sie eine Zusicherung der Routenform: ein
Pfadsegment, also war ein Unterverzeichnis nicht verboten, sondern unmöglich.
Die ist weg. An ihrer Stelle stehen **drei Prüfungen, die verschieden
scheitern**:

| Prüfung | Entscheidet nach | Fängt |
|---|---|---|
| `isSafePath` (`lib/uploads.ts`) | **Form** – jedes Segment muss in den erlaubten Zeichensatz passen | `..`, führender Punkt, Backslash, jede prozentkodierte Schreibweise |
| `resolveInUploads` (`services/uploads.ts`) | **Ort** – wohin der String wirklich zeigt | alles, was die Form überlebt und trotzdem hinausführt |
| `lstat` (`services/downloads.ts`) | **Art** – ein Symlink ist keine reguläre Datei | einen von Hand ins Volume gelegten Link, dessen Pfad völlig harmlos aussieht |

Dazu, unverändert: der Content-Type kommt aus unserer Tabelle und nie aus der
Datei, nur die Endungen in dieser Tabelle werden überhaupt ausgeliefert, und
`nosniff` steht auf jeder Antwort. Eine von Hand ins Volume kopierte
`evil.html` ist ein 404.

**Der Pfad wird nicht dekodiert.** `c.req.path` wird genommen, wie er ankam:
`..%2f..%2fetc` ist damit *ein* Segment mit einem Prozentzeichen darin und
scheitert sofort, statt vorher in ein echtes `../../etc` verwandelt zu werden.
Eine benannte Route (`:pfad{.+}`) gäbe den Wert dekodiert zurück – deshalb wird
er dort nicht gelesen.

**`{.+}` und nicht `*`.** Ein blosses `*` passt auch auf den leeren Rest, also
hätte `/downloads/*` auch `/downloads` beantwortet – und das ist die
Übersichtsseite. Dasselbe gilt für `/anleitungen`: dort kommt hinzu, dass Hono
einer `*`-Route gar keinen Parameter zum Auslesen gibt, der Handler also
stillschweigend einen leeren Pfad sähe und jede Anleitung mit 404 beantwortete.

---

## 5 · Routenreihenfolge

**Hono nimmt die erste passende Route.** Das ist in dieser Ecke zweimal eine
Falle, und beide Male ohne Fehlermeldung – nicht ein 404, sondern die falsche
Seite, einwandfrei gerendert.

| Platzhalter | Muss stehen nach |
|---|---|
| `/anleitungen/:pfad{.+}` | der Übersicht und den beiden alten Adressen; danach wird gar nichts mehr registriert |
| `/management/anleitungen/:id` | `/new`, `/move`, `/order`, `/delete`, `/forget` |

`guides-routes.test.ts` prüft beides, so wie `devices-routes.test.ts` das
für `/photo` gegen `/:deviceId` tut. Der Test liest die Dateien als Text – grob,
aber er überlebt jede Umformatierung und prüft genau das, was sonst niemand
bemerkt.

---

## 6 · Wie die Navigation an den Baum kommt

`Layout()` ist eine synchrone Solid-Komponente und **kann die Datenbank nicht
fragen**. Das Menü wird auf jeder Seite gerendert; eine Abfrage darin läge auf
dem ruhigsten Pfad der Anwendung.

Der Baum liegt deshalb wie die Einstellungen in einem Modul-Cache
(`lib/guide-store.ts`), gefüllt beim Start, per Middleware aufgefrischt, wenn er
älter als fünf Sekunden ist, und nach jedem Schreibvorgang direkt neu geladen.
Eine gerade veröffentlichte Seite steht also beim nächsten Aufruf im Menü.

Nur die **Form** des Baums liegt im Cache. Der **Text** einer Anleitung wird pro
Aufruf gelesen: er ist das einzige grosse Feld, wird nur von der einen Seite
gebraucht, die ihn zeigt, und machte den Cache sonst zu einer Kopie der Tabelle
statt zu einem Index darauf.

---

## 7 · Bestand übernehmen

**Es gibt keine Migration der Inhalte.** Workshop-Text und ESP32-Anleitung
werden von Hand als Anleitungsseiten neu angelegt. Für eine Handvoll Seiten ist
Migrationscode, der genau einmal läuft und danach für immer im Repository
steht, der teurere Weg.

Empfohlene Adressen, weil die alten Adressen genau dorthin umleiten:

| Alte Adresse | Neue Adresse | Slug |
|---|---|---|
| `/workshop` | `/anleitungen/workshop` | `workshop` |
| `/guides/esp32` | `/anleitungen/esp32` | `esp32` |

Wer andere Slugs vergibt, muss die beiden Zeilen in
`frontend/pages/index.tsx` anpassen – sie stehen dort als Liste beieinander.

Der alte Workshop-Text steht noch in der `settings`-Tabelle und lässt sich
herausholen:

```bash
docker compose -f compose.prod.yml exec -T db \
  psql -U "$DB_USER" "$DB_NAME" -t -A \
  -c "SELECT value FROM settings WHERE key = 'CONTENT_WORKSHOP'" > workshop.md
```

Danach kann die Zeile weg:

```sql
DELETE FROM settings WHERE key = 'CONTENT_WORKSHOP';
```

Die ESP32-Anleitung liegt als Markdown in
[`anleitungen/esp32.md`](anleitungen/esp32.md) – dieselben Inhalte wie die alte
JSX-Seite, in der erweiterten Markdown-Syntax. Zum Einfügen in den Editor
gedacht, nicht zum Ausliefern.

Die Bilder und Beispielprogramme der ESP32-Anleitung liegen weiterhin unter
`/public/guides/esp32/` und werden von `bun run sync-guide-assets` aus
`packages/esp32` erzeugt. Sie müssen **nicht** hochgeladen werden – die
Anleitung verlinkt sie unter ihren bisherigen Adressen.

---

## 8 · Was beim Deployment dazukommt

Migration `013-anleitungen.ts` legt `guides` und `guide_paths` an. Beide
brauchen Rechte für `loramint_manage`; die stehen in `scripts/ensure-roles.ts`
und werden vom Entrypoint nach den Migrationen angewandt. Ohne sie existieren
die Tabellen und sind unbeschreibbar – die leere `defaults`-Liste dort ist
Absicht und sagt warum.

```bash
bun run migrate && bun scripts/ensure-roles.ts
```

Sonst nichts: keine neue Umgebungsvariable, kein neues Volume. `UPLOAD_DIR` und
`UPLOAD_MAX_BYTES` heissen und bedeuten, was sie hiessen – im
Konfigurationskatalog stehen sie jetzt unter „Dateien" statt unter
„Workshop-Seite".
