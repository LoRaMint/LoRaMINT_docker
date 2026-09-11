# Geräte verwalten — Konzept der Oberfläche

| | |
|---|---|
| **Status** | Umgesetzt in Version 1.6 |
| **Stand** | 2026-08-05 |
| **Meilenstein** | 1.6 „Geräteverwaltung" (`version_meilstones.md`) |
| **Geltung** | `/management/devices` und die Unterseiten darunter |

Dieses Dokument beschreibt, **wie sich die Geräteseiten bedienen** — nicht, wie
sie gebaut sind. Es ist die Vorgabe, gegen die die Umsetzung geprüft wird;
weicht die Implementierung ab, ist entweder das Dokument oder der Code zu
korrigieren, nicht beides stillschweigend auseinanderzulassen.

Schwesterdokument: `daten-verwalten.md` (Meilenstein 1.5). Die Geräteseite folgt
dessen Muster bewusst nur zum Teil, und der Grund steht gleich im ersten
Abschnitt.

---

## Ausgangslage

`/management/devices` war auf `requireRole("management")` gesetzt und rendert
`<Planned/>`. Wer ein Gerät aufbaute, legte es in der TTN-Console an und trug
hier nichts nach — was dazu führt, dass niemand die beiden Listen nebeneinander
sieht: was registriert ist, und was tatsächlich sendet.

**Der entscheidende Unterschied zu 1.5:** Die Zeilen dieser Seite sind keine
Datenbankzeilen. Ein Gerät liegt in The Things Network, in vier getrennten
Registern (Identity, Join, Network, Application Server). Damit fällt fast alles
weg, worauf die Datenseiten gebaut sind — es gibt keine Auswahl-Checkbox, kein
Sammelspeichern, keinen Blockbetrieb und vor allem keine Rücknahme, weil es
nichts gibt, das man zurückschreiben könnte.

## Die vier Vorgaben

1. **Beide Seiten in einer Tabelle.** Was in TTN registriert ist *und* was
   Messwerte liefert — die Vereinigungsmenge, nicht der Schnitt.
2. **Ein Vorgang, der halb durchging, wird als halb durchgegangen gemeldet.**
   Anlegen sind vier Aufrufe; „hat nicht geklappt" wäre gelogen.
3. **Der AppKey ist nie auf einer Seite, die ihn nicht ausdrücklich anfordert.**
4. **Eigenes Protokoll.** Getrennt vom Änderungsprotokoll, und ohne Rücknahme.

---

## Der Seitenaufbau

Vier Seiten. Die Übersicht ist die einzige, die man im Alltag aufruft.

```
/management/devices              Übersicht — die Vereinigungsmenge
/management/devices/new          Anlegen (Formular → Ergebnisseite)
/management/devices/:deviceId    Ein Gerät: Stammdaten, Aktivierung, Umbenennen
/management/devices/log          Das Geräteprotokoll
```

Ohne `TTN_API_KEY` und `TTN_APPLICATION_ID` bleibt `/management/devices` die
Ankündigung, die sie vorher war, und es geht keine Anfrage an TTN hinaus. Das
ist dieselbe Opt-in-Logik wie bei der SQL-Konsole: eine Funktion, die nicht
eingerichtet ist, existiert nicht — statt halb da zu sein und zu scheitern.

### 1. Die Übersicht (Vorgabe 1)

```
Name          Geräte-ID    DevEUI                    Zuletzt gehört     Messwerte  Logs  Zustand
Fenster 8b    device-1     A8 40 41 D6 C1 84 DB 82   05.08.2026 09:14      12.480     3  [aktiv]
Flur EG       device-4     A8 40 41 D6 C1 84 DB 90   —                          0     0  [stumm]
Werkbank 2    device-7     A8 40 41 D6 C1 84 DB 95   06.08.2026 11:40           0    17  [aktiv]
nicht in TTN  —            A8 40 41 D6 C1 84 AA 01   02.08.2026 17:02         840     0  [verwaist]
```

Drei Zustände, und die letzten beiden sind der eigentliche Zweck der Seite:

| Zustand | Bedeutung |
|---|---|
| **aktiv** | In TTN registriert, in den letzten 24 Stunden kam etwas an. |
| **stumm** | In TTN registriert, aber nichts (mehr) empfangen. Der Aufbau steht noch im Schrank — oder er ist defekt. |
| **verwaist** | Messwerte oder Logs unter einer DevEUI, die TTN nicht (mehr) kennt. Die Daten bleiben; konfigurieren kann das Gerät dort niemand mehr. |

