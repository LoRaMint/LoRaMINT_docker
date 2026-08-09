# Benutzereinstellungen und Datengruppen

| | |
|---|---|
| **Status** | Umgesetzt (Abschnitte 1–5); Abschnitt 6 offen |
| **Stand** | 2026-08-09 |
| **Meilenstein** | 1.7 |
| **Geltung** | Anmeldung, Profilseite, Darstellung von Zeit, Theme — und als Vorbereitung der Zuordnung von Messwerten zu Gruppen |

Dieses Dokument beschreibt, **was pro Benutzer gespeichert wird und warum genau
das** — und wie die Weichen jetzt gestellt werden müssen, damit der zweite
Schritt (Messwerte gehören einer Gruppe) später ohne Umbau möglich ist.

Schwesterdokumente: `zeitzonen.md` (wird durch Abschnitt 4 präzisiert),
`daten-verwalten.md` (1.5), `geraete-verwalten.md` (1.6),
`konfiguration-verwalten.md`.

---

## Ausgangslage

Es gibt **keinen Benutzerbegriff in der Datenbank**. Die Tabellen sind
`measurements`, `log_entries`, `audit_log`, `device_log`, `settings` — keine
davon kennt Personen. Identität ist heute allein der Anmeldename im signierten
Sitzungs-Cookie, und die Profilseite sagt das auch ausdrücklich: „kein Eintrag in
der Datenbank".

Für alles, was jemandem *gehört*, fehlt damit der Anker.

## Die drei Dinge sind nicht von derselben Art

Das ist die Festlegung, aus der der ganze Zuschnitt folgt:

| | Was es ist | Wer es setzt | Wann gebraucht |
|---|---|---|---|
| Zeitzone | Vorliebe | der Benutzer selbst | bei jeder Darstellung |
| Dark Mode | Vorliebe | der Benutzer selbst | **vor** dem ersten Rendern |
| Gruppen | **Berechtigung** | das Verzeichnis | bei jeder Datenabfrage |

Lägen alle drei in einem gemeinsamen „Benutzereinstellungen"-Topf, den die
Profilseite schreibt, könnte sich jemand selbst eine Gruppe erteilen. Die
Vorlieben gehören deshalb dem Benutzer, die Gruppenzugehörigkeit gehört dem
Verzeichnis, und die beiden Schreibwege dürfen sich nicht berühren.

---

## 1. `users` — der Anker

```
users   username      VARCHAR(100) PK   der Anmeldename, wie im Verzeichnis
        display_name  TEXT
        timezone      TEXT              IANA-Name, NULL = die des Browsers
        dark_mode     BOOLEAN           NULL = Vorgabe (hell)
        created_at    TIMESTAMPTZ
        last_seen_at  TIMESTAMPTZ
```

Die Zeile entsteht bei der ersten erfolgreichen Anmeldung und wird bei jeder
weiteren aufgefrischt (`INSERT … ON CONFLICT (username) DO UPDATE`) — auch für
das Einrichtungskonto, das damit ebenfalls eine Zeitzone haben kann.

**Mitgliedschaften stehen hier nicht.** Das ist Absicht und der Grund, weshalb
die Tabelle so klein bleibt.

`NULL` ist bei beiden Vorlieben bedeutungstragend und nicht dasselbe wie ein
Vorgabewert: „nie etwas eingestellt" heisst bei der Zeitzone „nimm die des
Browsers", und diese Unterscheidung geht verloren, sobald man beim Anlegen
`'Europe/Berlin'` hineinschreibt.

## 2. `data_groups` — eine erklärte Teilmenge

Die Datengruppen sind **LDAP-Gruppen**, aber nicht alle. Welche als Datengruppe
zählt, erklärt die Anwendung:

```
data_groups   name    VARCHAR(100) PK   exakt wie das Verzeichnis sie schreibt
              label   TEXT              "Klasse 8b" — was in der Oberfläche steht
              note    TEXT
              created_at
```

Diese Tabelle sagt nur, **welche** Gruppen zählen — nie, wer in ihnen ist. Die
Datengruppen einer Person sind schlicht

```
Sitzungsgruppen ∩ data_groups
```

Damit bleibt das Verzeichnis die einzige Quelle für Mitgliedschaften. Es gibt
keinen zweiten Pflegeort, keinen Abgleich, der auseinanderlaufen kann, und vor
allem keine Möglichkeit, sich in der Anwendung eine Gruppe zu verschaffen.

Die drei Rollengruppen (`LDAP_DATA_GROUP`, `LDAP_MANAGEMENT_GROUP`,
`LDAP_ADMIN_GROUP`) sind **keine** Datengruppen und dürfen es auch nicht werden —
sie beantworten die andere Frage. Beim Anlegen einer Datengruppe wird das
geprüft und abgelehnt.

