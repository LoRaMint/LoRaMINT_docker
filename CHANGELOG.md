# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.13.2] - 2026-09-02

### Fixed

- **Im Impressum stand ein Testrest.** Mitten im Haftungssatz fand sich
  `<script>alert(1)</script>` — übriggeblieben aus einer Prüfung, ob der
  Markdown-Renderer maskiert, was man ihm gibt. Er tut es, weshalb das Fragment
  ungefährlich war und stattdessen als sichtbarer Text auf der öffentlichen
  Seite stand.

- **Die Rechtsgrundlage im Impressum war überholt.** Das Telemediengesetz wurde
  am 14. Mai 2024 abgelöst; die Impressumspflicht steht seither in **§ 5 DDG**.
  Dieselbe Angabe stand auch in `.env.prod.example`.

- **Die Datenschutzerklärung war beim 9. August stehengeblieben**, während die
  Anwendung weitergewachsen ist. Gegen die Migrationen gelesen, fehlten drei
  Datenbestände mit Personenbezug vollständig:

  - `api_tokens`, `api_token_grants`, `api_token_announcements` — jeweils der
    Anmeldename der Person, die angelegt, freigegeben oder bekannt gemacht hat,
    dazu Ablauf und Zeitpunkt der letzten Verwendung.
  - `api_token_log` — ein Anfüge-Protokoll mit Klarnamen über neun
    Vorgangsarten. Der bestehende Protokollabschnitt deckte nur Messdaten und
    Geräte ab.
  - `dashboard_entries` — die kuratierten öffentlichen Kacheln, mit dem
    Anmeldenamen der anlegenden Person.

  Zwei Abschnitte sind neu, der Protokollabschnitt nennt jetzt auch das
  Token-Protokoll, und die Liste der Speicherdauern hat drei Zeilen mehr.

- **Der Login-Knopf saß auf der Kante zum Inhalt.** Die Kopfleiste war 56 px
  hoch und der Knopf bündig an ihrem unteren Rand — was aussieht, als sei er
  dorthin gefallen. Die Leiste misst nun 64 px und der Knopf steht mittig.

- **Die Reiterbeschriftungen standen auf demselben Boden.** Ein Reiter muss an
  der Unterkante enden, weil dort das Menü ansetzt; die Beschriftung lässt sich
  daher nicht durch Zentrieren des Reiters mittig bekommen. Sie ist stattdessen
  in einem Reiter zentriert, der weit genug hinaufreicht.

### Changed

- **Das Impressum nennt Hetzner nicht mehr.** Der Hoster steht sachlich richtig
  in der Datenschutzerklärung unter *Empfänger*, mit Anschrift und Einordnung
  nach Art. 28 DSGVO. Ergänzt wurden dafür die Haftung für Links und der Hinweis
  nach § 36 VSBG.

  Die Dateien unter `rechtstexte/` sind die versionierte Quelle; die Anwendung
  liest aus der Einstellungstabelle. Der Eintrag dort ist ein eigener Schritt.

## [1.13.1] - 2026-09-02

### Changed

- **Die E-Mail-Adressen auf Impressum und Datenschutz stehen nicht mehr im
  ausgelieferten HTML.** Beide Dokumente schreiben ihre Adresse als
  `[name@host](mailto:name@host)` — sie stand also doppelt in der Seite, im
  Verweisziel und als Text des Links. Nur das Ziel zu verschleiern wäre eine
  Geste gewesen; der Text hätte die Adresse weiterhin buchstabiert.

  Der Markdown-Renderer trennt die Adresse jetzt am `@`, dreht beide Hälften
  mit ROT13 und legt sie in getrennte Attribute; fünfzehn Zeilen Inline-Skript
  setzen sie im Browser wieder zusammen. Die Trennung ist kein Beiwerk: ROT13
  lässt das `@` unangetastet, die Adresse als Ganzes zu kodieren hätte also
  genau das Zeichen stehen lassen, auf das jedes Sammelmuster anspringt.

  **Was das leistet, und was nicht.** Ein Sammler, der HTML abruft und
  `\S+@\S+` sucht, findet nichts — und das ist die große Mehrheit. Einer, der
  JavaScript ausführt, bekommt die Adresse, und daran ändert keine Kodierung
  etwas: Was ein Browser rückgängig machen kann, kann ein Skript auch. Der
  Schutz liegt in der Ausführungspflicht, nicht in der Kodierung.

  Ein `<noscript>` trägt „name (at) host“ für Besucher ohne JavaScript. Das
  betrifft §5 DDG, nicht das Abfischen: Ein Impressum, dessen Kontakt nur für
  Skript-Ausführende existiert, erfüllt die Anforderung schlecht.

  Nicht erfasst: eine Adresse, die als reiner Text statt als Link geschrieben
  ist. Beide Dokumente tun das derzeit nicht.

## [1.13.0] - 2026-09-02

### Fixed

- **Die neue Diagrammpalette war in 1.12.0 gar nicht ausgeliefert.**
  `public/plots.js` ist ein versioniertes Bauartefakt und wurde nicht neu
  gebaut: Der Quelltext trug die neue Palette, die Seite zeichnete weiter mit
  der alten. Der Rot-Grün-Kollaps, den 1.12.0 zu beheben angetreten war, stand
  also unverändert auf der Plots-Seite. Behoben.

- **Im dunklen Theme fehlte das Logo praktisch.** Die dunkle Fassung lag seit
  1.12.0 in `public/`, wurde aber von niemandem verwendet — die Umschaltung
  gehörte in `Layout.tsx`, und die war beim letzten Release ausgespart. Auf der
  dunklen Kopfzeile erreicht das helle Logo für den Wortteil „MINT“ **1,07:1**.
  Welche Fassung gilt, entscheidet jetzt der Server, wo das Theme ohnehin
  bekannt ist; ein nachträglicher Tausch per Skript würde beim Laden erst die
  falsche zeigen.

- **Nebentext in weiteren 25 Fällen unter dem Kontrastminimum.** Der Durchgang
  aus 1.12.0 musste elf Dateien auslassen, weil sie zu dem Zeitpunkt einen
  laufenden Umbau trugen. `base-content/50` (3,25:1) und `/60` (4,43:1) sind
  dort nun ebenfalls auf `/70` angehoben.

- **Die Fußzeile grenzte sich nicht ab.** `base-200` gegen `base-100` ergibt
  1,09:1 — keine Kante, die jemand sieht. Sie trägt jetzt eine 1-px-Linie. Ihr
  Trenner zwischen Impressum und Datenschutz war ein leeres `<span>` mit einem
  Leerzeichen darin, in einer Flex-Zeile mit Abstand: Es bewirkte nichts außer
  zusätzlicher Breite. Und ihr Logo ist Dekoration und sagt das nun mit leerem
  `alt` — dasselbe Logo steht schon in der Kopfzeile.

### Changed

- **Die Kopfzeile löst ein, was sie verspricht.** Die Reiter sahen aus wie
  Reiter und verhielten sich wie nichts: Ein hochgezogener Reiter kündigt eine
  angeschlossene Fläche an, das Menü schwebte aber frei darunter, in Petrol.
  Aus derselben Ursache folgte, dass **nie markiert war, auf welcher Seite man
  sich befindet**.

  Geöffnet trägt ein Reiter jetzt die Fläche des Menüs, verliert seinen unteren
  Rand, und das Menü setzt bündig an — beide sind eine Form. Die aktuelle Seite
  ist mit einem 2-px-Unterstrich in der Markenfarbe markiert, ihr Eintrag im
  Menü ist gefüllt und trägt `aria-current`.

  Damit die Markierung weiß, worauf sie sich bezieht, führt der Anfragekontext
  jetzt den Pfad mit — neben Benutzer und Theme, die er schon hielt. Das Layout
  nimmt keine Eigenschaften entgegen; würde jede Seite den Pfad durchreichen
  müssen, verlöre die erste, die es vergisst, die Markierung stillschweigend.

- **Weiteres in der Kopfzeile.** Der Login ist ein Umriss statt einer gefüllten
  Fläche: Ein Primärbutton dort konkurriert auf jeder Seite mit der eigentlichen
  Primäraktion der Seite. Die Leiste misst 56&nbsp;px statt rund 72, das Logo
  40&nbsp;px. Das Menü nutzt die eine Schattenstufe des Designs statt einer
  zweiten, und das Menü auf schmalen Bildschirmen dieselbe Fläche wie das breite
  statt eines Petrolblocks.

- **Rot ist wieder Signalfarbe.** Zwei gefüllte rote Buttons standen in einer
  Werkzeugleiste neben anderen Aktionen; sie sind Umrisse geworden. Gefüllt
  bleiben vier — alle auf Seiten, deren einzige Primäraktion die zerstörende
  ist, und dort soll die Warnung am lautesten sein. Alle vier tragen ein Symbol,
  bei allen vieren steht der Ausweg links mit Abstand davor und bekommt beim
  Öffnen den Fokus; zuvor führte der Weg dorthin mit der Tastatur durch die
  gesamte Vorschau.

- **Fließtext bricht bei 65 Zeichen um**, in zehn weiteren Absätzen, die auf
  768&nbsp;px und damit rund 87 Zeichen liefen. Formulare, Raster, Textfelder
  und der Anleitungsartikel behalten ihre Breite — die Regel gilt für Prosa.

### Added

- **`components/icons.tsx`.** Der Papierkorb war im Begriff, seine vierte Kopie
  zu werden. Die Datei hält ihn und den Rücknahme-Pfeil und schreibt die Regel
  dazu, der beide folgen: 24er-Raster, 2-px-Strich, keine Flächen,
  `currentColor` — damit ein Symbol die Farbe des Textes daneben annimmt und im
  dunklen Theme nichts über es gesagt werden muss.

