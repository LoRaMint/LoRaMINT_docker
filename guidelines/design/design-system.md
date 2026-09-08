# Corporate Design

| | |
|---|---|
| **Status** | Verbindlich |
| **Stand** | 2026-09-03 |
| **Geltung** | Alle Medien: Web-Anwendung, Druck, Folien, Workshop-Materialien |
| **Werte** | `tokens.json` im selben Verzeichnis |
| **Prüfung** | `bun guidelines/design/pruefung.ts` |

Dieses Dokument ist **normativ** und beschreibt, **wie LoRaMINT aussieht** — in
jedem Medium, nicht nur am Bildschirm.

Schwesterdokumente: `packages/api/docs/guidelines.md` (wie Code hier geschrieben
wird), `packages/api/docs/konfiguration-verwalten.md` (Rechtsseiten, deren Text
aus der Einstellungstabelle kommt).

Die Umsetzung für Druck und Folien — LaTeX-Pakete, Beamer-Theme, Arbeitsblätter —
liegt im FDPi-Projekt (`ma-fdpi/design/latex/`), zusammen mit dem visuellen
Handbuch und der Entscheidungsgeschichte. Verbindlich sind die Regeln hier.

Dieses Dokument ist **normativ**. Es ist so geschrieben, dass es sowohl von
Menschen gelesen als auch von Sprachmodellen zuverlässig ausgewertet werden
kann: Jede Regel hat eine feste Kennung, ist als Gebot oder Verbot formuliert
und nennt ihre Werte vollständig, ohne Verweis auf andere Dateien.

**Normative Wörter.** `MUSS` / `DARF NICHT` = verbindlich, Abweichung ist ein
Fehler. `SOLLTE` = begründete Ausnahme möglich, Begründung gehört dokumentiert.
`KANN` = freigestellt.

**Rangfolge bei Widersprüchen.** `tokens.json` → dieses Dokument → alles andere.
Wer einen Farbwert ändert, ändert ihn in `tokens.json` zuerst und lässt danach
`pruefung.ts` laufen; sie vergleicht das Frontend gegen die Tokendatei und
meldet, was nicht mitgezogen wurde.

---

## 0 · Schnellreferenz

Wer nur einen Wert braucht, findet ihn hier. Alles Weitere begründet nur.

| Zweck | Wert |
|---|---|
| Markenfarbe | `#143C55` (dunkler Grund: `#5C9EC2`) |
| Neutral | `#51707A` |
| Erfolg / Warnung / Fehler | `#86B94C` / `#E6A817` / `#A81C13` |
| Schrift | Rubik, durchgehend, Ersatz `ui-sans-serif` |
| Radien | `0.5rem` Kästen, `0.25rem` Felder |
| Rahmen | `1px`, immer in `base-300` |
| Abstände | nur 4, 8, 12, 16, 24, 32, 48, 64 px |
| Lesebreite | 65 Zeichen |
| Logo-Mindesthöhe | 24 px Bildschirm, 8 mm Druck |
| Fokusring | `0 0 0 2px var(--base-100), 0 0 0 4px var(--primary)` |

---

## 1 · Das Grundprinzip: drei Ebenen

Das gesamte Farbsystem beruht auf einem Satz:

> **Marke färbt die Oberfläche, Signal färbt Zustände, Daten färben Messwerte —
> und keine Ebene borgt sich Farben aus einer anderen.**

| Ebene | Anzahl | Aufgabe |
|---|---|---|
| 1 Marke | 2 Farben | Kopfzeile, Buttons, Links, Flächen, Logo |
| 2 Signal | 3 Farben | Erfolg, Warnung, Fehler |
| 3 Daten | 8 Plätze | Messreihen in Diagrammen |

**GRUND-01** — Jede Farbe MUSS genau einer Ebene angehören.
**GRUND-02** — Eine Farbe DARF NICHT die Aufgabe einer anderen Ebene übernehmen.
Konkret: Signalrot DARF NICHT als Schaltflächenfarbe dienen, eine Datenfarbe
DARF NICHT in der Oberfläche auftauchen.
**GRUND-03** — Farbe allein trägt nie eine Information. Jeder farbcodierte
Zustand MUSS zusätzlich ein Wort oder ein Symbol tragen.

---

## 2 · Ebene 1: Marke

| Rolle | Hell | Dunkel | Verwendung |
|---|---|---|---|
| primary | `#143C55` | `#5C9EC2` | Kopfzeile, Primärbutton, Links, Fokusring |
| primary-content | `#FFFFFF` | `#0B1A24` | Text auf primary |
| neutral | `#51707A` | `#51707A` | Grautöne, Logo-Wortteil „LoRa“ |
| neutral-content | `#FFFFFF` | `#F2F6F8` | Text auf neutral |