### Zwei Achsen, die zusammen gelten müssen

| Achse | Frage | Quelle |
|---|---|---|
| Rolle (`data`/`management`/`admin`) | *Was* darf jemand tun? | die drei Rollengruppen |
| Datengruppe | *Welche* Daten betrifft es? | `data_groups ∩ Sitzungsgruppen` |

Ändern darf jemand einen Messwert später nur, wenn **beides** zutrifft: die
Rolle `management` *und* die Gruppe des Messwerts.

## 3. Wie die Vorlieben auf die Seite kommen

Beim Anmelden wandern Zeitzone und Dark Mode aus der `users`-Zeile in die
**signierte Sitzung**. Damit kostet keine Seite dafür eine Datenbankabfrage, und
der Server kennt sie schon beim Rendern.

Zusätzlich in ein **einfaches, ungezeichnetes Cookie** (`loramint_theme`). Das
ist bei Dark Mode nicht Bequemlichkeit: `data-theme` steht in
`config/ssr.ts:19` in der HTML-Hülle und muss richtig sein, *bevor* gezeichnet
wird — sonst blitzt bei jedem Seitenaufruf kurz die helle Seite auf. Nebenbei
wirkt das Cookie damit auch für nicht Angemeldete, und die meisten Seiten hier
sind öffentlich.

Dass dieses Cookie nicht signiert ist, ist unbedenklich: sein Inhalt entscheidet
über Farben, nicht über Zugriff. Die Zeitzone dagegen kommt für Angemeldete aus
der Sitzung, damit die Anzeige nicht von einem manipulierbaren Wert abhängt.

Geändert wird ausschliesslich auf `/profile`: Zeile schreiben, Sitzung und
Cookie neu ausstellen.

**Gruppen wandern weiterhin nur über die Sitzung** und werden nicht
zwischengespeichert. Eine Entziehung im Verzeichnis wirkt damit erst beim Ablauf
der Sitzung (Vorgabe 8 Stunden). Das ist bewusst hingenommen; wer sofort
aussperren muss, wechselt `SESSION_SECRET` und beendet damit alle Sitzungen auf
einmal. Der Hinweis gehört in `lib/session.ts`, wo die Abwägung schon steht.

## 4. Die Zeitzonen-Regel

> **Wirksame Zone** = die aus dem Profil, sonst die des Browsers, sonst UTC.
>
> **Jede angezeigte Zeit nennt ihre Zone — ausser sie steht in der wirksamen.**

Im Normalfall trägt damit keine einzige Zeitangabe einen Zusatz. Auffällig wird
genau das, was abweicht:

| Wo | Zone | Beschriftet? |
|---|---|---|
| Leseansichten (Status, Geräte, Protokoll, Profil) | wirksame Zone | nein |
| Plot-Achse, solange nicht umgeschaltet | wirksame Zone | Achsentitel trägt sie trotzdem, weil PNGs weitergegeben werden |
| Plot-Achse, umgeschaltet | die gewählte | **ja** |
| Verwaltungstabellen, Änderungsprotokoll, SQL-Konsole | UTC-ISO | **ja** |
| Ohne JavaScript | UTC | **ja** |
| CSV-Export | UTC | unverändert, keine Anzeige |

Das präzisiert `zeitzonen.md`, dessen Kernbefund unverändert gilt: die Plots
zeigen heute stillschweigend UTC, im Winter eine und im Sommer zwei Stunden
daneben. Neu ist allein, dass die Vorgabezone aus dem Profil kommen kann und
dass die Beschriftung nicht mehr pauschal, sondern **nur bei Abweichung**
erscheint.

Die Umsetzung folgt weiter `zeitzonen.md` Abschnitt „Umsetzung":
`lib/time-zone.ts`, `components/LocalTime.tsx`, das Skript im Layout. Ergänzend
bekommt das Skript die wirksame Zone aus einem Attribut am `<html>`-Element
mitgeteilt, damit es entscheiden kann, ob es das Kürzel entfernt oder stehen
lässt.

## 5. Dark Mode braucht zuerst ein Theme

`frontend/styles/global.css` definiert **genau ein** daisyUI-Theme
(`name: "loramint"; default: true; color-scheme: light`), und `config/ssr.ts`
schreibt es fest in die Hülle. Es gibt nichts, wohin ein Schalter umschalten
könnte.

Nötig ist deshalb zuerst ein zweites Theme `loramint-dark` mit
`color-scheme: dark` und abgestimmten Farben — das ist Gestaltungsarbeit, keine
Speicherarbeit. Speichern, Umschalten und das flackerfreie Ausliefern sind davon
unabhängig und werden zuerst gebaut; das Theme kann danach nachgezogen werden,
ohne dass sich am Mechanismus etwas ändert.