## [1.12.0] - 2026-09-02

### Fixed

- **Weißer Text auf dem Erfolgsgrün war nicht lesbar.** `--color-success-content`
  stand im hellen Theme auf Weiß, über `#86b94c` sind das **2,32:1** — verlangt
  sind 4,5:1. Jede Bestätigungsmeldung war betroffen. Das Grün selbst bleibt auf
  den Zehntelwert genau, es ist das Grün des SFZ-Logos; geändert ist nur die
  Schrift darauf (`#101a08`, 7,7:1).

- **Die Diagrammfarben brachen bei Rot-Grün-Blindheit zusammen.** Die Palette
  hatte Rot (`#d62728`) auf Platz zwei und Grün (`#2ca02c`) auf Platz drei.
  Unter Deuteranopie werden beide zu demselben Oliv — Abstand ΔE 3,9, wo 8 das
  Ziel ist. Das ist genau das Paar, das ein Diagramm mit zwei Messgrößen zuerst
  zeichnet, und es betrifft rund 8 % der männlichen Nutzer.

  Die neue Palette wurde gegen Helligkeitsband, Buntheit, Trennschärfe bei
  simulierter Farbfehlsichtigkeit, Trennschärfe bei normalem Sehen und Kontrast
  zur Fläche gerechnet, in beiden Themes. Schlechtestes Nachbarpaar: ΔE 9,1 hell,
  8,4 dunkel. Platz eins liegt jetzt auf dem Markenton. Für dunkle Oberflächen
  gibt es einen eigenen Satz; welcher gilt, entscheidet `data-theme`.

- **Der Tastaturfokus war unsichtbar.** Die Grundstile setzen den Ring des
  Browsers zurück, ein eigener war nirgends definiert: Wer die Anwendung mit der
  Tastatur bedient, sah nicht, wo er stand. Der Ring ist zweifarbig — innen
  2 px in der Flächenfarbe, außen 2 px in der Markenfarbe. Der Abstandsring ist
  der Grund, warum er auf jedem Untergrund funktioniert; ein einfarbiger Ring in
  der Markenfarbe verschwindet auf einem Button genau dieser Farbe, und ein
  halbtransparenter erreicht nur 2,45:1. Ausgelöst über `:focus-visible`, also
  nicht bei Mausbedienung.

- **Nebentext verfehlte im hellen Theme den Kontrast.** `base-content/50` ergibt
  dort 3,25:1, `/60` ergibt 4,43:1 — beides unter 4,5:1, und der Zeitstempel auf
  den Dashboard-Kacheln war zusätzlich klein gesetzt. Beide Stufen sind auf `/70`
  angehoben (6,14:1). Im dunklen Theme bestand keine der Stufen dieses Problem.

- **Die meisten Seiten hatten keine Überschrift der obersten Ebene.** Der
  Seitentitel war ein `<h2>`, die Gliederung begann also bei Stufe zwei, und wer
  per Überschriften navigiert, fand keinen Einstieg. Drei Seiten — Impressum,
  Datenschutz, ESP32-Anleitung — hatten das bemerkt und ein eigenes `<h1>`
  geschrieben, in einer anderen Größe; sie laufen jetzt über dieselbe Komponente.

### Added

- **Rubik ist die Hausschrift.** Gewählt wurde sie nicht: Das Logo ist seit jeher
  darin gesetzt, es stand nur nirgends geschrieben. Eine variable Schriftdatei
  deckt alle Schnitte von 300 bis 700 in einem Ladevorgang ab; `OFL.txt` liegt
  daneben, wie die SIL Open Font License 1.1 es bei Weitergabe verlangt.

  Das `@font-face` steht bewusst in `public/fonts.css` außerhalb des
  Tailwind-Baus: Der Bundler löst jedes `url()` auf und würde eine gehashte
  Kopie der Schrift als unversioniertes Artefakt neben versionierte Dateien
  legen, mit einem Dateinamen, der sich bei jeder Änderung verschiebt.

- **Das Logo liegt in drei Fassungen vor** — farbig, für dunklen Grund, und
  einfarbig weiß. Die Schrift darin ist in Pfade umgewandelt; als lebender Text
  wurde das Logo auf jedem Rechner ohne installiertes Rubik falsch dargestellt.
  Der Grauton `#8a949c` weicht dem Marken-Blaugrau `#51707a`: Er war ein fünfter
  Grauton, der zu nichts gehörte, und erreichte auf der Kopfzeile nur 2,37:1.

### Changed

- **Farbe folgt drei Ebenen statt Einzelfallentscheidungen.** Marke färbt die
  Oberfläche, Signal färbt Zustände, Daten färben Messreihen — und keine Ebene
  borgt sich Farben aus einer anderen. Daraus folgt unter anderem, dass Rot
  Signalfarbe bleibt und nicht zur Schaltflächenfarbe wird; die einzige Ausnahme
  ist die Bestätigungsseite, wo das Löschen die einzige Primäraktion ist.

- **Die Gauges verlieren den Ampelverlauf.** Grün nach Rot behauptet „hoch ist
  schlecht“, und für Temperatur, Luftdruck oder Helligkeit trifft das nicht zu —
  25 °C sind nicht schlechter als 15. Der Bogen ist einfarbig und zeigt den
  Füllstand, sonst nichts. Eine Ampel wäre erst wieder begründet, wo für eine
  Messgröße ein Sollbereich hinterlegt ist.

  Dazu die zwei Angaben, ohne die der Bogen nicht lesbar war: die Einheit steht
  jetzt beim Wert statt drei Zeilen darunter, und die Enden der Skala sind
  beschriftet — ein zu 60 % gefüllter Bogen sagt ohne `min` und `max` nichts.

- **Messwerttabellen lassen sich spaltenweise lesen.** Zahlen stehen rechtsbündig
  und in Ziffern gleicher Breite, abgeleitet aus dem `kind` der Spalte, das die
  Ressourcendefinitionen ohnehin schon führen. Zuvor lagen die Kommata von
  18,4 / 124,05 / 1013,2 an drei verschiedenen Stellen. Der Spaltenkopf bleibt
  beim Scrollen stehen, und die Zeile unter dem Zeiger hebt sich ab.

- **Der Löschdialog stellt den Ausweg voran.** „Abbrechen“ stand rechts neben
  dem Knopf, der löscht; jetzt steht es links, mit Abstand, und trägt den Fokus,
  wenn die Seite öffnet — vorher führte der Weg dorthin mit der Tastatur durch
  die gesamte Vorschautabelle. Der Löschknopf bekommt ein Symbol, damit seine
  Bedeutung nicht allein auf der Farbe ruht.

- **Ein Seitenname steht einmal.** „Geräte verwalten“ stand in acht Dateien,
  „Daten verwalten“ in fünf — im Menü, im Browsertitel, in der Überschrift und
  in jedem Zurück-Link. `lib/pages.ts` hält jede Seite einmal; die Form
  `{ href, label }` ist die, die `PageHeading` für `back` ohnehin erwartet.

- **Die Arduino-Bibliothek liegt bei den ESP32-Quellen.** `packages/arduino` und
  `packages/esp32` beschreiben dieselbe Platine aus zwei Richtungen, standen aber
  als getrennte Belange nebeneinander. Reine Verschiebung nach
  `packages/esp32/arduino`, alle Dateien unverändert; nachgezogen wurden die
  Pfade in den READMEs, in `LICENSE` und in drei Beispielskizzen.

### Removed

- **Die Farbrollen `accent` und `info`.** `accent` war ein zweites Rot, das keine
  Komponente verwendete; `info` war eine wortgleiche Kopie von `neutral`. Die
  einzige Verwendung, ein `badge-info`, ist ein `badge-neutral` geworden — also
  genau die Farbe, die es vorher schon hatte.

## [1.11.0] - 2026-08-25

### Added
- **API-Token: ein Programm darf die API lesen, ohne jemandes Passwort.** Bisher
  gab es nur zwei Wege hinein — den TTN-Webhook mit eigenem Schlüssel und das
  Sitzungs-Cookie eines Menschen. Letzteres taugt als Dauerlösung nicht: acht
  Stunden gültig, nicht einzeln widerrufbar, und es trägt volle Schreibrechte in
  der WebUI. Ein nächtlicher Export hätte ein Administratorpasswort im Klartext
  vorhalten müssen.

  Ein Token wird als `Authorization: Bearer …` mitgeschickt und ist **eine
  Kennung, sonst nichts**. Was es lesen darf, steht in einer getrennten Liste von
  Berechtigungen, die Datengruppen erteilen und entziehen. Daraus folgt die
  Eigenschaft, um die es geht: **wird eine Berechtigung entzogen, ändert sich das
  Token nicht** — kein neuer Wert, kein Skript, das angefasst werden muss. Jede
  Berechtigung trägt einen Filter (`device_eui`, `measurand`, `sensor`,
  `location`, `datatype`), der innerhalb der Gruppe weiter einengt.

  Ein Token gehört einer **Datengruppe**, nie einer Person — deshalb läuft der
  Export weiter, wenn die Lehrkraft geht, die ihn eingerichtet hat. Jedes
  Mitglied der Gruppe darf anlegen, löschen und freigeben; Rollen innerhalb einer
  Gruppe gibt es bewusst nicht. Die Laufzeit beträgt höchstens 360 Tage,
  verlängerbar um wieder höchstens 360 Tage ab dem Zeitpunkt der Verlängerung.
  Gespeichert wird nur der Hash; der Wert erscheint genau einmal beim Anlegen.

  **Ein Token erzeugt keine WebUI-Sitzung.** Es authentifiziert allein die
  lesenden Endpunkte unter `/api/v1` und erreicht insbesondere `/sql` nicht — das
  ist die Bedingung, unter der der Filter im Anwendungscode liegen darf statt in
  neuen RLS-Policies. Die Sichtbarkeit entsteht zweistufig: die Row-Level-Security
  lässt die Zeilen der gewährten Gruppen durch, der Filter engt darüber hinaus
  ein. Ein Token ohne Berechtigung sieht genau so viel wie ein anonymer Aufruf.

  Jede Änderung an der Berechtigungsstruktur steht in einer eigenen Historie
  unter `/management/tokens/history` — **rein lesend**, und das ist eine
  Eigenschaft der Datenbankrolle: `loramint_manage` hat auf dieser Tabelle
  `SELECT` und `INSERT` und nichts weiter, wie schon bei `audit_log` und
  `device_log`. Die Einträge hängen bewusst nicht per Fremdschlüssel am Token,
  sondern überleben sein Löschen — sonst wäre das Protokoll genau dann leer, wenn
  man es braucht. Anders als `audit_log` trägt es von Anfang an eine
  Gruppenspalte, sodass Gruppenmitglieder ihre eigene Historie sehen.

  Das Konzept dahinter steht in `packages/api/docs/api-token.md`.