**MARKE-01** — `#5C9EC2` ist keine zweite Farbe, sondern `#143C55` aufgehellt
für dunklen Grund. Beide DÜRFEN NICHT im selben Theme nebeneinander stehen.
**MARKE-02** — Alle Grautöne der Oberfläche werden aus `#51707A` abgeleitet,
nicht neutral gemischt. Das ist der Grund, warum die Basistöne leicht bläulich
sind; das ist beabsichtigt und DARF NICHT „korrigiert“ werden.
**MARKE-03** — Die Tokens `accent` und `info` existieren nicht mehr. Sie DÜRFEN
NICHT wieder eingeführt werden. (`accent` war ein unbenutztes zweites Rot,
`info` eine wortgleiche Kopie von `neutral`.)

### Flächen

| Token | Hell | Dunkel | Verwendung |
|---|---|---|---|
| base-100 | `#F8F9FA` | `#141F27` | Seitenhintergrund, Karten |
| base-200 | `#E9ECEF` | `#1B2932` | Fußzeile, abgesetzte Flächen, Code |
| base-300 | `#DEE2E6` | `#26363F` | Kopfzeile, **alle** Rahmen, Trennlinien |
| base-content | `#1A1A2E` | `#E6EDF1` | Textfarbe |

**MARKE-04** — Sekundärtext MUSS als Deckkraftstufe von `base-content`
entstehen, NICHT als eigener Grauton.
**MARKE-05** — Im **hellen** Theme sind für Text nur die Stufen **80 % und
70 %** zulässig. Nachgerechnet gegen `base-100`:

| Stufe | hell | dunkel |
|---|---|---|
| 80 % | 8,66:1 ✓ | 9,46:1 ✓ |
| 70 % | 6,14:1 ✓ | 7,52:1 ✓ |
| 60 % | 4,43:1 ✗ | 5,91:1 ✓ |
| 50 % | 3,25:1 ✗ | 4,51:1 ✓ |

60 % und 50 % verfehlen im hellen Theme die geforderten 4,5:1 und DÜRFEN dort
NICHT für Text verwendet werden — auch nicht für Zeitstempel, gerade weil die
klein gesetzt sind. Für reine Trennlinien und Rahmen bleiben sie zulässig.

---

## 3 · Ebene 2: Signal

| Zustand | Fläche | Text darauf | Kontrast |
|---|---|---|---|
| Erfolg | `#86B94C` | `#101A08` | 7,72:1 |
| Warnung | `#E6A817` | `#1A1A2E` | 8,10:1 |
| Fehler | `#A81C13` | `#FFFFFF` | 7,39:1 |

Im dunklen Theme: Erfolg `#8FC457`, Warnung `#E6A817` (unverändert), Fehler
`#E8635A`; Textfarben `#101A08`, `#241A02`, `#250806`.

**SIGNAL-01** — Signalfarben DÜRFEN NICHT dekorativ verwendet werden.
**SIGNAL-02** — Signalfarben DÜRFEN NICHT als Datenfarbe („Reihe 4“) dienen.
**SIGNAL-03** — Auf `#86B94C` DARF NICHT weißer Text stehen. Das war der Fehler
im Vorzustand: 2,32:1, also unlesbar. Korrekt ist `#101A08`.
**SIGNAL-04** — `#86B94C` ist zugleich das Grün des SFZ-Logos. Der Wert MUSS
exakt erhalten bleiben; die Verbindung zum Kooperationspartner ist gewollt.

### Hinweisboxen

```
Erfolg:   Rahmen success/40 %,  Fläche success/10 %
Warnung:  Rahmen warning,       Fläche warning/10 %
Fehler:   Rahmen error,         Fläche error/10 %
```

**SIGNAL-05** — Ein Fehler MUSS Hilfsmitteln angekündigt werden
(`role="alert"`). Eine Erfolgsmeldung DARF NICHT unterbrechen.

---

## 4 · Ebene 3: Daten

Feste Reihenfolge. Platz 1 wird zuerst vergeben, dann 2, dann 3.

| Platz | Ton | Hell | Dunkel |
|---|---|---|---|
| 1 | Petrolblau | `#0081C6` | `#0090DC` |
| 2 | Orange | `#EB6834` | `#D95926` |
| 3 | Aqua | `#1BAF7A` | `#199E70` |
| 4 | Gelb | `#EDA100` | `#C98500` |
| 5 | Magenta | `#E87BA4` | `#D55181` |
| 6 | Grün | `#008300` | `#008300` |
| 7 | Violett | `#4A3AA7` | `#9085E9` |
| 8 | Rot | `#E34948` | `#E66767` |