**„Etwas" ist ein Messwert oder eine Log-Nachricht**, und die dritte Zeile oben
ist der Grund: ein Aufbau, der noch geflasht wird oder dessen Sensor noch nicht
angelötet ist, sendet nur Meldungen. Er redet — ihn „stumm" zu nennen würde
jemanden nach einem Fehler suchen lassen, den es nicht gibt. Deshalb heisst die
Zeitspalte **Zuletzt gehört** und nicht „Letzter Messwert", und deshalb stehen
Messwerte und Logs getrennt daneben: der Zustand zählt beides, die Zahlen sagen
welches davon. Beide Zahlen führen auf die Datenseite des jeweiligen Geräts.

Beides ist von einer Seite allein unsichtbar: die TTN-Console kennt keine
Messwerte, die Datenseiten kennen keine Registrierung. Deshalb steht die
Tabelle hier und nicht dort.

Sortiert wird **Ärger zuerst** — verwaist, dann stumm, dann nach Aktivität. Die
Zeilen, wegen derer man die Seite öffnet, stehen oben.

Die 24 Stunden sind eine Konstante (`ACTIVE_WINDOW_MS`), keine Einstellung:
Klassenraumsensoren melden sich alle paar Minuten, was seit gestern schweigt ist
einen Blick wert, und alles Kürzere würde bei einem einzigen ausgefallenen
Uplink Alarm schlagen.

### 2. Anlegen (Vorgabe 2)

Das Formular nimmt die Zahlen entgegen, die auf dem LA66-Modul stehen: Name,
DevEUI, AppEUI/JoinEUI, AppKey, Geräte-ID, Grund. **Nichts wird gewürfelt** —
die Module bringen ihre Kenncodes mit.

Alle Hexfelder akzeptieren die Schreibweise der TTN-Console *mitsamt den
Leerzeichen* (`A8 40 41 D6 C1 84 DB 82`). Diese Werte werden eingefügt, nicht
getippt; eine Eingabe wegen ihrer Formatierung abzulehnen kauft nur ein
Abtippen, und ein abgetippter 32-stelliger Schlüssel ist genau die Fehlerquelle,
die man vermeiden will.

Die Geräte-ID steht beim Öffnen schon da: `device-` und eins mehr als die
höchste Nummer, die in TTN bereits vergeben ist — bei `device-1` bis `device-3`
also `device-4`. So heissen die von Hand angelegten Geräte, und ein Vorschlag,
der nicht zum Bestand passt, ist keiner.

Gezählt wird, nicht aufgefüllt: sind `device-1` und `device-3` da, lautet die
Antwort `device-4` und nicht `device-2`. Eine Lücke bedeutet meist ein
entferntes Gerät, und dessen Nummer an andere Hardware zu vergeben liesse zwei
Dinge in den Aufzeichnungen und in der Messwerthistorie denselben Namen tragen.
Ids ausserhalb des Schemas zählen nicht mit; das Feld bleibt editierbar, denn
`klasse-8b-fenster` sagt beim Hinsehen mehr.

Die Nummer wird bei jedem Öffnen des Formulars bei TTN erfragt — dort allein ist
bekannt, was vergeben ist, denn diese Anwendung führt keine Gerätetabelle. Lässt
sich die Liste nicht abrufen, bleibt das Feld leer: ein aus einer unvollständigen
Liste gezählter Vorschlag wäre schlimmer als keiner, weil er einen bereits
benutzten Namen nennen könnte.

Frequenzplan, LoRaWAN- und Regional-Parameters-Version stehen als Text da, nicht
als Feld: sie sind Eigenschaften des Standorts, für alle Geräte gleich, und ein
Auswahlfeld wären vier weitere Arten, ein Gerät anzulegen, das nie joint.

**Die Ergebnisseite ist der Kern dieser Vorgabe.** Anlegen sind vier Aufrufe an
vier Server und keine Transaktion:

```
✓  Gerät angelegt (Identity Server)
✓  Schlüssel hinterlegt (Join Server)
✕  Funkeinstellungen gesetzt (Network Server)
      400: error:pkg/networkserver: invalid frequency plan
–  Anwendungsseite eingerichtet (Application Server)
```