- **Ein Token lässt sich bei anderen Gruppen bekannt machen.** Der Fall
  dahinter: ein Programm soll die Daten mehrerer Gruppen lesen. Die besitzende
  Gruppe macht ihr Token bei einer anderen bekannt; die sieht es daraufhin und
  kann ihm **eigene** Daten freigeben. Es braucht kein zweites Token, und nichts
  wechselt den Besitzer.

  **Es ist ausdrücklich keine Leihe** — die andere Gruppe bekommt nichts
  Benutzbares und die besitzende gibt nichts ab. Was danach fließt, fließt zum
  Programm der besitzenden Gruppe. Bekannt gemacht wird das Recht,
  *beizusteuern*, nie die Fähigkeit zu handeln.

  Der Wert wird dabei nie mitgegeben und könnte es auch gar nicht: gespeichert
  ist nur sein Hash. Das ist die richtige Wirkung und kein Mangel — eine Gruppe,
  die den Wert hätte, könnte das Token selbst benutzen und käme damit an die
  Daten der besitzenden Gruppe und aller anderen Beisteuernden.

  Wird die Bekanntmachung zurückgezogen, **erlöschen alle daraus entstandenen
  Freigaben sofort**, in derselben Transaktion. Ohne das wäre Zurückziehen
  wirkungslos: die Gruppe sähe das Token nicht mehr, ihre Daten flössen aber
  weiter. Weitergeben lässt sich eine Bekanntmachung nicht — nur die besitzende
  Gruppe macht bekannt, sonst verlöre sie den Überblick, wer ihrem Token Daten
  öffnen darf.

  Getrennt bleiben dabei zwei Rechte, die sich leicht vermischen ließen: das
  Token **verwalten** (löschen, verlängern, bekannt machen) bleibt bei der
  besitzenden Gruppe; Daten **freigeben und entziehen** gehört der Gruppe, deren
  Daten es sind. Sonst könnte eine Gruppe, der man das Token nur bekannt gemacht
  hat, es löschen.

  Auf der Übersichtsseite sieht jede Gruppe nur, was sie wissen darf: die
  besitzende Gruppe und Administratoren sehen alle Freigaben, eine gewährende
  Gruppe ihre eigene. Sonst verriete die Liste, wer wem seine Daten öffnet.

### Fixed
- **Ein Kommentar behauptete, das Sitzungs-Cookie gelte nicht auf `/api/v1`.**
  Es gilt dort sehr wohl — die Middleware hängt an der Wurzel, und die API wird
  darunter eingehängt. Wer den Kommentar las, konnte daraus falsche Schlüsse über
  die Zugriffssteuerung ziehen. Das Verhalten bleibt, der Kommentar sagt es jetzt
  richtig.

## [1.10.2] - 2026-08-18

### Fixed
- **Die Auswahllisten auf `/plots` widersprachen einander.** Vier Fehler, die
  alle dieselbe Wirkung hatten: angekreuzt, geplottet, leere Fläche, kein Hinweis
  worauf es lag.

  - **Beim Laden passten die Listen nicht zum angezeigten Gerät.** Das
    Geräte-Feld hat — anders als auf `/export` — keine „alle"-Option, also wählte
    der Browser sofort das erste Gerät aus, ohne dabei ein `change`-Ereignis
    auszulösen. Messgrößen, Sensoren, Location und Gruppe blieben die
    Vereinigung über *alle* Geräte. Dasselbe Gerät erneut zu wählen half nicht;
    erst ein Wechsel weg und zurück brachte die Listen in Ordnung. Sie werden
    jetzt für das vorausgewählte Gerät nachgeladen.
  - **Gruppe und Öffentlich filterten die Daten, aber nie die Listen.** Auf
    beiden lag überhaupt kein Listener, und `/measurements/metadata` nahm sie
    auch nicht entgegen.
  - **Messgröße und Sensor waren unabhängige `DISTINCT`-Listen** und damit ein
    Kreuzprodukt: ein Sensor und eine Messgröße liessen sich kombinieren,
    obwohl keine Zeile je beide zusammen trug — dieselbe Fehlerklasse, die
    `knownTriples` für das Board beendet hat.
  - **Messgrößen ohne Daten verschwanden lautlos.** Drei angekreuzt, zwei
    Kurven, keine Erklärung.

  `/measurements/metadata` liefert deshalb zusätzlich die Kombinationen, die
  tatsächlich gemeinsam aufgetreten sind, und die Filter schränken einander aus
  ihnen ein — im Browser, ohne Anfrage pro Klick. Die Regel, die dabei niemanden
  aussperrt: eine Facette wird nie nach ihrer *eigenen* Auswahl eingeschränkt,
  nur nach den übrigen; abwählen führt immer zur vollen Liste zurück. Was durch
  eine Einschränkung wegfällt, wird benannt statt stillschweigend auf „alle"
  zurückgesetzt, und leere Messgrößen nennt die Statuszeile jetzt beim Namen —
  der Zeitraum gehört nicht zu den Kombinationen, eine gültige Paarung kann im
  gewählten Fenster also trotzdem nichts enthalten.

  Die Einschränkung selbst liegt als reine Funktion in `lib/facets.ts`. Dorthin
  zieht auch `NO_GROUP`, das bisher dreimal von Hand kopiert dastand: die
  Browser-Bündel können `types.ts` nicht einbinden, ohne zod mitzuziehen.

## [1.10.1] - 2026-08-18

### Added
- **`BOARD_ENABLED`.** A switch for the public `/board` page, next to the
  configuration page's other movable settings - the same shape as
  `SQL_CONSOLE_ENABLED`. Off, the page 404s and its menu entry disappears;
  `/management/board` stays reachable for the board role either way, so
  entries can be prepared before the page goes live.

### Fixed
- **A board tile's name could overlap its gauge.** The gauge was sized from its
  own width alone (`h-auto`), so on a wide tile it could render taller than the
  space actually left for it and run into the name above. It now scales to fit
  within that space on both axes, and the tile's text rows no longer shrink to
  make room for it.

## [1.10.0] - 2026-08-18

### Added
- **A public dashboard at `/board`.** Curated measurements as gauge tiles - name,
  a 270° arc gauge with the current value in the centre and a green-to-red fill
  from the low end up to where the value sits between the gauge's minimum and
  maximum, device, measurand, unit, and when the value was recorded. Meant for a
  screen in a hallway or classroom. Server-rendered, no client bundle, refreshes
  by reloading every 30s like `/status`; a triple whose measurements are not
  `public_read` simply renders without a value, since the page reads through the
  same connection every anonymous visitor gets.

  A fourth, independent role curates it: `LDAP_BOARD_GROUP` (see `lib/roles.ts`)
  grants `/management/board`, a compact table of entries editable in place plus
  a form to add another. An entry names a (device_eui, sensor, measurand)
  triple - not editable once created, the same way a data group's name is not -
  and how to scale its gauge: a fixed minimum/maximum, or dynamic, computed from
  that triple's measurement history. The three selects in the form are coupled -
  sensor narrows to what the chosen device actually has, measurand to what that
  sensor actually sends - so only combinations that occurred together can ever
  be proposed; `createEntry` checks the same rule again server-side, for a
  direct POST or a visitor without JavaScript. Administrators reach the page
  too, for free, via the existing "admin contains the others" rule - no
  special-casing needed. Nobody who isn't in either group sees more than a
  single "Dashboard" link; the page itself is the same for everyone.

## [1.9.0] - 2026-08-18

### Added
- **Filter measurements and log entries by group and by public/private.** The
  `/plots`, `/export` and management pages gain a *Gruppe* dropdown, with an
  entry for the rows that still belong to none, and an *Öffentlich* dropdown
  for `public_read`. `GET /measurements`, `/measurements/export` and
  `/measurements/filters` accept `group_name` (pass `__none__` for the
  ungrouped rows) and `public_read` accordingly; `log_entries` gets the same
  two filters and its metadata endpoint now also lists the groups present.

- **Fixed:** the column picker's link to itself dropped every column but the
  last. `cols` is submitted once per checked box, and a plain query object
  keeps only the last of a repeated key, so any link rebuilt from that query
  carried a single column. Filter links now go through a `columnsParam` helper
  that folds the selection back into the one comma-separated value
  `parseColumns` expects.