**DATEN-01** — Die Reihenfolge ist der Sicherheitsmechanismus gegen
Farbfehlsichtigkeit, nicht Geschmack. Sie DARF NICHT geändert werden.
**DATEN-02** — Farben werden NICHT zyklisch weitervergeben. Eine neunte Reihe
gibt es nicht; sie wird zu „Sonstige“ zusammengefasst oder das Diagramm wird in
Einzeldiagramme aufgeteilt.
**DATEN-03** — Die Farbe folgt der Sache, nicht dem Rang. Ein Filter, der die
Zahl der Reihen ändert, DARF die verbliebenen NICHT umfärben.
**DATEN-04** — In Streudiagrammen, Blasendiagrammen und Kleinserien liegt die
Obergrenze bei **drei** Reihen. Dort kann jede Farbe neben jeder anderen liegen;
mehr als drei sind dann nicht mehr sicher unterscheidbar.
**DATEN-05** — Mehrere Sensoren derselben Messgröße teilen sich die Farbe und
werden über den Linienstil unterschieden: `solid`, `dot`, `dash`, `dashdot`,
`longdash`.
**DATEN-06** — `#1BAF7A`, `#EDA100` und `#E87BA4` liegen auf heller Fläche unter
3:1. Wo sie vorkommen, MUSS die Beschriftung an der Linie stehen oder eine
Tabellenansicht angeboten werden.
**DATEN-07** — Ein Diagramm hat **eine** Werteachse. Zwei Messgrößen
verschiedener Größenordnung ergeben zwei Diagramme, nicht zwei Achsen.
**DATEN-08** — Ab zwei Reihen MUSS eine Legende vorhanden sein.

### Vierte Verwendung: Syntaxhervorhebung

Hervorgehobener Quelltext ist weder Oberfläche noch Zustand noch Messreihe und
fällt damit unter keine der drei Ebenen. Er bedient sich trotzdem bei der
**Datenpalette**, und das ist eine Entscheidung, keine Nachlässigkeit: Die
Aufgabe der Datenpalette ist genau die hier gebrauchte — mehrere Dinge auf einen
Blick auseinanderhalten —, und sie ist als einzige darauf geprüft worden.

**CODE-01** — Die Zuordnung ist fest: Schlüsselwörter `primary`, Zeichenketten
Datenplatz 3, hervorgehobene Bezeichner Datenplatz 7, Kommentare `neutral`.
**CODE-02** — Diese Verwendung gilt **nur innerhalb von Quelltext**. Sie hebt
`GRUND-02` nicht auf: Eine Datenfarbe DARF weiterhin NICHT in der übrigen
Oberfläche auftauchen.

### Zurückgenommen: der Ampelverlauf der Gauges

Frühere Fassungen dieses Leitfadens erlaubten den Gauges den Tailwind-Verlauf
`#22C55E → #EAB308 → #EF4444` als bewusste Ausnahme. Das ist **aufgehoben**.
Der Einwand war nicht, dass die Werte zu keiner Ebene gehören, sondern dass sie
etwas behaupten: grün→gelb→rot heißt „hoch ist schlecht“, und das trifft für
Temperatur, Luftdruck oder Helligkeit nicht zu. Siehe `KACH-01` und `KACH-02`.

---

## 5 · Schrift

**Rubik**, SIL Open Font License 1.1, durchgehend — auch für Fließtext,
Tabellen und Formulare.

| Schnitt | Verwendung |
|---|---|
| 300 Light | nur im Logo |
| 400 Regular | Fließtext |
| 500 Medium | Überschriften |
| 700 Bold | Titel, Hervorhebung |

**SCHRIFT-01** — Kursive wird NICHT als **Hervorhebung** verwendet;
Hervorhebung trägt Halbfett. Davon unberührt bleibt Kursive als eingeführte
Auszeichnung anderer Art — Werktitel in einem Literaturverzeichnis etwa. Sie
dort zu entfernen macht das Verzeichnis schlechter lesbar und gewinnt nichts.
**SCHRIFT-02** — Ersatzschrift ist `ui-sans-serif, system-ui, sans-serif`.
Das Laden MUSS mit `font-display: swap` geschehen, damit die Seite sofort
lesbar ist.
**SCHRIFT-03** — Gerätekennungen, Code und Zahlenkolonnen MÜSSEN dicktengleich
gesetzt werden (`ui-monospace, SFMono-Regular, Menlo, monospace`).
**SCHRIFT-04** — Wird die Schriftdatei weitergegeben (Webfont im Repository,
Materialien, Druckdatei), MUSS `OFL.txt` beiliegen. Sie liegt in
`packages/api/public/fonts/`.

### Schriftgrade