Schlägt ein Schritt fehl, wird rückwärts aufgeräumt: was schon eingetragen war,
wird wieder entfernt. Das ist naturgemäß ein Versuch — wer gerade eine Anfrage
abgelehnt hat, lehnt das DELETE womöglich aus demselben Grund ab. Was übrig
bleibt, steht namentlich auf der Seite:

> **Es ist etwas in TTN zurückgeblieben.** Ein Schritt schlug fehl, und das
> Aufräumen danach ebenfalls. Das Gerät `device-1` ist deshalb halb registriert.

Ohne diesen Satz stünde jemand mit einem halben Gerät da, von dem er nichts
weiß — und der zweite Versuch mit derselben Geräte-ID scheitert dann an einem
Konflikt, den niemand erklären kann.

### 3. Das einzelne Gerät (Vorgabe 3)

Aufgebaut wie die Detailansicht der TTN-Console, in denselben Blöcken
(*Allgemein*, *Aktivierung*), damit wer beides offen hat zweimal dasselbe sieht
und nicht zweierlei. Dazu ein Block *Messwerte* mit Verweis auf die vorhandene
gefilterte Ansicht `/management/data/measurements?device_eui=…`, und darunter das
Umbenennen-Formular.

Der **AppKey** ist verdeckt:

- `management` sieht einen Satz, dass das Administratoren vorbehalten ist —
  keinen ausgegrauten Knopf. Ein deaktivierter Knopf lädt zum Klicken ein und
  erklärt dann nichts.
- `admin` sieht einen Knopf „AppKey anzeigen". Er löst ein **POST** aus, kein
  GET: sonst stünde der Schlüssel im Browserverlauf und in jedem Proxy-Log, das
  URLs mitschreibt, und einem Link folgt man versehentlich.
- Die Antwort ist ein frischer Aufbau derselben Seite mit dem Schlüssel darin.
  Gespeichert wird nichts; ein Neuladen verdeckt ihn wieder.

Der Schlüssel wird eigens vom Join Server geholt und reist nie mit der Liste
oder der Detailseite mit — er kann also nicht in einer Antwort landen, die für
jemand anderen gerendert wurde.

**Umbenennen** ist ein einziger Aufruf an den Identity Server und kann deshalb
nicht halb geschehen. Grund ist trotzdem Pflicht, und protokolliert wird in
beiden Fällen. Was TTN zu einem Fehlschlag gesagt hat, steht im Protokoll und
nicht auf der Seite: die Seite zeigt feste Sätze, das Protokoll den Wortlaut.

Ein Gerät, das der Network Server nicht kennt, bekommt oben einen Hinweis — das
ist genau der halb registrierte Zustand von oben, es wird nie joinen, und nichts
anderes auf der Seite würde sagen warum.

### 4. Das Geräteprotokoll (Vorgabe 4)

Zeitpunkt, Benutzer, Aktion, Gerät, Grund, Ergebnis. Drei Ergebnisse:
**erledigt**, **fehlgeschlagen** (nichts zurückgeblieben) und **halb** (in TTN
liegt etwas). Kein Zurücknehmen-Knopf, und ein Satz oben, der sagt warum:

> Zurücknehmen lässt sich hier nichts: das Änderungsprotokoll kann das, weil es
> Datenbankzeilen führt und eine Zeile zurückschreiben kann — ein Gerät in TTN
> ist keine.

---

## Durchgehende Bedienregeln

- **Ohne Grund kein Vorgang.** Wie bei den Datenseiten, und aus demselben Grund:
  der Grund ist das Einzige, was den Eintrag später erklärt.
- **Ohne Protokoll kein Vorgang.** Fehlt `DATABASE_URL_MANAGE`, öffnet die Seite
  lesend und sagt es. Ein Eingriff in ein fremdes System, der hier keine Spur
  hinterlässt, ist schlimmer als einer, der unterbleibt.
- **Kein Zwischenspeichern.** Die Geräteliste wird bei jedem Aufruf geholt. Bei
  zweistelliger Gerätezahl ist das eine Anfrage, und ein Cache wäre eine zweite
  Wahrheit, die in dem Moment falsch wird, in dem jemand die Console benutzt —
  was er darf und fürs Löschen weiterhin muss.