### Changed
- **ESP32 examples sleep between uplinks instead of idling.** `time.sleep(60)`
  kept the ESP32 at full clock for the whole interval, tens of milliamps for
  doing nothing. The examples now come in two folders:

  - `examples/deepsleep/` — for continuous operation. `machine.deepsleep()`,
    roughly 10–20 µA. It does not return: the board restarts and runs the file
    from the top, so the restart is the next cycle and there is no loop. Every
    failure path ends in deep sleep as well, rather than leaving the node awake
    forever with no retry, and the start-up log entry is guarded by
    `machine.reset_cause()` so it is sent on a cold start only.
  - `examples/lightsleep/` — the same three programs for trying things out.
    `machine.lightsleep()`, roughly 1 mA, returns into a plain `while True`
    loop. Deep sleep takes the serial port down with it on a chip with native
    USB, so Thonny loses the connection; light sleep leaves the shell attached.
    The guide walks through these.

  The `deepsleep/` programs check a **stop bridge** as their very first
  statement: a jumper between `STOP_PIN` (GPIO5) and GND ends the program before
  it starts the cycle and hands back the REPL. Without it a sleeping board is
  reachable for only two or three seconds a minute, which makes it a matter of
  luck to interrupt. The check runs before the UART and the sensor, so it works
  even when the wiring is at fault, and the pin is deliberately not a strapping
  pin — waking from deep sleep is a reset, and a bridge on GPIO0 would boot the
  board into the ROM download mode instead.

  Pauses *within* a cycle use light sleep in both folders, which keeps the
  readings in RAM. This only became affordable with the join change below: the
  LA66 keeps its session across a restart, so a cycle costs no OTAA handshake.
  It also means the LA66 must stay powered — switching it off with the ESP32
  brings the full join back.

- **One ESP32 example per sensor.** `send_temperature.py`, `send_humidity.py`
  and `send_pressure.py` are replaced by a single `send_bme280.py` that reads
  the BME280 once and sends all three values, spaced so each uplink clears the
  LA66's receive windows. `send_temperature_ds18b20.py` becomes
  `send_ds18b20.py`. The Thonny guide and `/guides/esp32` follow and now explain
  which of the two folders to pick. `send_value.py` and `send_log.py` stay
  one-shot demos at the top level, with no sleeping at all.

- **ESP32 library (`packages/esp32`, 0.1.0 → 0.2.0): the OTAA join is no longer
  repeated on every start.** An OTAA handshake costs an uplink plus two receive
  windows and can block for up to a minute — the most expensive thing a
  battery-powered node does. The LA66 stores its LoRaWAN session itself and
  keeps it across an ESP32 reboot, so `join()` now asks `AT+NJS=?` first and
  returns straight away when the session is still valid. `join(force=True)`
  does the handshake unconditionally, and `is_joined()` exposes the query.

  What made the repeated join unavoidable was the `ATZ` in the constructor: the
  reset wipes exactly that session. **`LoRaMINT()` therefore no longer resets
  the module** — pass `LoRaMINT(reset=True)` to get the old behaviour. The reset
  was never needed to clear stale bytes; `_drain()` does that before every
  command.

  Calling code does not change: `join()` is still the one call before sending.
  A module that does not answer `AT+NJS=?` raises `OSError` instead of quietly
  joining again — an unnoticed rejoin on every wake-up is the very thing this
  change removes.

## [1.8.0] - 2026-08-10

### ⚠ Breaking — read before upgrading

**Die Rollenleiter entfällt.** `loramint-data`, `loramint-management` und
`loramint-admin` enthalten einander nicht mehr, sondern benennen drei getrennte
Zuständigkeiten. Wer bisher nur in der Verwaltungsgruppe war, **verliert das
Bearbeiten von Messwerten** und braucht zusätzlich die Datengruppe. Admin
enthält weiterhin alles.

**Neue Messwerte sind ohne Gerätezuordnung nirgends öffentlich sichtbar.** Nach
dem Update muss unter Verwaltung → Datengruppen eine Gruppe erklärt und auf der
Geräteseite jedem Gerät zugewiesen werden. Der vorhandene Bestand wird von der
Migration freigegeben, damit die öffentlichen Seiten nicht ausfallen.

**Die SQL-Konsole steht jedem Angemeldeten offen**, zeigt aber nur noch die
eigenen und die öffentlichen Zeilen. Schreibend bleibt sie Administratoren
vorbehalten.

### Added
- **Messwerte gehören Gruppen.** Die Gruppe hängt am **Gerät**: beim Eintreffen
  bekommt der Messwert die Gruppe seines Geräts eingestempelt und behält sie.
  Ein Gerät lässt sich später umhängen, ohne dass historische Daten den Besitzer
  wechseln — die Eigenschaft, die den Gerätetausch gefahrlos macht.

  Zwei Angaben je Messwert: die Gruppe entscheidet, wer ändern darf, die
  Freigabe, ob jeder lesen darf. Die Kombination ist der Normalfall — eine
  Klasse veröffentlicht ihre Wetterdaten, korrigieren darf sie nur die Klasse.

  Durchgesetzt wird das von **Postgres**, nicht vom Anwendungscode. Das ist keine
  Vorliebe: die SQL-Konsole lässt jeden Angemeldeten seine Abfrage selbst
  schreiben, und kein Filter im Code überlebt das. Die Regel fällt geschlossen
  aus — ohne gesetzten Geltungsbereich bleiben genau die öffentlichen Zeilen,
  auch nach dem Trick `COMMIT; SELECT …`.

  Die Zuordnung setzt ein Trigger beim Einfügen und überschreibt dabei, was der
  Einfügende mitgibt. So gilt für jeden Schreibweg dasselbe — Webhook,
  Verwaltungsseiten, Konsole — und die Ingest-Rolle behält ihr `INSERT` ohne
  jedes Leserecht.

- **Datengruppen wirken.** Die Mitgliedschaft in einer Datengruppe ist eine
  eigenständige Quelle von Rechten: sie trägt Lesen und Ändern der Messwerte
  dieser Gruppe, ganz ohne Rolle. Umhängen zwischen Gruppen bleibt der Datenrolle
  vorbehalten, und zwar baulich — die gewöhnliche Schreibrolle bekommt die beiden
  Spalten spaltenweise entzogen, eine eigene Rolle `loramint_regroup` hat sie.

## [1.7.0] - 2026-08-09

### ⚠ Breaking — read before upgrading

Around thirty settings move out of the environment and into the database. **They
are no longer read from the environment at all**, and the settings table starts
out empty, so an upgraded server comes up with none of them configured. Most
importantly that includes every `LDAP_*` variable: there is no directory login
until the values are entered again.

This is deliberate — one setting, one place, so a compose file and the actual
behaviour cannot drift apart. There is no automatic import; the transition is
yours to make, and the way through it is:

1. **Before upgrading**, set `ADMIN_USERNAME` and `ADMIN_PASSWORD_HASH` (or
   `ADMIN_PW`) in the environment. Without them the upgraded server has no login
   at all and cannot be configured.
2. Note the current values of the `LDAP_*`, `TTN_*`, `MANAGE_*`, `QUERY_*` and
   `LEGAL_*` variables — `/management/config` on the old version lists them.
3. Upgrade, sign in with the setup account, and enter them under
   Verwaltung → Konfiguration.
4. Remove them from the compose file afterwards. The page marks any that are
   still set there, since a value nobody reads is one somebody will believe.

What stays in the environment: `DATABASE_URL` and the three restricted
connection strings, `SESSION_SECRET`, the setup account, `TTN_APP_KEY`, `PORT`,
`NODE_ENV` and `TRUSTED_PROXIES` — the values needed before the application can
reach its own configuration, and the ones the security model rests on.

### Changed
- **Die Oberfläche baut auf gemeinsamen Bausteinen statt auf kopierten
  Klassenketten.** Ausgangspunkt war eine Zählung: 1695 Klassenvorkommen in den
  Seiten, davon vieles wortgleich wiederholt. Jetzt sind es 1336.

  Zwei der größten Wiederholungen waren keine fehlenden Komponenten, sondern
  vorhandene, die umgangen wurden — `PageHeading` in sieben Seiten von Hand
  nachgebaut, `Notice` in zehn. Beide lagen unter `components/manage/`, und wer
  auf einer öffentlichen Seite etwas schrieb, suchte dort nicht. Sie liegen nun
  eine Ebene höher.

  Neu dazu: `Field` und `FieldGroup` (Formularfelder), `TableFrame` und
  `EmptyRow` (Tabellen), `Row` (Beschriftung/Wert), `SectionHeading`, `Muted`.

- **39 Klassen taten überhaupt nichts.** `form-control`, `label-text`,
  `label-text-alt`, `input-bordered`, `select-bordered` und `textarea-bordered`
  stammen aus daisyUI 4; in Version 5 gibt es sie nicht mehr. Sie standen im
  Quelltext, erzeugten aber kein CSS — mit der Folge, dass die Formulare auf
  sieben Seiten ihre Beschriftungen anders darstellten als der Rest, ohne dass
  das je jemand entschieden hätte. Die Login-Seite hatte den Befund schon im
  Kommentar stehen und war die einzige, die ihn umgesetzt hatte.

  `Field` ist deshalb aus reinen Tailwind-Utilities gebaut statt aus daisyUIs
  Formularklassen: genau dieser Ausfallmodus — eine Klasse, die still zu
  existieren aufhört — soll sich nicht wiederholen können.

- Fünf verschiedene Stile für Abschnittsüberschriften und drei für Tabellen sind
  auf je einen zusammengeführt. Tabellen sind jetzt durchgehend dicht und
  gestreift; bei breiten Zeilen aus Messwerten und Kennungen ist der Streifen
  das, was das Auge in der Zeile hält.