| px | rem | Tailwind | Verwendung |
|---|---|---|---|
| 36 | 2.25 | `text-4xl` | Folientitel, Deckblatt |
| 24 | 1.5 | `text-2xl` | Seitentitel im Druck |
| 20 | 1.25 | `text-xl` | Seitentitel im Web |
| 18 | 1.125 | `text-lg` | Abschnitt |
| 16 | 1 | `text-base` | Fließtext |
| 14 | 0.875 | `text-sm` | Tabellen, Nebentext |
| 12 | 0.75 | `text-xs` | Zeitstempel, Gerätekennung |

**SCHRIFT-05** — Andere Grade DÜRFEN NICHT verwendet werden.

---

## 6 · Logo

Master: `packages/api/public/logo_loramint.svg`. Farben ausschließlich `#143C55` und
`#51707A`. Seitenverhältnis 2,656 : 1.

| Variante | Datei | Farben | Einsatz |
|---|---|---|---|
| Farbig | `logo_loramint.svg` | `#143C55` / `#51707A` | helles Theme, heller Grund |
| Dunkel | `logo_loramint_dunkel.svg` | `#8FC8E8` / `#6A8B95` | dunkles Theme |
| Weiß | `logo_loramint_weiss.svg` | `#FFFFFF` | auf Petrol, auf Fotos |
| Einfarbig Petrol | `logo_loramint_petrol.svg` | `#143C55` | Graustufendruck, Stempel |
| Archiv | `logo_loramint_original.svg` (nur im FDPi-Projekt) | `#8A949C` | Vorzustand, nicht verwenden |

**LOGO-01** — Die Schrift im Logo MUSS in Pfaden vorliegen. Als lebender Text
wird das Logo auf jedem Rechner ohne installiertes Rubik falsch dargestellt.
**LOGO-02** — Mindesthöhe 24 px am Bildschirm (empfohlen ab 28 px), 8 mm im
Druck. Darunter zerfällt der Wortteil „LoRa“.
**LOGO-03** — Schutzraum ringsum: ein Viertel der Logohöhe. Darin keine
Schrift, keine Linie, kein Bildrand.
**LOGO-04** — Auf Petrol MUSS die weiße Variante verwendet werden. Die farbige
erreicht dort 2,18:1.
**LOGO-05** — Das Logo DARF NICHT verzerrt, gekippt, umgefärbt oder mit Effekten
versehen werden.
**LOGO-07** — Im dunklen Theme MUSS `logo_loramint_dunkel.svg` verwendet
werden. Die helle Fassung erreicht auf der dunklen Kopfzeile `#26363F` für den
Wortteil „MINT“ nur 1,07:1 und ist dort unsichtbar. Die dunkle Fassung setzt
„MINT“ auf `#8FC8E8` (6,89:1) und „LoRa“ auf `#6A8B95` (3,41:1) — Faktor 2,0
und damit dieselbe Gewichtung wie im hellen Theme (8,92:1 zu 4,08:1).
**LOGO-09** — Die einfarbige Petrol-Fassung ist eine **Druckvariante** und wird
mit der Web-Anwendung bewusst NICHT ausgeliefert. Sie liegt nur unter
im FDPi-Projekt unter `design/assets/`. Wer sie in `packages/api/public/`
vermisst, hat nichts gefunden, sondern diese Entscheidung übersehen.

**LOGO-08** — `#8FC8E8` gilt ausschließlich im Logo. Für Flächen und Buttons
bleibt `#5C9EC2` die dunkle Markenfarbe; das Logo ist ein Sonderfall und DARF
NICHT als Beleg für eine zweite Markenfarbe herangezogen werden.

**LOGO-06** — Bei Partnermaterial steht LoRaMINT links, Partnerlogos rechts,
alle auf gleicher optischer Höhe, mindestens ein Schutzraum Abstand. Auf
Hochschulmaterial führt das Uni-Logo.

---

## 7 · Maß und Form

**FORM-01** — Abstände MÜSSEN aus dieser Liste stammen: 4, 8, 12, 16, 24, 32,
48, 64 px. Andere Werte sind ein Layoutproblem, kein Abstandsbedarf.
**FORM-02** — Radien: `0.5rem` für Kästen (Karten, Tabellen, Hinweisboxen,
Menüs), `0.25rem` für Bedienelemente (Felder, Buttons). Ein dritter Radius
existiert nicht.
**FORM-03** — Rahmen sind immer `1px` und immer in `base-300`.
**FORM-04** — Fließtext bricht bei **65 Zeichen** um. Tabellen und Diagramme
DÜRFEN breiter laufen.
**FORM-05** — Es gibt genau **eine** Schattenstufe:
`0 4px 12px rgb(20 60 85 / 0.16)` — das Markenpetrol bei 16 %, kein
beliebiges Grau. Im Frontend liegt sie als Token `--shadow-raised` und wird als
Klasse `shadow-raised` benutzt, NICHT als wiederholtes Literal. Sie ist Menüs und Überlagerungen
vorbehalten. Alles andere wird durch Rahmen abgegrenzt, NICHT durch Schatten.