Zu beachten: Tailwind schreibt nur Klassen in die CSS-Datei, die es im Quelltext
findet. Nach jeder Theme-Ergänzung muss `bun run build` laufen, nicht nur
`build-islands` — `public/global.css` ist gitignoriert und wird im Image gebaut.

---

## 6. Der zweite Schritt (nur Kontext, nicht Teil dieser Umsetzung)

Messwerte werden **an Gruppen gebunden, nie an Personen**. Also:

```
measurements.group_name  VARCHAR(100) NULL  REFERENCES data_groups(name)
```

Zwei Fragen entscheiden dann über die Tragfähigkeit, und beide sind hier nur
festgehalten, nicht beantwortet:

**Wo der Filter sitzt.** Es gibt rund 16 Leseabfragen auf `measurements`; eine
vergessene genügt, damit fremde Daten sichtbar werden. Entweder zentral in
`filterClause`, sodass keine Abfrage ohne ihn gebaut werden kann — oder als **Row
Level Security** in Postgres, wo keine Abfrage sie umgehen *kann*. Letzteres
entspricht der Linie dieses Projekts: die Zusage wäre eine Eigenschaft der
Datenbank statt ein Versprechen des Codes. Der Preis ist `SET LOCAL` je
Transaktion, was mit den gepoolten Verbindungen aus `services/connections.ts`
sorgfältig gemacht werden muss.

**Was mit den vorhandenen Messwerten geschieht.** Alle bestehenden Zeilen haben
keine Gruppe. Sind sie für jeden mit Datenrolle sichtbar, oder für niemanden, bis
sie jemand zuordnet? Das ist die eigentliche Migrationsfrage, und sie will vor
dem Bauen entschieden sein.

---

## Dateien

**Neu**

- `packages/api/migrations/006-users.ts` — `users` und `data_groups`, additiv.
- `packages/api/services/users.ts` — `rememberSignIn`, `preferencesFor`,
  `savePreferences`. Lesen über `reading()`, Schreiben über `writing()`, nach
  der Regel aus `konfiguration-verwalten.md`.
- `packages/api/services/data-groups.ts` — die Teilmenge lesen und pflegen.
- `packages/api/lib/time-zone.ts` + Test — aus `zeitzonen.md`.
- `packages/api/frontend/components/LocalTime.tsx`.
- `packages/api/frontend/pages/profile/preferences-form.tsx` oder als Teil der
  Profilseite.

**Geändert**

- `packages/api/lib/session.ts` — `SessionUser` bekommt `timezone?: string` und
  `darkMode?: boolean`; beide durch `createSession`/`readSession` durchreichen,
  strikt gelesen wie `setup`.
- `packages/api/config/ssr.ts` — `data-theme` und die wirksame Zone aus der
  Anfrage statt fest.
- `packages/api/frontend/styles/global.css` — zweites Theme.
- `packages/api/frontend/pages/profile/page.tsx` — aus der Anzeigeseite wird
  eine mit zwei Feldern; der Absatz „kein Eintrag in der Datenbank" stimmt dann
  nicht mehr und muss ehrlich umgeschrieben werden.
- Die Anmeldung (`services/ldap.ts`-Aufrufer bzw. die Login-Route) — Zeile
  auffrischen, Vorlieben in die Sitzung legen.
- `packages/api/scripts/ensure-roles.ts` — Rechte auf die zwei neuen Tabellen:
  `readonly` liest beide, `manage` schreibt beide.
- `packages/api/docs/zeitzonen.md` — Verweis auf Abschnitt 4 dieses Dokuments.
- `CHANGELOG.md`, `version_meilstones.md`.

## Prüfen

1. `bunx tsc --noEmit` und `bun test`.
2. Anmelden, danach `SELECT * FROM users` — genau eine Zeile, mit Anzeigename.
   Nochmal anmelden: weiterhin eine Zeile, `last_seen_at` gewandert.
3. Auf `/profile` eine Zeitzone setzen. Statusseite und Geräteseiten wandern mit,
   **ohne** Kürzel. In den Entwicklerwerkzeugen die Browserzone auf etwas anderes
   stellen: die Anzeige bleibt bei der aus dem Profil.
4. Zeitzone im Profil wieder leeren: die Browserzone gilt, weiterhin ohne Kürzel.
5. Plot-Seite auf UTC umschalten: die Kurve verschiebt sich sichtbar, Achsentitel
   und Zeitangaben nennen die Zone.
6. JavaScript abschalten: überall UTC, überall beschriftet, nirgends eine Zeit
   ohne Kürzel.
7. Dark Mode einschalten, Seite neu laden: **kein Aufblitzen** der hellen
   Fassung. Danach abmelden — das Cookie hält, die Sitzung nicht.