- The application no longer queries the database as the schema owner. Every
  query now runs on the narrowest role that can carry it, and which one is
  decided by the *intent of the operation* — not by the module the code sits in,
  and not by the role of whoever is signed in. An administrator who only reads on
  a page reads through the read-only role like everybody else.

  Until now every read went through `DATABASE_URL`, which is a superuser in the
  default Docker setup. That the application may read what it displays is
  unavoidable; that the reading connection could also call `pg_read_file()`, read
  the password hashes in `pg_authid` and run shell commands through
  `COPY ... TO PROGRAM` was not. A flaw in any read path was worth a shell on the
  database host rather than a few rows too many. That connection is now used by
  the migrations and the role setup, and by nothing else.

  A fourth role joins the three: `loramint_ingest`, for the TTN webhook, with
  `INSERT` on the two data tables and **not even `SELECT`**. It is the only
  externally reachable route that writes, and it reads nothing, so it may read
  nothing. That required dropping `RETURNING` from the two inserts — measured,
  not assumed: `INSERT ... RETURNING` needs `SELECT` on the columns it returns,
  and granting that would have let the webhook's role read every measurement ever
  stored. Id and arrival time are generated in the application instead.

  `DATABASE_URL_READONLY`, `DATABASE_URL_MANAGE` and `DATABASE_URL_ADMIN` are
  gone. One variable per role would have grown the one group of settings that
  cannot move into the database — the group somebody has to type by hand. The
  passwords are derived from the owner's instead, so nothing has to be
  configured, passed or stored: `ensure-roles` and the application compute the
  same value independently. Rotating the owner's password rotates all of them.

  Splitting one connection into four multiplies the pools, and Postgres counts
  every one against `max_connections`. Measured during the change: an unbounded
  read pool took 77 of 100 slots on its own and the next connection was refused.
  Each role is now capped, twenty between them.

  Whether the SQL page exists and whether data may be edited used to be decided
  by whether a connection string had been configured. Since the roles now always
  exist, both became settings — `SQL_CONSOLE_ENABLED` and `DATA_EDITING_ENABLED`,
  switchable under Verwaltung → Konfiguration.

  **After upgrading, the application no longer needs to run as a superuser.**
  That is the point of the change, and it is a change to the deployment rather
  than only to the code.

### Added
- **Persönliche Einstellungen** unter `/profile`: Zeitzone und dunkle
  Darstellung, pro Benutzer gespeichert. Damit gibt es erstmals eine
  `users`-Tabelle — bis hierher war Identität allein der Anmeldename im
  signierten Sitzungs-Cookie und in der Datenbank stand über Personen nichts.

  Beide Werte reisen anschliessend in der Sitzung mit, sodass keine Seite dafür
  eine Abfrage kostet. Das dunkle Theme wird zusätzlich über ein eigenes,
  ungezeichnetes Cookie ausgeliefert: `data-theme` steht am `<html>`-Element und
  muss im ersten Byte stimmen, sonst blitzt bei jeder Navigation kurz die helle
  Seite auf. Das Cookie wirkt damit auch für nicht Angemeldete, und die meisten
  Seiten hier sind öffentlich.

- **Zeitzonen, endlich als Regel statt als Zufall.** Die Anwendung zeigte Zeit
  bisher auf drei Arten gleichzeitig: fest `Europe/Berlin`, rohes ISO-UTC, und
  in den Plots stillschweigend UTC — im Winter eine, im Sommer zwei Stunden
  daneben, konstant genug, dass es niemandem auffiel. Plotly rechnet Zeitzonen
  nicht um, also steckt die Ortszeit jetzt schon im Wert (`lib/time-zone.ts`).

  Die Regel lautet: gespeichert wird immer UTC; angezeigt wird die wirksame Zone
  — die aus dem Profil, sonst die des Browsers; und **jede Zeit, die in einer
  anderen Zone steht, nennt sie.** Im Normalfall trägt damit keine Zeitangabe
  einen Zusatz, weshalb ein Kürzel etwas bedeutet. Ohne JavaScript steht überall
  UTC, sichtbar beschriftet, statt einer falschen Ortszeit ohne Hinweis.

- **Datengruppen** unter Verwaltung → Datengruppen, für Administratoren. Sie
  erklären, *welche* Verzeichnisgruppen als Datengruppen gelten — eine echte
  Teilmenge dessen, was im LDAP steht.

  Das trennt zwei Fragen, die beide von LDAP-Gruppen beantwortet werden: was
  jemand tun darf (die drei Rollengruppen) und welche Daten gemeint sind. Der
  Eintrag einer Rollengruppe wird abgewiesen, weil er sonst stillschweigend aus
  „darf verwalten" ein „darf diese Daten sehen" machen würde. Mitgliedschaften
  werden dabei **nicht** gespeichert: die Tabelle hält Namen, nie Personen, und
  es gibt keinen Weg, über den diese Anwendung jemandem eine Gruppe erteilen
  könnte. Noch ohne Wirkung — Messwerte tragen bisher keine Gruppe; die
  Zuordnung ist der nächste Schritt (`docs/benutzereinstellungen.md`).

- A configuration overview at `/management/config`, for administrators. It reads
  the running process rather than a document that can go stale, and answers the
  one question no file could: not *what may be set*, but *what took effect*.

  It opens with the optional features and, for each, the setting responsible —
  "Geräteverwaltung aus — TTN_API_KEY und TTN_APPLICATION_ID fehlt". That second
  half is the point. Deploying 1.6.1 left the device page an announcement because
  the stack still carried the compose file of 1.5.0 and never passed the new
  variables into the container; the variables were set, and from the screen there
  was no way to tell. Finding out took a `docker inspect` dump that exposed every
  production secret along the way. This block ends that search in a glance.

  Below it, every setting with a sentence on what it is for, its effective value
  and its **origin**: set in the environment, fallen back to the built-in
  default, or absent. Those two middle states look identical everywhere else and
  only diverge once somebody changes a default. Empty counts as unset, exactly as
  `config.ts` treats it, because compose passes an unresolved variable through as
  an empty string.

  Secrets are described rather than shown — `gesetzt (98 Zeichen, beginnt mit
  NNSXS.…)` — and connection strings appear with the password masked.
  Administrators can reveal one through a button, which is a POST and not a link:
  a link is something one follows by accident, and the value would otherwise sit
  in the browser history and in every proxy log that records URLs.

  The page also says what it can work out for itself, such as a `TTN_URL` holding
  the address of the web console instead of the cluster origin — a mistake made
  twice in this project.

  A test reads `config.ts` and insists that every variable it consults appears in
  the catalogue behind the page. A setting can therefore no longer be added
  without a sentence explaining it, which is the omission that let the broken
  deployment go unnoticed through a release in the first place.
- The legal pages are written in Markdown, in a text box. They used to be a
  single-line field whose only formatting was `\n` typed as two characters,
  which is a poor way to write an Impressum. Headings, paragraphs, lists, bold,
  italic, links and rules are supported; a blank line separates paragraphs while
  single line breaks are kept, so an address stays an address.

  The renderer escapes the source **before** it produces any markup, so raw HTML
  in the setting can never reach the page — a `<script>` comes out as the five
  characters somebody typed. That ordering is the security property, and it
  matters because these two pages are public: parsing first and sanitising
  afterwards would leave it to be got right in two places instead of one. Links
  are limited to `http`, `https`, `mailto` and internal paths, since
  `[hier](javascript:…)` is otherwise a working script.

  Values written before the box existed carry literal `\n` from the environment
  file; both spell the same intent and both become a line break.
- A setup account beside the directory, switched on with `ADMIN_USERNAME` and one
  of `ADMIN_PASSWORD_HASH` or `ADMIN_PW`. Until now a server without `LDAP_URL`
  had no login at all, and therefore no way to reach the pages on which LDAP
  itself is configured — a fresh installation could only be brought up by editing
  the environment by hand.

  It is for one person doing that job and does not replace the directory:
  everyone else signs in through LDAP as before and gets their roles from their
  groups, so the change log keeps showing real people's names. The account holds
  `admin`, which it needs because the configuration pages sit at the top of the
  ladder.

  Checked *before* the directory, and a name that matches is decided locally and
  only locally — a wrong password is refused rather than passed on. That keeps
  the name unambiguously the account's, stops anyone learning by trial whether a
  directory entry of the same name exists, and means a failed attempt costs one
  comparison rather than a comparison and a bind, so the response time does not
  say which path answered. The login throttle covers it like any other name.

  Prefer `ADMIN_PASSWORD_HASH`: whoever reads the environment — through
  `docker inspect`, the container platform or a copy of the compose file — then
  holds a hash and not a way in. `bun scripts/hash-password.ts` generates one and
  asks for the password without echoing it, so it reaches neither the shell
  history nor the process list. `ADMIN_PW` in the clear is allowed and says so in
  the log on every start.
- Settings can now be changed on `/management/config` instead of in the
  environment. Each one has its own small form, so a value is saved together with
  the note that explains it and a mistake in one field cannot take the rest with
  it. It works without JavaScript, like every other writing path here.

  A change takes effect for the next request — nothing waits for a restart,
  because the values are read on use rather than captured at startup. That holds
  for a value changed anywhere: one made in the SQL console, in `psql` or by a
  second instance behind the same database is picked up within a few seconds,
  and the legal pages appear and disappear with their text rather than with a
  restart.

  Each setting also carries a **note** — what it is set that way for. Not a
  reason typed while saving, which would be buried in a list a week later, but a
  line that stays beside the value it explains and can be corrected when the
  reasoning changes. `updated_by` and `updated_at` answer the rest: who touched
  it last, and when. A secret can be annotated without retyping it — an empty
  value field means "leave it alone".

  Configuration changes are deliberately **not** written to the Änderungsprotokoll.
  That log is about the data this application holds: every entry names a table and
  a row and can be written back, and a timeout is none of those things. Entries
  about settings would bury the question it exists to answer.

  Written through the same restricted connection the data pages use, not through
  the administrator one, although the page is administrators-only — that
  connection may read and write every table in the schema, and a page that has to
  change one row should not run on it.

  The origin column gained a third answer. A setting now reads **Datenbank**,
  **Umgebung**, **Vorgabe** or **nicht gesetzt**, and the page shows the value the
  application actually uses — so it cannot claim a source that is no longer
  consulted.