---

## 8 · Bedienelemente

### Fokus

```css
:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--base-100), 0 0 0 4px var(--primary);
}
```

**FOKUS-01** — Jedes bedienbare Element MUSS diesen Ring tragen.
**FOKUS-02** — Der Auslöser MUSS `:focus-visible` sein, nicht `:focus` — sonst
sehen ihn auch Mausbedienende, wo er nur stört.
**FOKUS-03** — Der Ring ist **zweifarbig**: innen 2 px in der Flächenfarbe als
Abstand, außen 2 px voll deckendes Petrol. Der Abstandsring ist der Grund,
warum er auf jedem Untergrund funktioniert — ein einfarbiger Petrol-Ring
verschwindet auf einem Petrol-Button (1,00:1).
**FOKUS-04** — Halbtransparente Ringe DÜRFEN NICHT verwendet werden. 45 %
Deckung ergibt 2,45:1 gegen die Fläche und verfehlt die geforderten 3:1.

### Buttons

| Form | Aussehen | Verwendung |
|---|---|---|
| Primär | gefüllt in `primary` | höchstens **eine** je Ansicht |
| Umriss | Rahmen in `primary` | gleichrangige Alternativen |
| Geist | ohne Rahmen und Fläche | Abbrechen |
| Löschen | Rahmen in `error`, mit Symbol | zerstörende Aktionen |

**BUTTON-01** — „Löschen“ ist ein **Umriss**, damit Rot Signalfarbe bleibt und
nicht zur Schaltflächenfarbe wird.
**BUTTON-01a** — *Eng gefasste Ausnahme:* Auf einer Bestätigungsseite oder in
einem Bestätigungsdialog, wo das Löschen die **einzige** Primäraktion ist, DARF
der Button gefüllt sein. Dort soll die Warnung am lautesten sein, und es steht
keine andere Primäraktion daneben, mit der er konkurrieren könnte. Diese
Ausnahme DARF NICHT auf gewöhnliche Seiten mit Löschbuttons in Listen oder
Werkzeugleisten ausgeweitet werden.
**BUTTON-02** — „Löschen“ MUSS Symbol **und** Wort tragen.
**BUTTON-03** — Deaktivierte Buttons: 45 % Deckkraft, Zeiger `not-allowed`.

### Formularfelder

**FELD-01** — Ein Fehler MUSS als Text unter dem Feld stehen, nicht nur als
rote Umrandung.
**FELD-02** — Siehe `FELD-03` und `FELD-04` im Abschnitt Bauteile: Die
Kennzeichnung erfolgt als Wort, und `required` wird von der Komponente
mitgesetzt.

### Symbole

**SYMBOL-01** — 24er Raster, 2 px Strichstärke, keine Flächen, Farbe immer
`currentColor`. So folgen sie Theme und Textfarbe von selbst.

---

## 9 · Bauteile der Anwendung

Diese Regeln betreffen konkrete Bauteile des Frontends. Sie ändern **Muster,
nicht Anordnung**: Fläche, Position und Verhalten der Bauteile bleiben, wie sie
sind.

### Kopfzeile

**KOPF-01** — Die aktuelle Seite MUSS in der Navigation markiert sein: 2 px
Unterstrich in `primary`, Schriftschnitt 500. Ohne sie sieht man der Leiste
nicht an, wo man ist.
**KOPF-02** — Die Reiter-Optik bleibt, aber das Aufklappmenü MUSS bündig an den
geöffneten Reiter anschließen. Ein hochgezogener Reiter kündigt eine
angeschlossene Fläche an; schwebt das Menü frei darunter, ist das Versprechen
gebrochen. Umsetzung: Der offene Reiter trägt `base-100`, verliert seinen
unteren Rand und überlappt das Menü um 1 px.
**KOPF-03** — Das Aufklappmenü steht auf `base-100` mit 1-px-Rahmen in
`base-300`, NICHT auf `primary`. Der aktive Eintrag darin trägt `primary`.
**KOPF-04** — Das Menü verwendet die eine Schattenstufe aus `FORM-05`, NICHT
`shadow-lg`.
**KOPF-05** — Der Login steht als **Umriss**-Button. Ein Primärbutton in der
Kopfzeile konkurriert auf jeder Seite mit deren eigener Primäraktion und
verstößt gegen `BUTTON-01`.
**KOPF-06** — Leistenhöhe 56 px, Logo 40 px. Unverändert bleiben: Fläche
`base-300`, Logo links, Menü rechts, Aufklappen per Klick, Struktur auf dem
Telefon.

### Tabellen und Datenansichten

