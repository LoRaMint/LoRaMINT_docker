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

`/anleitungen` **listet die Themen auf**, zwei Ebenen tief, erzeugt aus dem
Baum. Es gibt dort nichts zu schreiben und nichts zu pflegen.

Das war einmal anders: Die Seite war selbst eine Anleitung, angelegt auf
oberster Ebene mit der Adresse `uebersicht`. Eine geschriebene Übersicht kann
sagen, welche Anleitung man zuerst liest, und das ist mehr, als eine erzeugte
kann. Sie stand dafür **zweimal im Menü** – einmal als fester Eintrag
„Übersicht" auf `/anleitungen`, einmal als Baumeintrag unter
`/anleitungen/uebersicht` – und das ließ sich nur beheben, indem vier Stellen
lernen, dass eine Zeile in `guides` keine gewöhnliche Zeile ist. Der Tausch war
das nicht wert.

Wer eine geschriebene Einleitung will, legt sie als gewöhnliche Anleitung an
und verlinkt sie aus den Themen heraus.

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
| Bildgrösse | `![alt](/bild.png =50%)`, `=400`, `=x300`, `=200x400` — vor der Unterschrift |
| Hinweiskasten | `> Text` |
| Aufklapp-Abschnitt | `:::klapp Häufige Probleme` … `:::` |
| Anker auf jeder Überschrift | `## Aufbau` → `[dorthin](/anleitungen/thema#aufbau)` |

Ein paar Feinheiten, die man sonst selbst herausfinden müsste:

- **Bildunterschrift nur auf einer eigenen Zeile.** Steht das Bild mitten im
  Satz, wird die Unterschrift ein `title` (Tooltip) statt einer `<figcaption>`.
  Grund: `<figure>` darf nicht in einem `<p>` stehen, und ein Browser schliesst
  den Absatz sonst still – das Dokument bekäme eine andere Form, als es gelesen
  wird.
- **Die Grösse ist eine Obergrenze, kein Zerren.** `=200x400` passt das Bild in
  einen Rahmen von 200 × 400 px ein und behält sein Seitenverhältnis. Es wird
  nicht auf genau dieses Mass gezogen: ein verzerrter Screenshot ist nie
  gemeint gewesen, und anders als ein zu klein geratenes Bild sieht man ihm den
  Fehler nicht an. Auf einem schmalen Schirm bleibt das Bild schmal, auch wenn
  eine grössere Zahl dasteht.
- **`=50%` ist der bessere erste Griff.** Ein Anteil stimmt auf jedem
  Bildschirm, eine Pixelzahl nur auf dem, an dem sie gewählt wurde. Bezug ist
  die Spalte, und die ist für alles dieselbe – siehe unten. `=100%` ist
  deshalb dasselbe wie gar keine Angabe.
- **Mehr als 100 % gibt es nicht.** `=150%` bleibt Text stehen, statt
  stillschweigend auf 100 % zurechtgestutzt zu werden.
- **Eine unverständliche Grösse macht kein Bild.** `=abc` lässt die ganze Zeile
  als Text stehen, statt die Angabe still zu verschlucken – in der Vorschau
  sofort zu sehen.
- **Ein Sprung braucht den ganzen Pfad.** Jede Überschrift bekommt ein `id`,
  aber `[dorthin](#aufbau)` allein wird **kein Link**: `SAFE_SCHEME` lässt nur
  `http`, `https`, `mailto` und Adressen ab `/` durch, eine reine Sprungmarke
  fällt als Text heraus. Also `/anleitungen/howto/esp32#aufbau` schreiben.
  Innerhalb derselben Seite sieht das umständlich aus und ist der Preis dafür,
  dass `[hier](javascript:…)` an einer Stelle abgewiesen wird statt an vieren.
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

### Eine Spalte, eine Breite

Eine Anleitung ist **65 Zeichen breit — alles darin**: Absätze, Hinweiskästen,
Tabellen, Codeblöcke, Bilder, die Überschrift samt Linie und die Liste der
Unterseiten am Fuss.

`FORM-04` im Designsystem verlangt die 65 Zeichen für den Fliesstext und
*erlaubt* Tabellen und Diagrammen, breiter zu laufen. Diese Erlaubnis wird
nicht genutzt, und das ist eine Entscheidung: eine Spalte Text mit Kästen in
drei verschiedenen Breiten darin lässt das Auge die ganze Seite lang nach der
Kante suchen. Eine lange Codezeile oder eine breite Tabelle geht nicht
verloren — beide scrollen seitwärts in sich (`overflow-x-auto`), so wie auf
einem Telefon ohnehin.

Die Zahl steht einmal, in `frontend/pages/guides/page.tsx` als `MEASURE`, und
die Vorschau im Editor benutzt dieselbe — sonst bräche sie die Zeilen woanders
als die Seite.

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

Die Übersichtsseite gehört nicht dazu: `/anleitungen` ist erzeugt, siehe oben.

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

### Die Dateien der ESP32-Anleitung

Bilder, Beispielprogramme und die Bibliotheks-ZIP lagen bis 1.16.0 unter
`/public/guides/esp32/` im Repository und wurden von dort ausgeliefert. Sie
sind jetzt Inhalte wie jede andere Datei: sie gehören ins Upload-Volume und
werden als `/downloads/esp32/…` verlinkt. Im Repository liegt keine Kopie mehr.

Erzeugt werden sie weiter aus `packages/esp32`, denn `loramint.zip` von Hand zu
packen ist, was einmal eine Bibliotheksfassung ausgeliefert hat, die nicht
senden konnte:

```bash
cd packages/api && bun run sync-guide-assets
```

Das legt sie unter `temp/upload/esp32/` ab – gitignoriert – und nennt zu jeder
Datei den Ordner, in den sie gehört. Hochgeladen wird unter
`/management/dateien`, Ordner für Ordner:

| Von | Nach |
|---|---|
| `temp/upload/esp32/*.jpg,png,zip` | `esp32` |
| `temp/upload/esp32/lightsleep/*.py` | `esp32/lightsleep` |
| `temp/upload/esp32/deepsleep/*.py` | `esp32/deepsleep` |

Die Ordnernamen sind nicht Geschmackssache: die Anleitung verlinkt absolute
Adressen. Der fertige Text liegt in
[`anleitungen/esp32.md`](anleitungen/esp32.md) und zeigt genau dorthin.

**Freischalten nur, was auf die Downloadseite gehört.** Die Bilder im Text
brauchen keine Freischaltung, um angezeigt zu werden – die Programme und die
ZIP wollen dagegen wahrscheinlich dort stehen.

> **Was dabei an Zusicherung verlorengeht, offen gesagt.** Bisher liess CI das
> Skript laufen und scheiterte, wenn das Ergebnis von der eingecheckten Kopie
> abwich – eine veraltete Kopie konnte damit kein Release erreichen. Es gibt
> nichts Eingechecktes mehr zum Vergleichen, und die Kopie, auf die es ankommt,
> liegt in einem Volume auf einem Server. CI merkt jetzt nur noch, wenn eine
> *Quelle* verschwindet oder umbenannt wird; dass nach einer Änderung an der
> Bibliothek niemand neu hochgeladen hat, kann nur ein Mensch bemerken.

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