## [1.6.1] - 2026-08-08

### Changed
- The device id proposed when registering counts on - `device-4` when `device-1`
  to `device-3` exist - instead of being built from the DevEUI as
  `eui-a84041d6c184db82`. The devices registered by hand so far are named that
  way, and a proposal that does not match what is already there is not much of a
  proposal. It also stands in the field when the form opens rather than only
  being filled in on submit, so the name is visible while the rest is typed.

  It counts rather than fills gaps: with `device-1` and `device-3` present the
  answer is `device-4`, not `device-2`. A gap usually means that device was
  removed, and handing its number to different hardware would make two things
  share a name in everyone's notes and in the measurement history. Ids outside
  the scheme are ignored, so a `klasse-8b-fenster` alongside the numbered ones
  does not disturb the count, and the field stays editable - such a name says
  far more at a glance.

  The number is asked of TTN each time the form opens, because that is the only
  place that knows which ids are taken; this application keeps no device table.
  When the list cannot be fetched the field stays empty rather than proposing a
  name counted from an incomplete list, which could well be one already in use.

## [1.6.0] - 2026-08-08

### Added
- Device administration at `/management/devices`, which until now was an
  announcement. It lists what The Things Network has registered *next to* what
  has actually been arriving, and that pairing is the point: the TTN console
  knows nothing about measurements and the data pages know nothing about
  registrations, so two states were invisible from either side alone. A device
  registered months ago that has never sent anything now reads "stumm", and
  measurements piling up under a DevEUI that TTN no longer knows read
  "verwaist" - the readings stay, but nobody can configure that device any more.
  Trouble sorts to the top.

  Devices can be registered and renamed here. The form takes the numbers printed
  on the LA66 modules rather than generating any, and it accepts them in the
  spacing the TTN console shows - `A8 40 41 D6 C1 84 DB 82` - because those
  values are pasted, and a retyped 32-digit key is precisely where the errors
  come from. Frequency plan and LoRaWAN versions are stated rather than asked:
  they belong to the site, not to the device.

  Registering is four calls to four servers and no transaction, so the result
  page names each step on its own instead of saying it did not work. A failure
  rolls the earlier steps back, and when the rollback itself fails - the server
  that just refused a request may refuse the DELETE for the same reason - the
  page says which parts are still in TTN and under which device id. Without that
  sentence somebody would be left with half a device they do not know about, and
  the next attempt with the same id would fail on a conflict nobody could
  explain.

  Deleting is deliberately not here. It is four DELETEs with the same
  half-finished problem, and the least often needed; it stays with the console.
- A device's AppKey can be revealed on its detail page, by administrators only,
  and through a POST rather than a link - a link is something one follows by
  accident, and the key would otherwise sit in the browser history and in every
  proxy log that records URLs. It is fetched from the Join Server for that one
  response and never travels with the list or the detail page. Everyone else
  sees a sentence saying so, not a greyed-out button.
- A device log at `/management/devices/log`, recording who registered or renamed
  what, why, and how it went - including the half-finished case. It is separate
  from the Änderungsprotokoll on purpose, and says so: that log can take an entry
  back because every entry is a database row it can write again, and a device in
  TTN is not one. The pages append to it through the same restricted role they
  write data with, which holds `SELECT` and `INSERT` on it and nothing else, so
  they cannot tidy up their own record.

  All of this is opt-in through `TTN_API_KEY` and `TTN_APPLICATION_ID`; without
  them the page stays the announcement and no request leaves the server for TTN.
  Note that `TTN_API_KEY` is *not* `TTN_APP_KEY`, however alike they look: the
  old one is the word the webhook sends and this server compares, the new one may
  register devices and read their root keys. Setting both to one value would mean
  that whoever can read the webhook configuration in TTN can also administer the
  application, so the server now refuses to start when they match.

### Changed
- The login form's link behind `LDAP_PASSWORD_RESET_URL` is now labelled
  "Passwort ändern in der Nutzerverwaltung" rather than "Passwort vergessen?".
  What the variable usefully points at - lldap's interface, a school portal - is
  a place one has to be signed in to, which is exactly what someone with a
  forgotten password cannot do; the old label promised a way in and delivered
  another login form. Unset, the form still says to contact the administration.
- A deletion by filter is no longer refused for being too large. `MANAGE_MAX_DELETE`
  (default 10000) turned from a ceiling into a block size: the deletion runs in
  as many blocks as it takes, each its own short transaction, and a progress page
  between them says how far it is and offers to stop. With JavaScript it carries
  on by itself; without it, one click per block.

  This is a better answer to the reason the limit existed. A single statement
  removing four hundred thousand rows holds locks on the very table the webhook
  is inserting into for as long as it runs; between blocks those locks are free,
  so uplinks get in rather than queueing behind the deletion.

  Every block joins the batch the first one opened, so the change log still shows
  one operation and can take it back as one. Nothing is remembered on the server:
  the filter, the moment of the preview and the batch travel in the form, so
  closing the browser stops the deletion where it stands - what went is gone,
  recorded and undoable, and the rest is untouched. Starting the same deletion
  again simply continues, because the rows already gone no longer match.

  The confirmation page now also says how many log rows the deletion will write,
  since each removed row is kept there in full - that is what makes undoing it
  possible, and it is worth seeing before rather than after.
- `TRUSTED_PROXIES` is no longer a variable of `compose.prod.yml`; the file simply
  has the value it needs. It always puts Traefik in front and nothing else, so the
  only right answer is the default of `1` - there was nothing to configure, only
  something to get wrong. A `0` picked up from an env file would have made every
  request look as though it came from Traefik, and six wrong passwords anywhere
  would have locked the whole site out. `.env.prod.example` now says as much where
  the variable used to be listed, since setting it there has no effect any more.
  Should a further hop ever appear - a CDN, say - the variable belongs back in
  `compose.prod.yml`, one higher per hop.

## [1.5.0] - 2026-08-03

### Added
- Three levels of access, one containing the next, driven by directory groups named in
  `LDAP_DATA_GROUP`, `LDAP_MANAGEMENT_GROUP` and `LDAP_ADMIN_GROUP`. Membership
  is resolved at sign-in from LDAP — either from an attribute such as `memberOf`
  or by searching the group entries, which also works on an OpenLDAP without the
  memberof overlay — and travels in the session, so a change in the directory
  takes effect when the session expires.

  The levels form a ladder, each containing the one below: `data` is read-only
  access to the SQL page, `management` adds the "Verwaltung" section, `admin`
  adds the SQL page on a connection that may write. One group per person is
  therefore enough — an administrator does not also have to be in the other two.
  An unset `LDAP_DATA_GROUP` means "no restriction configured", so a deployment
  that never set up groups keeps working as before; unset management or admin
  groups mean nobody reaches those levels, so editing rights and write access are
  never granted by accident.
- Profile page at `/profile`, reached by clicking your own name in the header.
  It lists everything the application holds about you — login name, display
  name, the directory groups picked up at sign-in, the access levels those add
  up to, and when the session expires — and says plainly that this is all of it:
  there is no user table, only the signed cookie. It is also the place to look
  when a page is unexpectedly missing, since it shows which groups actually
  arrived.
- SQL page at `/sql`, under "Daten": type a statement, get a table back — or,
  for a statement that changed something, a confirmation of what it did. One page
  for both roles; which database connection it runs on is decided per request,
  so there is no second page to keep in step and no way to talk the page into
  more than the caller may do.

  Read-only is enforced by the database, never by inspecting the query text. The
  page needs `DATABASE_URL_READONLY`, a role that may only `SELECT` and carries
  `default_transaction_read_only = on`; without it the page does not exist.
  Administrators additionally need `DATABASE_URL_ADMIN`, a role that may change
  data in the application's tables but is no superuser and cannot touch the
  schema. Neither may be the application's own connection — that one owns the
  schema and is a superuser in the default Docker setup, where a `READ ONLY`
  transaction stops writes but not `pg_read_file()`, `pg_authid` or
  `COPY … TO PROGRAM`, and where a query can simply end the transaction with
  `COMMIT;`. The server refuses to start if `DATABASE_URL_ADMIN` points at it.
  Create both roles with `dev_scripts/create-readonly-role.sql` and
  `create-admin-role.sql`.

  A statement that would delete rows asks first, reporting the exact number: it
  is really executed and then rolled back, so the count is the true one rather
  than an estimate from `EXPLAIN`, and nothing is gone until the second click.
  Because Postgres reports only the last command of a multi-statement request —
  `DELETE FROM t; SELECT 1` arrives tagged `SELECT` — the writable console takes
  one statement at a time, recognising semicolons inside strings, identifiers,
  dollar-quoted bodies and comments as the ordinary characters they are.

  A statement timeout and a row cap applied inside the database keep a careless
  query from taking the site down with it; both are configurable
  (`QUERY_TIMEOUT_MS`, `QUERY_MAX_ROWS`, defaults 5000 ms and 200 rows).
- "Verwaltung" section in the header, for the management role only — everyone
  else gets a 404 rather than a hint that the page exists.
  - **Daten verwalten** (`/management/data`): an overview of the managed
    datasets, leading to the measurement and log entry tables below.
  - **Geräte verwalten** (`/management/devices`): still an announcement — adding,
    renaming and removing devices through TTN's REST API.