Unverändert bleiben Rahmen, Zebrastreifen, Dichte und das seitliche Scrollen.
`TableFrame` und `EmptyRow` bleiben die einzigen Stellen, an denen eine Tabelle
und ihr Leerzustand gebaut werden.

**TAB-01** — Zahlenspalten MÜSSEN rechtsbündig und dicktengleich gesetzt sein
(`font-variant-numeric: tabular-nums`). Sonst stehen Einer- und Zehnerstellen
nicht untereinander und Werte lassen sich nicht spaltenweise vergleichen.
**TAB-02** — Wert und Einheit MÜSSEN in getrennten Spalten stehen: die Zahl
rechtsbündig, die Einheit linksbündig daneben. Bei gemischten Einheiten in einer
Spalte (`°C`, `%`, `hPa`) richtet Rechtsbündigkeit sonst die Einheit aus statt
das Komma, und `TAB-01` verpufft.
**TAB-03** — Gerätekennungen MÜSSEN dicktengleich gesetzt sein (`SCHRIFT-03`).
**TAB-04** — Der Spaltenkopf MUSS beim Scrollen stehen bleiben
(`position: sticky`).
**TAB-05** — Die Zeile unter dem Zeiger hebt sich mit 8 % `primary` ab.
**TAB-06** — Jede Trefferfläche MUSS mindestens 24 × 24 px groß sein
(WCAG 2.5.8). Betrifft besonders das × an den Filter-Chips, das sonst nur ein
Zeichen breit ist.
**TAB-07** — Der leere Zustand MUSS den Grund nennen und einen nächsten Schritt
anbieten, nicht nur „Keine Einträge“.

### Formulare und Dialoge

Unverändert bleiben: Das Label umschließt das Bedienelement (keine `id`/`for`-Paare,
die auseinanderlaufen können), die Fehlermeldung ersetzt den Hinweis statt sich
danebenzustellen, Gruppen tragen `<fieldset>` und `<legend>`, und der Löschdialog
zeigt die betroffenen Zeilen samt Anzahl im Button.

**FELD-03** — Pflichtfelder werden mit dem Wort „Pflichtfeld“ gekennzeichnet,
NICHT mit einem bloßen Sternchen. Ein rotes `*` ohne Legende setzt Vorwissen
voraus.
**FELD-04** — Die Feld-Komponente MUSS `required` am Bedienelement selbst
mitsetzen. Anzeige und Prüfung DÜRFEN NICHT getrennt gepflegt werden — sonst
steht die Kennzeichnung an einem Feld, das der Browser nicht prüft.
**DLG-01** — In Bestätigungsdialogen steht die sichere Aktion („Abbrechen“)
**links** und mit deutlichem Abstand zur zerstörenden. Beide DÜRFEN NICHT
unmittelbar nebeneinanderliegen.
**DLG-02** — Beim Öffnen MUSS der Fokus auf der sicheren Aktion stehen, nicht am
Seitenanfang. Sonst führt der Weg mit der Tastatur erst durch die gesamte
Vorschau.
**DLG-03** — Der Warnhinweis nennt, was passiert, und dass noch nichts passiert
ist. Die Anzahl der betroffenen Datensätze steht auch im Button.

### Kacheln und Gauges

Unverändert bleiben: reine Serverdarstellung ohne Client-Skript, quadratische
Kachel, deutsche Zahlenschreibweise („24,1“).

**KACH-01** — Der Bogen wird **einfarbig** in `primary` gefüllt (Verlauf
`#5C9EC2` → `#143C55`, im dunklen Theme umgekehrt). Er zeigt den Füllstand und
wertet NICHT.
**KACH-02** — Ein Ampelverlauf DARF NUR verwendet werden, wo für die Messgröße
ein Sollbereich hinterlegt ist. Ohne Sollbereich behauptet grün→gelb→rot „hoch
ist schlecht“ — für Temperatur, Luftdruck oder Helligkeit ist das falsch.
**KACH-03** — Die Einheit MUSS am Wert stehen, nicht als eigene Zeile weiter
unten. Der Wert ohne seine Einheit ist unvollständig.
**KACH-04** — Die Skalenenden (`min`, `max`) MÜSSEN an den Bogenenden
beschriftet sein. Ein zu 60 % gefüllter Bogen ist ohne Bereichsangabe nicht
lesbar.
**KACH-05** — Der Zeitstempel steht in `base-content/70`, nicht `/50`
(siehe `MARKE-05`).

### Seitengerüst und Fußzeile

