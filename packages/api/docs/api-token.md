# API-Token

| | |
|---|---|
| **Status** | Umgesetzt |
| **Stand** | 2026-08-25 |
| **Meilenstein** | 1.11 |
| **Geltung** | Programmatischer Lesezugriff auf `/api/v1`, Vergabe und Entzug von Rechten durch Datengruppen |

Dieses Dokument beschreibt, **wie ein Programm dauerhaft und widerrufbar auf die
API zugreifen kann**, ohne dass ein persönliches Passwort in einem Skript liegt.

Schwesterdokumente: `benutzereinstellungen.md` (Rollen und Datengruppen),
`daten-verwalten.md` (Zeilenrechte), `konfiguration-verwalten.md`.

---

## Ausgangslage

Die API kennt heute nur zwei Wege hinein: den TTN-Webhook mit seinem eigenen
Schlüssel — der einzige schreibende Endpunkt überhaupt — und das
Sitzungs-Cookie der WebUI, das auf allen acht lesenden Endpunkten gilt.

Das Cookie ist als Dauerlösung ungeeignet. Es läuft nach acht Stunden ab, lässt
sich nicht einzeln widerrufen (nur durch Wechsel von `SESSION_SECRET`, was alle
Angemeldeten hinauswirft), trägt die volle Identität samt Schreibrechten in der
WebUI, und es gibt keine Liste ausgegebener Werte. Ein nächtlicher Export müsste
heute das Passwort eines Menschen im Klartext vorhalten.

Gebraucht wird ein Nachweis, der einem **Programm** gehört statt einer Person,
und dessen Rechte sich ändern lassen, ohne ihn neu auszustellen.

## Der Kern: Nachweis und Berechtigung sind zwei Dinge

Ein Token ist eine **Kennung, sonst nichts**. Es trägt keine Rechte in sich.
Was es lesen darf, steht in einer getrennten Liste von Berechtigungen, die
Datengruppen ihm erteilen und wieder entziehen.

Daraus folgt die Eigenschaft, um die es geht: **wird eine Berechtigung entzogen,
ändert sich das Token nicht.** Kein neuer Wert, keine Änderung am Skript. Nur
die Liste wird kürzer.

## Es gehört einer Gruppe, nicht einem Menschen

Ein Token gehört immer genau einer **Datengruppe** — nie einer Rollengruppe.
`loramint-admin` ist ausdrücklich keine Datengruppe (siehe `isRoleGroup` in
`services/data-groups.ts`); die Trennung zwischen „was jemand darf" und „welche
Daten gemeint sind" bleibt auch hier bestehen.

Jedes Mitglied der besitzenden Gruppe darf anlegen, löschen, bekannt machen und
Rechte vergeben. Es gibt keine Rollen innerhalb einer Gruppe, und das ist eine
Entscheidung, keine Lücke: die Anwendung erfasst so wenig über Personen wie
möglich. Die Folge ist zu benennen — jedes Mitglied kann auch das Token
löschen, an dem der Export einer Kollegin hängt.

Ein Token überlebt den Weggang seines Erstellers, weil es der Gruppe gehört.
Genau dafür ist es da: damit kein persönliches Passwort im Skript steht.
`created_by` wird trotzdem festgehalten, wie bei `dashboard_entries` und
`settings` — sonst wäre bei einem Leck nicht einmal mehr feststellbar, aus
welcher Hand das Token stammt.

## Nur lesend

Ein Token gewährt ausschließlich Lesezugriff. Das ist keine Vorsicht, sondern
Bestandsaufnahme: unter `/api/v1` gibt es genau einen schreibenden Endpunkt,
den Webhook, und der hat seinen eigenen Schlüssel und eine Datenbankrolle, die
nur einfügen darf. Es gäbe nichts, worauf ein Schreibrecht wirken könnte.

Käme später ein schreibender Endpunkt dazu, bräuchte das Modell ein Flag je
Berechtigung. Bis dahin bleibt es weg.

## Ein Token erzeugt keine WebUI-Sitzung

**Die wichtigste Randbedingung.** Ein Token authentifiziert ausschließlich die
lesenden Endpunkte unter `/api/v1`. Es macht seinen Träger nicht zum
angemeldeten Benutzer und öffnet keine Seite — insbesondere nicht `/sql`.

Daran hängt der Abschnitt über Filter weiter unten: das Argument aus Migration
007, „kein Filter in Anwendungscode überlebt die SQL-Konsole", gilt für Token
gerade nicht, weil sie die Konsole nicht erreichen können.

Verschickt wird es als `Authorization: Bearer …`, nicht als Cookie. Ein Cookie
schickt der Browser bei jeder Anfrage automatisch mit; ein Token soll nur
wirken, wenn ein Programm es bewusst setzt. Sonst vermischt es sich mit
`loramint_session`, und die Unterscheidung zwischen „angemeldeter Mensch" und
„laufendes Skript" geht verloren — die für Protokollierung und Widerruf
gebraucht wird.