- Measurement management at `/management/data/measurements`: finding, correcting
  and removing measurements — an outlier from a failing sensor, a test reading
  from the workbench, a series recorded under the wrong location. Until now that
  meant the SQL console, which only administrators may write with and which
  records nothing.

  Searching and looking: filters for device, sensor, measurand, location and time
  range, sortable columns, and a column picker that is part of the filter, since
  hiding the columns you are not working on is the other half of finding the rows
  you are. All of it lives in the address, so reloading, the back button and
  sharing a link work without any client-side state, and every action returns to
  exactly the view it started from. Paging offers the surrounding page numbers
  rather than only "back" and "next".

  Changing: a switch turns the table into the form. In read mode the page
  contains no input fields at all — not disabled ones, not `readonly` ones — so a
  stray keystroke cannot change anything. In edit mode each editable cell is an
  input, a row can be saved with its own button, and a ticked selection can be
  saved together; a selection is shown cell by cell for confirmation first, while
  a click on one row's own button is unambiguous enough to go through directly.
  Device, datatype, time method and arrival time stay read-only: that is where a
  measurement came from, not a correction to it.

  Deleting: the ticked rows, or everything the current filter matched. Both show
  the affected rows themselves before anything happens — a count alone does not
  convince anyone that the filter was right — and the count is repeated inside
  the button.

  Every change needs a reason, and every change is recorded. The reason is
  required by the service, not merely by the form, so no route can write without
  one by forgetting to ask.
- Log entry management at `/management/data/log-entries`, the same page with a
  different configuration: filters for device, time range and a free-text search
  through the message, the same column picker, read and edit modes, per-row and
  bulk saving, and deletion with a preview.

  Only the message itself is correctable — a mis-worded line from a broken
  sketch, say. Which device sent it and when it arrived stay fixed, the same way
  a measurement's origin does, and a correction has to satisfy the rule an
  incoming message does (not empty, at most 200 characters), so it cannot produce
  a row the webhook could never have written. Every correction is recorded, so a
  rewritten message can still be traced back to what the device actually sent.

  The three routes behind a dataset — table, save, delete — are written once and
  registered per dataset, so the two pages cannot drift apart in what they check.
- Change log in a new `audit_log` table (migration `002`), written in the same
  transaction as the change it describes: there is no code path that produces one
  without the other. One entry per affected row rather than per action, so a
  single measurement's history is retrievable and a deletion is reconstructible
  from the full snapshot it leaves behind; a `batch_id` ties the rows of one
  action together. The time is the database's own — `occurred_at` defaults to
  `now()` and is never part of an insert, so there is no field through which the
  person making the change could suggest a different moment.

  The log is append-only *for the application*. Management writes go through
  `DATABASE_URL_MANAGE`, a role holding `SELECT` and `INSERT` on `audit_log` and
  nothing else, so the pages that write the log cannot rewrite it — the database
  refuses, not the page. Correcting an entry is possible only through the SQL
  console as an administrator. Without the variable the management pages still
  open, but read-only, and say so; a deployment that has not set up the role does
  not hand out write access by accident. It must not be the application's own
  connection, and the server refuses to start if it is. Create it with
  `dev_scripts/create-manage-role.sql`, or let the container do it.
- Change log pages at `/management/data/audit`, under "Verwaltung" beside the
  pages whose changes they record: readable by the management role, undoable by
  administrators.

  The list shows **operations**, one row per action rather than per changed row —
  deleting four hundred measurements with one click is one thing that happened,
  and listing it four hundred times would bury the moment someone is looking for.
  Opening an operation shows the individual changes: field by field for a
  correction, the complete row for a deletion or a restoration.

  Administrators can **take an operation back**, or single changes within one.
  That is not the same as removing it: the original entry stays untouched, the
  opposite operation runs, and it is recorded as a new entry pointing at the one
  it undid. A correction, its undo and the undo of that undo are three rows and
  one readable chain — so the way from the first reading to today's value can
  always be followed. Undoing needs a reason of its own, shows what it will do
  before it does it, and refuses when a row no longer holds what the entry left
  behind, rather than overwriting someone else's later work.

  This is what makes the management pages safe to hand to a class: a mistake is
  correctable by an administrator who does not know SQL, and nothing is lost on
  the way. The SQL console remains the emergency exit for the case where
  something has gone badly wrong — and what happens there is deliberately not in
  the log.
- `bun run ensure-roles`, also run by the container entrypoint after the
  migrations, creates and refreshes the restricted database roles from the DSNs
  that name them (`DATABASE_URL_READONLY`, `_ADMIN`, `_MANAGE`), so a deployment
  no longer needs a `psql` session on the server. The connection string is the
  single source of truth for name and password, an unset variable leaves that
  role untouched, and nothing is ever revoked — the guarantees here rest on
  privileges never having been granted rather than on a script taking them away.
- Indexes on `measurements`, which had none: device with measurement time, the
  measurement time on its own, and sensor — matching the expression the time
  filter uses — plus the columns the change log is read by.
- Concurrency is handled rather than hoped for. Every input carries the value it
  started from, and that value goes into the `WHERE` clause of the update: a row
  someone else changed in the meantime is reported as such and aborts the whole
  batch, because half a correction is worse than none. A deletion by filter
  carries the moment its preview was taken and is bounded by it, so a measurement
  that arrived through the webhook in the meantime cannot be caught by a deletion
  that never showed it, and the result is counted again before committing.
- Convenience through JavaScript, but nothing that depends on it: filtering,
  sorting, paging, editing, saving and deleting are forms and links. Added on top
  are the select-all checkbox in the table header (with the partial state), a
  marker on cells that differ from what they started as, a warning before leaving
  with unsaved edits, a dialog when the reason is missing, and edits in the other
  rows surviving a save instead of being lost to the reload.
- Tests for the management path: unit tests for reading the submitted form — what
  is dropped, what counts as a change, which button was pressed — and for the
  view state in the address, including the page-number window. Plus integration
  tests against a real Postgres for the promises that live in the database: that
  the management role may append to the change log but that `UPDATE` and `DELETE`
  on it are refused, that a change and its log entry share one transaction, that
  a stale starting value writes nothing, and that the entry is timestamped by the
  database.
- LDAP login at `/login`, reachable from a "Login" button at the right-hand end
  of the header, which turns into the signed-in user's name and a sign-out
  button. Configured entirely through environment variables and opt-in: without
  `LDAP_URL` the route and the button do not exist and the site is unchanged.
  Two bind strategies are supported — a direct bind via `LDAP_USER_DN_TEMPLATE`,
  or a service account that looks the user up first
  (`LDAP_BIND_DN` + `LDAP_SEARCH_BASE` + `LDAP_SEARCH_FILTER`), which also allows
  restricting access to a group. All settings are documented in `.env.example`;
  a configuration that cannot work is rejected at startup rather than at the
  first sign-in attempt.
  Sessions are stateless signed cookies (`HttpOnly`, `SameSite=Lax`, `Secure` in
  production) — no session table, but also no server-side revocation short of
  rotating `SESSION_SECRET`.
- `docker compose -f compose.dev.yml --profile ldap up -d openldap` starts a
  throwaway OpenLDAP directory with test users, a service account and a group, so
  the login can be developed and tested without a real directory. Documented in
  `packages/api/dev_scripts/ldap/README.md`.
- Tests for the login: unit tests for the session cookies and the DN/filter
  escaping, plus integration tests that authenticate against the directory above
  and cover both bind strategies, the group restriction, injection attempts and
  the empty-password case. The integration tests skip themselves when no
  directory answers, so `bun test` still works without Docker; CI starts the
  container and sets `LDAP_TESTS_REQUIRED=1` so a missing directory fails the
  build instead of silently skipping. The `/sql` page is covered the same way,
  against a real Postgres (`DB_TESTS_REQUIRED=1`), since what it may and may not
  do lives in the database and can only be verified there — including the
  attempts to escape the read-only transaction that the separate role exists to
  stop.
- ESP32 example `send_temperature_ds18b20.py`: reads a DS18B20 over 1-Wire using
  MicroPython's built-in `onewire`/`ds18x20` modules (no extra driver needed).
- `bun run sync-guide-assets` regenerates the guide assets under
  `public/guides/esp32` (images, example programs and the `loramint.zip`) from
  `packages/esp32`, which the API image cannot reach at build time. CI runs it
  and fails on any difference, so the committed copies can no longer go stale
  the way `loramint.zip` did. The archive is written with fixed timestamps and
  stored entries to keep that check byte-exact.
- `packages/ttn/uplink-formatter.js`: the TTN uplink payload formatter is now
  version-controlled alongside the encoders it mirrors, with a README covering
  installation, the wire format and its known rough edges. It previously existed
  only inside the TTN Console.
- The login now locks out after too many wrong passwords. The form previously
  answered as fast as it was asked — twenty attempts a second, measured — which
  made guessing a matter of patience rather than luck and made every attempt
  cost the directory a bind.

  What is counted is the *address*: five failures inside five minutes are
  allowed, whatever names they were aimed at, and the sixth locks that address
  for five minutes. A login name gets the same allowance counted in *sources*
  rather than in attempts: it is locked only once failures for it have come from
  more than five **different** addresses inside the window. That asymmetry is the
  point — counting per name alone would stop the guessing and hand out a new
  weapon, since anyone who knew a name could then keep that account locked for as
  long as they cared to. A single source can only ever contribute one address, so
  no one attacker can lock a real user out; it takes a genuinely distributed
  attempt, which is exactly when locking the name is right.

  While either lock stands the password is not checked at all, so a lock cannot
  be extended by hammering it, a locked request costs no LDAP round trip, and the
  correct password does not open it early either. Only a wrong password counts:
  an unreachable directory must not lock everyone out of a site that is merely
  having a bad day. The page answers `429` with `Retry-After` and says how long
  is left. State is held in memory and forgotten on restart — a speed bump, not
  a security boundary, and deliberately not worth a table and a migration.