- **Löschen gibt es hier nicht.** Vier DELETEs mit demselben Halb-Problem wie
  oben, und am seltensten gebraucht. Bleibt der Console vorbehalten und ist auf
  der Ankündigungsvariante der Seite als solches benannt.

---

## Der Name wird mitgeschrieben

Die Seiten, die Messwerte zeigen — Status, Plots, Export, Dashboard und die
Datenverwaltung — benennen ein Gerät mit seinem Namen und der DevEUI darunter.
Den Namen kennt aber nur TTN, und keine dieser Seiten kann dort nachfragen: sie
sind öffentlich, werden auf dem Server gerendert, und die Statusseite lädt sich
alle dreissig Sekunden selbst neu. Eine TTN-Anfrage pro Aufruf würde den
ruhigsten Pfad der Anwendung an ein fremdes System hängen.

Deshalb liegt eine Kopie in `device_names` (Migration 012) — der Name, und ein
Schalter `registered`, der sagt, ob TTN das Gerät beim letzten Abgleich noch
kannte. Der Schalter ist nötig, weil die Statusseite dieselben drei Zustände
zeigt wie diese Übersicht, und „verwaist" eine Frage nach Anwesenheit ist, nicht
nach Namen. Diese Seite ist einer der beiden Orte, an denen die Kopie entsteht:

- **Beim Start** holt der Server die Geräteliste einmal und schreibt die Namen
  mit — ohne darauf zu warten. Ist TTN nicht erreichbar, stehen weiterhin nur die
  EUIs da; das ist das Bild von vorher, kein Fehler.
- **Bei jedem Blick auf die Übersicht**, weil die die ganze TTN-Liste ohnehin in
  der Hand hat. Auch das nebenher: ein Name, der sich nicht speichern lässt, ist
  kein Grund, die Seite zurückzuhalten.
- **Beim Anlegen und beim Umbenennen** für das einzelne Gerät, damit der Name
  nicht erst beim nächsten Aufruf der Übersicht auf den öffentlichen Seiten
  ankommt.

Das widerspricht dem „Kein Zwischenspeichern" oben nicht, sondern zieht die
Grenze: **gelesen wird nie aus der Kopie, wenn es um ein Gerät geht.** Die
Übersicht, das einzelne Gerät und jeder Vorgang fragen TTN. Die Kopie trägt nur
das Etikett, und sie entscheidet nichts.

**Ein Gerät, das TTN nicht mehr kennt, behält seinen Namen** und verliert nur
den Schalter. Die Messwerte überleben die Registrierung — die Übersicht hat dafür
das Wort „verwaist" — und genau auf diesen Zeilen ist ein zuletzt bekannter Name
am meisten wert. Eine EUI gehört zur Hardware, ein erneutes Registrieren schaltet
sie also wieder ein. Eine Zeile wirklich loszuwerden bleibt der SQL-Konsole
vorbehalten.

Der Abgleich setzt dafür in **einer** Transaktion erst alle Schalter aus und
dann für jedes Gerät der Liste wieder ein. Dazwischen sähe jedes Gerät verwaist
aus, und diesen Zustand darf keine Seite lesen. Aus demselben Grund weigert sich
`listDevices()`, eine halbe Liste zurückzugeben: sie würde die andere Hälfte für
verwaist erklären.

**Diese Seite liest die Kopie nie.** Sie fragt TTN, und zwar bei jedem Aufruf —
die Seite, auf der jemand ein Gerät anfasst, ist immer aktuell. Die Kopie ist
für die Seiten da, die nur anzeigen; dort ist der Zustand so frisch wie der
letzte Abgleich, und ein in der TTN-Console gelöschtes Gerät gilt bis zum
nächsten Neustart oder dem nächsten Blick hierher als registriert.

---

## Routen und Dateien

```
/management/devices                   GET   Übersicht
/management/devices/new               GET   Formular
/management/devices/new               POST  Anlegen → Ergebnisseite
/management/devices/log               GET   Geräteprotokoll
/management/devices/:deviceId         GET   ein Gerät
/management/devices/:deviceId/rename  POST  Umbenennen
/management/devices/:deviceId/key     POST  AppKey aufdecken — nur admin
```

Die Reihenfolge der Registrierung ist bedeutsam: `/new` und `/log` stehen vor
`/:deviceId`, sonst schluckt der Parameter sie.