**GER-01** — Der Seitentitel MUSS ein `<h1>` sein. Bisher war er ein `<h2>`,
womit auf den meisten Seiten die oberste Überschriftenebene fehlte und die
Gliederung bei Stufe 2 begann.
**GER-02** — Jede Seite verwendet dieselbe Titelkomponente. Impressum,
Datenschutz und die ESP32-Anleitung hatten ein eigenes `<h1>` in einer anderen
Größe — zwei Muster für dieselbe Sache.
**GER-03** — Fließtext bricht bei 65 Zeichen um, nicht bei `max-w-3xl`
(768 px ≈ 87 Zeichen). Tabellen, Code und Diagramme DÜRFEN breiter laufen.
**GER-04** — Das Logo in der Fußzeile ist Dekoration und trägt `alt=""`. Mit
Alternativtext wird es vorgelesen, obwohl dasselbe Logo schon in der Kopfzeile
steht.
**GER-05** — Trenner zwischen Fußzeilen-Links sind sichtbare Zeichen mit
`aria-hidden="true"`, kein leeres `<span> </span>`.
**GER-06** — Die Fußzeile trägt eine 1-px-Linie in `base-300` nach oben.
`base-200` gegen `base-100` allein ergibt 1,09:1 und grenzt nicht ab.

**Bewusst nicht: ein Sprunglink.** Geprüft und verworfen. `Layout.tsx` setzt
bereits `<header>`, `<nav>`, `<main>` und `<footer>`; wer mit einem Screenreader
arbeitet, erreicht den Inhalt darüber schon heute per Bereichsnavigation. Übrig
bliebe der Gewinn für sehende Tastaturnutzer — fünf bis acht Tastendrücke pro
Seite. Das wurde gegen ein zusätzliches Element im Fokuslauf abgewogen und
verworfen. Wer die Bereichsmarken entfernt, muss diese Abwägung neu führen.

## 10 · Anti-Muster

Trifft eines davon zu, ist die Umsetzung falsch.

| Nr. | Anti-Muster | Stattdessen |
|---|---|---|
| A1 | Weißer Text auf `#86B94C` | `#101A08` |
| A2 | Roter gefüllter Button außerhalb einer Bestätigungsseite | Umriss in `error` (Ausnahme: `BUTTON-01a`) |
| A3 | Datenfarbe in der Oberfläche | Markenfarbe |
| A4 | Signalfarbe als Diagrammreihe | Datenpalette, Platz 1..8 |
| A5 | Neunte Reihe durch Farbwiederholung | „Sonstige“ oder Einzeldiagramme |
| A6 | Zwei Werteachsen in einem Diagramm | zwei Diagramme |
| A7 | Zustand nur über Farbe | Farbe **und** Wort oder Symbol |
| A8 | Eigener Grauton für Nebentext | Deckkraftstufe von `base-content` |
| A20 | Text in `base-content/50` oder `/60` im hellen Theme | mindestens `/70` |
| A9 | Schatten zur Abgrenzung von Karten | 1-px-Rahmen in `base-300` |
| A10 | Logo als lebender Text | Pfadfassung |
| A11 | Farbiges Logo auf Petrol | weiße Variante |
| A12 | `accent` oder `info` wieder einführen | entfällt ersatzlos |
| A13 | Kursive zur Hervorhebung | Halbfett |
| A14 | `:focus` statt `:focus-visible` | `:focus-visible` |
| A15 | Dunkles Theme durch Invertieren | eigene, geprüfte Werte |
| A16 | Messwerte linksbündig | rechtsbündig, dicktengleich |
| A17 | Wert und Einheit in einer Spalte | zwei Spalten |
| A18 | Trefferfläche kleiner als 24 px | mindestens 24 × 24 px |
| A19 | Aufklappmenü schwebt unter dem Reiter | bündig anschließen |

---

## 11 · Warum das dunkle Theme kein invertiertes helles ist

Zwei Entscheidungen, die beim Ableiten leicht verloren gehen:

1. **Das Petrolblau wird aufgehellt.** `#143C55` ist auf dunklem Grund fast die
   dunkelste Farbe der Seite; ein Button darin verschwände. `#5C9EC2` liest sich
   als dieselbe Farbe, bleibt aber sichtbar.
2. **Die Kontrastfarben werden neu gewählt**, jeweils gegen den eigenen
   Hintergrund. Weiß auf dem aufgehellten Blau wäre Hell-auf-Hell.

Die dunklen Basistöne sind zudem ins Petrol getönt statt neutral grau, damit
beide Themes verwandt wirken statt bloß entgegengesetzt.

**THEME-01** — Das Theme MUSS im ersten Byte HTML feststehen, als `data-theme`
am `<html>`-Element. Alles, was die Farbe nachträglich korrigiert, zeigt bei
jeder Navigation kurz die helle Seite.

---

## 12 · Umsetzung je Medium

### Web (Tailwind 4 + daisyUI 5)

Maßgeblich ist `packages/api/frontend/styles/global.css`.
`packages/api/public/global.css` ist das Kompilat und wird NICHT von Hand
bearbeitet.

Offene Änderungen am Bestand, nach Aufwand geordnet:

| Änderung | Ort | Aufwand |
|---|---|---|
| `success-content` auf `#101A08` | global.css, 1 Zeile | Minuten |
| `accent`, `info` löschen | global.css, 4 Zeilen | Minuten |
| Diagrammpalette tauschen | plots/client.ts, 1 Feld | Minuten |
| Rubik als Webfont einbinden | global.css + assets | überschaubar |
| Fokusring zentral setzen | global.css + Durchgang | überschaubar |
| Rote Sekundärbuttons ersetzen | diverse Seiten | Handarbeit |

### LaTeX

```latex
\usepackage{xcolor}
\definecolor{loramintPetrol}{HTML}{143C55}
\definecolor{loramintBlaugrau}{HTML}{51707A}
\definecolor{loramintErfolg}{HTML}{86B94C}
\definecolor{loramintWarnung}{HTML}{E6A817}
\definecolor{loramintFehler}{HTML}{A81C13}
```

**LATEX-01** — Für Rubik MUSS LuaLaTeX oder XeLaTeX verwendet werden;
`pdflatex` kann die Schrift nicht einbinden. Ersatz bei `pdflatex`: `helvet`.
**LATEX-03** — Rubik ist eine **variable** Schrift. Die Gewichte MÜSSEN über
`RawFeature={axis={wght=…}}` angefordert werden. Ohne das greift LaTeX die
Vorgabeinstanz der Datei — und die ist *Light*, ohne jedes Fett. Ein schlichtes
`\setmainfont{Rubik}` ergibt also zu dünnen Text und stille Ersatzschriften.
**LATEX-04** — Dicktengleich ist **JetBrains Mono**, nicht Latin Modern Mono.
Sie steht wie Rubik unter der SIL OFL 1.1 ohne Reserved Font Name und ist auf
Lesbarkeit auf Distanz entworfen — auf einer Leinwand zählt das mehr als auf
einem Bildschirm. Sie liegt in TeX Live und wird nicht mitgeliefert; wer sie
doch weitergibt, legt ihre `OFL.txt` bei.
**LATEX-05** — Codesatz MUSS auf festem Zeichenraster stehen
(`columns=fixed` bei `listings`). `fullflexible` setzt jedes Zeichen auf seiner
natürlichen Breite und hebt damit auf, was eine dicktengleiche Schrift
ausmacht — bei Python ist die Einrückung die Struktur.
**LATEX-06** — Radien und Rahmenstärken haben im Druck **eigene Werte**:
Radius **2 pt**, Rahmen **0,6 pt**. Die Web-Werte (`0.5rem`, `1px`) lassen sich
nicht übertragen — `rem` hängt an einer Grundschrift, die es im Druck so nicht
gibt, und `px` an einer Auflösung. Im Druck gibt es nur *einen* Radius, weil es
dort keine Eingabefelder gibt, von denen ein Kasten zu unterscheiden wäre.
**LATEX-07** — `\alert{}` bedeutet in diesem Theme **Warnung**, nicht
Hervorhebung; es färbt in Signalrot. Für Hervorhebung im Fließtext gilt weiter
`SCHRIFT-01`: Halbfett. Wer `\alert{}` zum Betonen benutzt, verstößt gegen
`SIGNAL-01`.
**LATEX-02** — Logos liegen als PDF neben den SVG-Dateien; im FDPi-Projekt
unter `design/assets/`.

### Uni-Ulm-Material

Auf Hochschulmaterial (Proposal, Ausarbeitung) führt das Uni-Ulm-Violett
`RGB(127,119,179)` die Gestaltung. Das ist kein Widerspruch: Die Uni-Farbe
kennzeichnet den Hochschulkontext, das Petrolblau die Software. Sobald
LoRaMINT-Material gestaltet wird, führt `#143C55`.

---

## 13 · Herkunft der Werte

Damit nachvollziehbar bleibt, was gemessen und was entschieden wurde:

- Die Farbwerte der Marke stammen aus dem Logo und dem bestehenden Frontend.
- Die Datenpalette wurde gegen sechs Prüfungen gerechnet (Helligkeitsband,
  Buntheit, Trennschärfe bei simulierter Rot-Grün-Blindheit, Trennschärfe bei
  normalem Sehen, Kontrast zur Fläche) und besteht sie in beiden Themes.
  Schlechtestes Nachbarpaar: ΔE 9,1 hell / 8,4 dunkel.
- Die Vorgängerpalette fiel durch: `#D62728` und `#2CA02C` lagen benachbart und
  kollabierten bei Deuteranopie auf ΔE 3,9.
- Alle Kontrastwerte sind WCAG-Verhältnisse, nachgerechnet, nicht geschätzt.
- Die Logo-Mindestgröße wurde durch Rendern in sechs Größen bestimmt.