## Berechtigungen

Eine Datengruppe erteilt einem Token Zugriff auf **ihre eigenen** Daten. Sie
kann das jederzeit wieder entziehen, ohne jemanden zu fragen.

Jede Berechtigung trägt einen **Filter**, der weiter einengt als die Gruppe
selbst — etwa „nur Gerät `A840…DB77`" oder „nur Temperaturwerte".

Der Filter kennt dieselben Dimensionen, nach denen die API ohnehin filtert:
`device_eui`, `measurand`, `sensor`, `location`, `datatype`. Damit entsteht kein
neuer Begriff — es ist dieselbe Form wie `MeasurementFilter`, und `filterClause`
in `services/measurement.ts` wendet sie schon an.

Bewusst **nicht** dabei: `group_name` und `public_read` (das bestimmt die
Berechtigung selbst) sowie der Zeitraum `from`/`to`. Ein Zeitraum als *Recht*
(„nur Daten aus 2026") wäre denkbar, wäre aber leicht mit dem Zeitraum der
*Abfrage* zu verwechseln.

Der Filter liegt im Anwendungscode, nicht in den RLS-Policies. Die RLS gewährt
dem Token weiterhin die ganze Gruppe, der gespeicherte Filter engt darüber
hinaus ein — dasselbe Muster, nach dem die WebUI heute arbeitet: ein
Gruppenmitglied sieht per RLS seine ganze Gruppe, die Seiten schränken darauf
ein. Ein Token mit Filter ist damit nie schwächer abgesichert als ein Mitglied.

Ein frisch angelegtes Token ohne Berechtigung sieht genau so viel wie ein
anonymer Aufruf. Durch bloßes Anlegen entsteht nichts.

Ein Token sieht immer mindestens die öffentlich freigegebenen Zeilen,
zusätzlich zu dem, was ihm gewährt wurde.

## Bekannt machen

Der Anwendungsfall: ein Token soll Daten **mehrerer** Gruppen lesen.

Die besitzende Gruppe kann ihr Token bei einer anderen Gruppe **bekannt
machen**. Die sieht es daraufhin und kann ihm Rechte an ihren eigenen Daten
erteilen — annehmen muss sie nichts, sie entscheidet einfach, ob sie etwas
gewährt. Erteilte Rechte kann sie jederzeit einzeln wieder entziehen.

**Es ist ausdrücklich keine Leihe, und das Wort ist der Punkt.** Bei einer Leihe
bekäme die andere Gruppe etwas Benutzbares und die besitzende gäbe es solange
her. Hier ist beides nicht so: die andere Gruppe erhält nichts als das Wissen,
dass es das Token gibt, die besitzende gibt nichts ab — und was danach fließt,
fließt zum Programm der besitzenden Gruppe. Bekannt gemacht wird also das Recht,
**beizusteuern**, nie die Fähigkeit zu handeln.

Weitergeben lässt sich eine Bekanntmachung nicht. Nur die besitzende Gruppe
macht bekannt, sonst verliert sie den Überblick, wer Rechte vergeben darf.

Wird die Bekanntmachung zurückgezogen, **verfallen sofort alle Rechte, die durch
sie entstanden sind.**

### Der Wert bleibt beim Besitzer

Der geheime Wert wird dabei **nicht** mitgegeben — und könnte es auch gar nicht:
gespeichert ist nur sein Hash. Das ist die richtige Wirkung und kein Mangel.
Hätte die andere Gruppe den Wert, könnte sie das Token selbst benutzen, mit
*allen* seinen Rechten — also auch denen der besitzenden Gruppe und aller
anderen, die etwas beigesteuert haben.

Wer den Wert wirklich weitergeben will, tut das außerhalb der Anwendung und
weiß dann, was er tut.

## Sichtbarkeit

Zwei Stufen, von der besitzenden Gruppe gewählt:

- **nur die Gruppe** — außerhalb existiert es nicht sichtbar.
- **für alle Angemeldeten sichtbar** — jedes angemeldete Mitglied sieht, *dass*
  es das Token gibt, samt Name und besitzender Gruppe. Das ist der Weg, auf dem
  eine Gruppe ein Token überhaupt findet, um darum zu bitten, dass es ihr
  bekannt gemacht wird.

Sichtbar ist in beiden Fällen nie der geheime Wert. **Welche Gruppen dem Token
etwas gewährt haben**, sehen nur die jeweils gewährende Gruppe und
Administratoren — sonst verriete die Liste, wer wem seine Daten öffnet.

## Laufzeit

Beim Anlegen wird eine Laufzeit von höchstens **360 Tagen** festgelegt.
Verlängern ist möglich, aber immer nur auf höchstens 360 Tage ab dem Zeitpunkt
der Verlängerung — so bleibt die Obergrenze echt, ohne dass eine laufende
Anbindung nach einem Jahr stirbt.

Administratoren dürfen darüber hinausgehen und Rechte aller Gruppen vergeben.

## Löschen und Verfallen

- Die **besitzende Gruppe** kann ihr Token löschen. Damit ist ein geleaktes
  Token sofort tot, ohne dass jemand anderes gefragt werden muss.
- **Administratoren** können jedes Token löschen.
- Wird die **besitzende Gruppe** gelöscht, verschwindet das Token mit ihr.
  Praktisch selten: `ON DELETE RESTRICT` verhindert das Löschen einer Gruppe,
  der noch Messwerte zugeordnet sind.
- Wird eine **gewährende Gruppe** gelöscht, verfällt ihre Berechtigung; das
  Token bleibt.

## Was gespeichert wird

Nur der **Hash** des Wertes, nie der Klartext. Der wird genau einmal beim
Anlegen gezeigt — dasselbe Muster wie beim AppKey eines Geräts.

Dazu je Token: Name, besitzende Gruppe, Sichtbarkeit, Ablaufdatum,
`created_at`/`created_by` und **„zuletzt benutzt am"**. Letzteres ist das Feld,
an dem ein vergessenes Token auffällt, und es nennt keine Person.

## Historie

Jede Änderung an der Berechtigungsstruktur wird festgehalten — in einer eigenen
Tabelle nach dem Vorbild von `device_log`, nicht in `audit_log`.

Festgehalten wird: Anlegen und Löschen eines Tokens, Bekanntmachen und
Zurückziehen einer Bekanntmachung, Erteilen und Entziehen einer Berechtigung
samt ihrem Filter,
Verlängern der Laufzeit, Ändern der Sichtbarkeit — und **das Offenlegen des
geheimen Wertes**. Letzteres ist die folgenreichste Handlung überhaupt und
gehört deshalb ins Protokoll, auch wenn sie nichts an den Rechten ändert.

Der geheime Wert selbst steht nie darin.

### Rein lesend

Die Historie ist einsehbar und sonst nichts. Kein Zurücknehmen, anders als beim
`audit_log`, wo Administratoren eine Änderung rückgängig machen können — eine
entzogene Berechtigung wird nicht „zurückgenommen", sie wird neu erteilt, und
beides steht dann im Protokoll.

Durchgesetzt wird das nicht durch die Oberfläche, sondern durch die
Datenbankrolle: `loramint_manage` erhält auf diese Tabelle `SELECT, INSERT` und
nichts weiter, genau wie auf `audit_log` und `device_log`. Damit kann die Seite,
die das Protokoll schreibt, es nicht nachträglich verändern — das ist eine
Eigenschaft der Rolle, kein Versprechen des Codes.

### Sie überlebt das Token

Die Einträge hängen **nicht** per Fremdschlüssel am Token, sondern halten dessen
Kennung und Namen als eigene Werte fest. Sonst würde das Löschen eines Tokens
die Spuren seiner Vergabe mitlöschen — und da jedes Gruppenmitglied löschen darf,
wäre das Protokoll genau dann leer, wenn man es braucht.

### Mit Gruppenspalte, von Anfang an

Jeder Eintrag trägt die betroffene Gruppe. Das ist die bewusste Abweichung von
`audit_log`, dessen fehlende Gruppenspalte in `todo.md` als offener Punkt steht:
weil dort volle Zeileninhalte liegen und keine Gruppe vermerkt ist, muss die
Tabelle auf die Datenrolle beschränkt bleiben — Gruppenmitglieder sehen die
Historie ihrer *eigenen* Messwerte nicht.

Hier soll das von vornherein anders sein:

- Die **besitzende Gruppe** sieht die Historie ihrer Token vollständig.
- Eine **gewährende Gruppe** sieht die Einträge zu ihren eigenen Berechtigungen.
- **Administratoren** sehen alles.

## Was dieses Konzept nicht löst

**Drosselung.** Außerhalb des Logins gibt es heute keine, auch nicht für
anonyme Aufrufe. Ein Token macht Zugriffe zurechenbar und abschaltbar, aber es
begrenzt keine Mengen. Wer den Export alle zehn Minuten vollständig abholt,
fällt weiterhin nur über „zuletzt benutzt am" auf, und ein anonymer Abruf
derselben öffentlichen Daten gar nicht.

**Den Umfang des Öffentlichen.** Migration 007 hat allen Altbestand ohne Gruppe
auf `public_read = true` gesetzt, damit die öffentlichen Seiten beim Upgrade
nicht dunkel werden. Der heutige öffentliche Bestand ist damit gewachsen, nicht
kuratiert. Token ändern daran nichts.