- `TRUSTED_PROXIES` (default `1`) says how many reverse proxies sit in front, so
  the throttle above can tell one visitor from another. Behind Traefik every
  request arrives from Traefik, so without it all visitors would count as one and
  six wrong passwords anywhere would lock the whole site out. A proxy *appends*
  the address it saw, so the trustworthy entry in `X-Forwarded-For` is counted
  from the right and anything an attacker writes into the header lands to the
  left of it, where it is ignored. Set it to `0` for a server reachable directly,
  where the header is simply whatever the client felt like sending.

### Security
- The SQL page's row cap could be switched off with two extra characters. It was
  skipped whenever the query contained a `;` anywhere — including one inside a
  comment or a doubled terminator — and a skipped cap means the whole result set
  is fetched into the server process before being cut down to 200 rows for
  display. Measured: `SELECT … FROM measurements;;` over 300,000 rows cost 80 MB
  of heap and nine times the wall clock, while showing exactly what the same
  query without the semicolons showed. Any signed-in user could do it.

  Whether a query is one statement is now decided by the parser in
  `lib/sql-statements` rather than by searching for a semicolon, and the
  multi-statement refusal applies to both console levels instead of only to the
  writable one — it had been skipped for readers on the reasoning that a reader
  has nothing to delete, and that saving was the hole. The statement is also cut
  loose from its terminator properly (`singleStatement`) and wrapped across
  newlines, so a doubled `;`, a trailing comment, or `SELECT 1; -- Rest` produce
  valid SQL instead of a subquery with a semicolon in it.
- The TTN webhook checked its API key *inside* the handler, so the Zod validator
  ran first: a caller without the key got a `400` naming the fields it had got
  wrong, which is enough to reconstruct the expected payload without ever holding
  the key. The check is now middleware in front of the validator and answers
  `401` before anything reads the body.
- `Object.hasOwn` replaces `in` where `services/manage.ts` checks a column or
  table name against its whitelist. `in` also answers for the prototype chain, so
  `constructor` and `toString` counted as editable columns and as known tables.
  Not reachable — the form parser filters against a `Set` first, and `table_name`
  comes from the database — but the check now means what it says.

### Changed
- A management write that fails for an unforeseen reason is written to the server
  log. The routes map every failure to a fixed message code, so the reason was
  discarded on its way to the screen and recorded nowhere else: the user saw a
  sentence and the operator had nothing at all to go on.
- `compose.prod.yml` passes every setting the application knows through to the
  container - it previously carried five, so a production deployment could not
  have a login, an SQL page or the management section at all. Required variables
  now fail `docker compose up` with a sentence naming them instead of starting a
  server that cannot work; optional ones default to empty and quietly switch
  their feature off. `.env.prod.example` was brought along and now lists all of
  them, grouped by topic and split into required, required-once-the-feature-is-on
  and optional-with-a-default.
- An optional setting that is present but empty now counts as unset. Compose
  passes a variable it cannot resolve through as an empty string rather than
  leaving it out, and `LDAP_URL=""` would otherwise have switched the login on
  and then aborted the start for want of a session secret. The same trap turned
  an empty `QUERY_MAX_ROWS` into `NaN`.
- The container entrypoint now runs the migrations and then the database-role
  setup, aborting on either. Both are idempotent, and migration `002` is purely
  additive — a new table and new indexes, no existing column touched — so an
  older image keeps working against the new schema.
- Writing routes reject a request whose `Origin` names a foreign host.
  `SameSite=Lax` already means a cross-site POST arrives without the session
  cookie and fails the role check; this is a second, independent layer that still
  holds if the cookie settings are ever loosened.
- Header works on a phone. Below the `md` breakpoint the five dropdowns collapse
  into one menu button; the panel is capped at the viewport width and scrolls
  when it is taller than the screen, so it can no longer end up drawn off the
  left edge. The logo shrinks, and the account control moves into the menu,
  where there is room for the name. The entries come from one list rendered
  twice rather than two copies of the markup, so a new page cannot appear in one
  header and be missing from the other.

### Fixed
- ESP32: measurement uplinks are no longer zero-padded to a fixed 99 bytes. In
  EU868 the maximum application payload is 51 bytes at DR0–DR2 (SF12–SF10), so a
  padded message could not be transmitted on a weak link at all — the LA66
  acknowledged the `AT+SENDB` command but sent an empty frame, and no
  measurement ever arrived. A typical value now encodes to 31–39 bytes and fits
  every data rate. `sendValue()` also sends the real payload length instead of
  the hardcoded maximum, matching what `sendLog()` already did. The TTN formatter
  locates every field by its `0x1E` separator and decodes padded and unpadded
  payloads identically, so this is backwards compatible with the Arduino senders.
- The `loramint.zip` offered for download on `/guides/esp32` shipped a stale copy
  of the library and would have handed out the unsendable padded version; it is
  rebuilt from the current sources.
- Webhook: uplinks without a `decoded_payload` are acknowledged with
  `200 {ok: true, ignored: true}` instead of being rejected with `400`. Empty
  MAC-only frames (for example ADR answers) are normal LoRaWAN traffic; failing
  them made TTN log delivery errors and risked it disabling the webhook, which
  would have taken the working devices down with it.

## [1.4.0] - 2026-07-20

### Added
- Guides section behind a new "HowTo" nav dropdown, starting with
  `/guides/esp32`: a beginner-friendly ESP32 + Thonny getting-started guide
  rendered from the `packages/esp32` how-to, with copy-to-clipboard code blocks,
  click-to-zoom images, an accordion for troubleshooting, and downloadable
  example code plus the `loramint` library as a ZIP. Structured so further
  guides (Arduino, …) can be added as more dropdown entries.

### Changed
- Header navigation reorganised into topic dropdowns: "Daten"
  (Plots/Export/Status), "HowTo" (guides), "Code" (API Docs, GitHub) and
  "Kontakt" (Impressum, Datenschutz, when enabled). The dropdowns close each
  other on open and close on outside click / Escape so their panels never
  overlap. The redundant "Home" tab was dropped (the logo already links home).
- Home page no longer lists the data/service links directly; they now live in
  the header navigation.

## [1.3.0] - 2026-07-18

### Added
- Site favicon: a LoRaMINT icon served as SVG with a 32×32 PNG fallback for
  browsers without SVG-favicon support.

### Changed
- Header navigation groups the `/plots`, `/export` and `/status` pages under a
  single "Daten" dropdown (a no-JS `<details>` menu) instead of separate tabs,
  with a chevron indicator and a high-contrast, brand-coloured panel.
- Header bar uses a slightly stronger background (`base-300`) for better
  contrast against the page content.

## [1.2.0] - 2026-07-18

### Added
- Interactive `/export` page: pick a device, measurand, sensor, location,
  datatype and a time range, see how many measurements match, and download the
  filtered CSV. A configurable UI on top of the existing
  `GET /measurements/export` endpoint (no API change), replacing the raw export
  link on the home page.
- Server-rendered `/status` board: a debugging overview showing the latest
  measurement per device+sensor and the latest log entry per device, each with
  how many rows that group has sent and how long ago it was last seen, ordered by
  most recent activity. Auto-refreshes every 30 seconds; no client bundle. Backed
  by new `measurements.status()` / `logEntries.status()` service queries.
- Interactive `/plots` page: pick a device, measurands, sensors, location and a
  time range to plot measurement series as connected lines with per-point
  markers, rendered client-side with a self-hosted Plotly bundle (no third-party
  requests). Switch between an overlaid multi-axis view and stacked per-measurand
  charts, and export the chart as PNG (1–5× resolution factor) or SVG.
- `GET /measurements/metadata` returns the distinct `device_eui`s, measurands,
  sensors and locations present in the data (optionally narrowed by `device_eui`
  for cascading dropdowns), used to populate the `/plots` and `/export` filters.

## [1.1.0] - 2026-07-12

### Added
- `GET /measurements` and `GET /measurements/export` now accept optional query
  filters (`device_eui`, `measurand`, `sensor`, `location`, `datatype`,
  `from`/`to`) to narrow down results server-side, in preparation for the
  upcoming dashboard.

### Changed
- ESP32 library restructured into a `loramint` package installable via `mip`
  (`mpremote mip install github:LoRaMint/LoRaMINT_docker/packages/esp32`); the API
  import becomes `from loramint import LoRaMINT, MintValue`. Added example
  programs for value, log, temperature, humidity and pressure.

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

[Unreleased]: https://github.com/LoRaMint/LoRaMINT_docker/compare/v1.13.2...HEAD
[1.13.2]: https://github.com/LoRaMint/LoRaMINT_docker/compare/v1.13.1...v1.13.2
[1.13.1]: https://github.com/LoRaMint/LoRaMINT_docker/compare/v1.13.0...v1.13.1
[1.13.0]: https://github.com/LoRaMint/LoRaMINT_docker/compare/v1.12.0...v1.13.0
[1.12.0]: https://github.com/LoRaMint/LoRaMINT_docker/compare/v1.11.0...v1.12.0
[1.8.0]: https://github.com/LoRaMint/LoRaMINT_docker/compare/v1.7.0...v1.8.0
[1.7.0]: https://github.com/LoRaMint/LoRaMINT_docker/compare/v1.6.1...v1.7.0
[1.6.1]: https://github.com/LoRaMint/LoRaMINT_docker/compare/v1.6.0...v1.6.1
[1.6.0]: https://github.com/LoRaMint/LoRaMINT_docker/compare/v1.5.0...v1.6.0
[1.5.0]: https://github.com/LoRaMint/LoRaMINT_docker/compare/v1.4.0...v1.5.0
[1.4.0]: https://github.com/LoRaMint/LoRaMINT_docker/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/LoRaMint/LoRaMINT_docker/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/LoRaMint/LoRaMINT_docker/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/LoRaMint/LoRaMINT_docker/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/LoRaMint/LoRaMINT_docker/compare/v0.1.9...v1.0.0
[0.1.9]: https://github.com/LoRaMint/LoRaMINT_docker/releases/tag/v0.1.9