8. Eine Datengruppe anlegen, die eine Rollengruppe ist: wird abgelehnt.
9. Eine Datengruppe anlegen, in der der angemeldete Benutzer laut Verzeichnis
   ist: sie erscheint auf `/profile` als Datengruppe; die übrigen
   Verzeichnisgruppen bleiben als solche stehen.
10. Ein Benutzer ohne jede Datengruppe kommt weiterhin überall hin, wo er heute
    hinkommt — dieser Schritt darf **nichts** einschränken.

## Offene Punkte

- **Umfang der Zonenliste** — umgesetzt ist eine kuratierte Auswahl
  (`COMMON_ZONES`). Ein gespeicherter Name ausserhalb der Liste bleibt gültig und
  erscheint im Feld; wer regelmässig andere Regionen vergleicht, bräuchte die
  vollständige Liste.
- **Wo Datengruppen gepflegt werden** — entschieden: eigene Seite unter
  Verwaltung → Datengruppen, nur für Administratoren. Sie wird zur
  Berechtigungssteuerung, sobald Messwerte eine Gruppe tragen, und sollte nicht
  erst dann weggeschlossen werden.
- **Dark-Mode-Farben** — ein erstes `loramint-dark` steht in `global.css`: das
  Petrol-Blau so weit aufgehellt, dass es als Primärfarbe taugt, und die
  Basistöne dorthin getönt statt neutral grau. Die Feinabstimmung ist eine
  Gestaltungsfrage und offen.
- **Ungeordnete Messwerte** — siehe Abschnitt 6, zu entscheiden vor Schritt zwei.

---

## Bausteine der Oberfläche

Vor einem Designdurchgang wurden die wiederholten Klassenketten zu Komponenten
zusammengezogen, damit eine Rückmeldung wie „Tabellen brauchen mehr Luft" eine
Fundstelle hat statt elf. Was jetzt in `frontend/components/` liegt:

| Komponente | Was sie ist |
| --- | --- |
| `PageHeading` | Seitentitel, Einleitung, Weg zurück |
| `SectionHeading` | Abschnitt innerhalb einer Seite |
| `Notice` | Meldung in drei Tönen |
| `Field` / `FieldGroup` | beschriftetes Feld, beschriftete Feldgruppe |
| `TableFrame` / `EmptyRow` | Tabellenkasten, Leerzeile darin |
| `Row` | Beschriftung links, Wert rechts |
| `Muted` | ein Wert, der nicht da ist |
| `LocalTime` | ein Zeitpunkt nach der Regel aus Abschnitt 4 |

**Die Ablageregel:** von einer Seite benutzt → lokal in dieser Datei; von zweien
→ nach `components/`. Genau daran war es vorher gescheitert — `PageHeading` und
`Notice` lagen unter `components/manage/`, und wer auf einer öffentlichen Seite
arbeitete, suchte dort nicht und baute sie nach.

**Was bewusst *keine* Komponente wurde:** ein gemeinsames `Card`. Die 34 Stellen
mit `rounded-box border border-base-300` sind sieben verschiedene Begriffe auf
vier verschiedenen HTML-Elementen (`div`, `li`, `details`, `form`). Eine
Komponente daraus hätte sie verschmolzen und danach sieben Schalter gebraucht,
um sie wieder auseinanderzunehmen.

---

## Vor dem Produktiveinsatz nachzuholen

**Impressum und Datenschutzerklärung sind noch nicht produktionstauglich.** In
der Konfiguration stehen Platzhalter beziehungsweise ein zu Testzwecken
eingetragener Text. Beides muss am Ende der Entwicklung inhaltlich neu verfasst
werden — und die Datenschutzerklärung ist dann gegen den *tatsächlichen* Stand zu
schreiben, der sich durch dieses Dokument ändert:

- Es werden erstmals **personenbezogene Daten in der Datenbank gespeichert**
  (`users`: Anmeldename, Anzeigename, Zeitpunkt der letzten Anmeldung). Bis
  hierher galt „kein Eintrag in der Datenbank", und genau das steht heute noch
  auf der Profilseite.
- Es kommt ein **weiteres Cookie** hinzu (`loramint_theme`), neben dem
  Sitzungs-Cookie.
- Messwerte werden künftig **Gruppen zugeordnet**, was eine Aussage über
  Zugriffsbeschränkung nötig macht.

Die Formulare für beide Seiten nehmen seit der Markdown-Umstellung
(`lib/markdown.ts`) formatierten Text entgegen — das Werkzeug steht also bereit,
nur der Inhalt fehlt. **Nicht vergessen: ohne belastbares Impressum und eine
zutreffende Datenschutzerklärung darf die Anwendung nicht öffentlich laufen.**