```
frontend/pages/management/
├─ devices-routes.tsx           die sieben Routen
├─ devices-page.tsx             Übersicht + DEVICE_MESSAGES (und der <Planned/>-Zustand)
├─ device-new-page.tsx          das Formular
├─ device-created-page.tsx      die vier Schritte, einzeln benannt
├─ device-page.tsx              ein Gerät
└─ device-log-page.tsx          das Protokoll

services/
├─ measurement.ts               deviceActivity: Anzahl und letzter Messwert je EUI
├─ log-entry.ts                 deviceActivity: dasselbe für die Logs
├─ device-names.ts              Name und registered, aus TTN nachgezogen
├─ ttn.ts                       der Client: listDevices, getDevice, appKeyOf,
│                               createDevice (mit Rückrollpfad), renameDevice
└─ device-log.ts                lesen auf der eigenen Verbindung, anhängen über
                                DATABASE_URL_MANAGE

lib/ttn-ids.ts                  normalisieren und prüfen — rein, ohne Netz
lib/device-state.ts             aktiv/stumm/verwaist — eine Regel für beide Seiten
components/DeviceStateBadge.tsx das Abzeichen samt Erklärung, hier und im Status
components/manage/Notice.tsx    der Meldungskasten, vorher viermal abgeschrieben
migrations/004-device-log.ts    die Tabelle
migrations/012-device-names.ts  die Kopie der Gerätenamen
```

---

## Festgelegt

- **Umfang**: Übersicht, Anlegen, Umbenennen. Löschen bleibt der TTN-Console.
- **Berechtigung**: `management` darf alles auf dieser Seite; einzig das
  Aufdecken des AppKey verlangt `admin`. Das Rollenkonzept wird später
  überarbeitet — bis dahin ist das die einfachste Regel, die den Schlüssel
  schützt.
- **Aktivierung**: OTAA, `EU_863_870_TTN`, `MAC_V1_0_3`, `PHY_V1_0_3_REV_A` —
  konfigurierbar, aber nicht pro Gerät.
- **Nachvollziehbarkeit**: `device_log`, Migration `004`. Eigene Tabelle, weil
  jeder Eintrag in `audit_log` eine zurückschreibbare Datenbankzeile bezeichnet
  und ein TTN-Gerät keine ist — die ausführliche Begründung steht in der
  Migration selbst.
- **Protokoll unveränderlich** in der Anwendung: `loramint_manage` hat auf
  `device_log` nur `SELECT` und `INSERT`, genau wie auf `audit_log`.

## Wie die offenen Punkte gelöst wurden

- **Die vier Server.** `POST /api/v3/applications/{app}/devices` am Identity
  Server, danach je ein `PUT` auf `js/`, `ns/`, `as/`. Jeder Aufruf trägt einen
  `field_mask.paths`-Block, der genau die gesetzten Felder nennt; ein Lesen ohne
  `field_mask` liefert kaum mehr als die IDs zurück.
- **Zwei Schlüssel, die sich zum Verwechseln ähnlich sehen.** `TTN_APP_KEY` ist
  das Wort, das der Webhook mitschickt; `TTN_API_KEY` darf Geräte anlegen und
  Root-Keys lesen. Werden sie gleichgesetzt, darf jeder, der die
  Webhook-Konfiguration in TTN lesen kann, die Application verwalten — `config.ts`
  bricht deshalb den Start ab, im selben Stil wie die bestehenden Wächter gegen
  `DATABASE_URL_ADMIN == DATABASE_URL`.
- **Zusammenführen über die DevEUI**, case-insensitiv: TTN schreibt sie groß, die
  Spalte `measurements.device_eui` hält, was der Webhook geschickt bekam. Ohne
  `upper()` erschiene ein Gerät zweimal. Die Aggregation liegt in
  `measurements.deviceActivity()`, und Übersicht wie Detailseite zählen dadurch
  gleich.
- **CSRF.** Dieselbe `sameOrigin`-Middleware wie bei den Datenseiten, vor jeder
  schreibenden Route.
- **Testbarkeit.** `lib/ttn-ids.ts` ist rein und ohne Konfiguration, deshalb
  direkt testbar. `services/ttn.test.ts` stubbt `fetch` und prüft vor allem den
  Rückrollpfad — dass nach einem Fehlschlag am Network Server rückwärts
  aufgeräumt wird und `leftovers` benennt, was das nicht überstanden hat.
