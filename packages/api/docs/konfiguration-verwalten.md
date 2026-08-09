# Konfiguration verwalten — Konzept der Oberfläche

| | |
|---|---|
| **Status** | Alle drei Stufen umgesetzt |
| **Stand** | 2026-08-08 |
| **Meilenstein** | offen (`version_meilstones.md`) |
| **Geltung** | `/management/config` und die Konfiguration insgesamt |

Dieses Dokument beschreibt, **wie sich die Konfiguration bedienen lassen soll** —
nicht, wie sie gebaut ist. Es ist die Vorgabe, gegen die die Umsetzung geprüft
wird; weicht die Implementierung ab, ist entweder das Dokument oder der Code zu
korrigieren, nicht beides stillschweigend auseinanderzulassen.

Schwesterdokumente: `daten-verwalten.md` (1.5), `geraete-verwalten.md` (1.6),
`zeitzonen.md` (geplant).

---

## Ausgangslage

`config.ts` liest **40 Umgebungsvariablen**. Was davon gesetzt ist, was nur die
eingebaute Vorgabe benutzt und was schlicht fehlt, liess sich nirgends ablesen —
man las die compose-Datei, die env-Datei und `.env.example` nebeneinander und
hoffte, nichts übersehen zu haben.

Der Auslöser ist konkret. Beim produktiven Deployment von 1.6.1 blieb die
Geräteseite eine Ankündigung. Die Ursache war, dass die Portainer-Stack-Definition
noch die compose-Datei von 1.5.0 enthielt und die drei `TTN_*`-Zeilen fehlten:
die Variablen waren gesetzt, kamen aber nie im Container an. Vom Bildschirm aus
war das nicht zu erkennen; es brauchte einen `docker inspect`-Dump, der nebenbei
sämtliche Produktionsgeheimnisse offenlegte.

Eine Seite, die den **tatsächlich wirksamen** Zustand zeigt, beantwortet das in
Sekunden — und das ganz ohne Bearbeiten.

## Der Weg in drei Stufen

| Stufe | Inhalt | Status |
|---|---|---|
| 1 | Lesende Übersicht unter `/management/config` | **umgesetzt** |
| 2 | Einrichtungskonto: lokaler Admin neben LDAP | **umgesetzt** |
| 3 | Tabelle `settings`, Werte in der Oberfläche änderbar | **umgesetzt** |

Die Reihenfolge ist zwingend: Stufe 3 verlagert Einstellungen in die Datenbank,
und dann braucht es einen Weg hinein, der nicht selbst von einer verstellten
Einstellung abhängt.

---

## Stufe 1: die Übersicht

`/management/config`, im Menü unter **Verwaltung → Konfiguration**, Rolle
`admin` — nicht `management`. Die Seite zeigt Verzeichnis-Bindekonten,
Datenbankrollen und die Gestalt jedes Geheimnisses; das ist Deployment-Wissen,
eine Sprosse über dem Bereich, in dem sie hängt.

### Oben: die Funktionen

```
Anmeldung (LDAP)     an    LDAP_URL gesetzt
Daten ändern         an    DATABASE_URL_MANAGE gesetzt
SQL-Seite            an    DATABASE_URL_READONLY und _ADMIN gesetzt
Geräteverwaltung     aus   TTN_API_KEY und TTN_APPLICATION_ID fehlt –
                           die Seite bleibt eine Ankündigung
Rechtsseiten         an    Impressum und Datenschutz gesetzt
```

Jede optionale Funktion mit ihrem Zustand **und der Variable, die ihn
verursacht**. Die zweite Hälfte ist der Punkt: „aus" allein schickt jemanden
durch drei Dateien, „aus — TTN_API_KEY fehlt" beendet die Suche.

### Darunter: die Einstellungen nach Gruppen

Kern, Anmeldung, Datenverwaltung, SQL-Seite, Geräteverwaltung, Rechtsseiten.
Je Zeile der Name mit einem erklärenden Satz, der wirksame Wert und die
**Herkunft**:

| Herkunft | Bedeutung |
|---|---|
| **Datenbank** | hier eingestellt, in `settings` gespeichert (seit Stufe 3) |
| **Umgebung** | von aussen gesetzt |
| **Vorgabe** | nicht gesetzt; die Anwendung benutzt ihren eingebauten Wert |
| **nicht gesetzt** | weder das eine noch das andere |

Diese Spalte trägt den eigentlichen Erkenntnisgewinn. Sie unterscheidet „steht
auf 1, weil jemand 1 gesetzt hat" von „steht auf 1, weil das die Vorgabe ist" —
zwei Zustände, die überall sonst gleich aussehen und sich erst unterscheiden,
wenn jemand die Vorgabe ändert.

Gelesen wird dafür `Bun.env` und nicht das `config`-Modul: beide kennen denselben
Wert, aber nur die rohe Umgebung weiss noch, woher er kam. `config.ts` hat
„gesetzt auf 8090" und „auf 8090 zurückgefallen" längst zu einer Zahl
zusammengezogen, bevor jemand nachsehen kann.

Leer zählt dabei wie nicht gesetzt — dieselbe Regel wie in `config.ts`, weil
Compose eine unaufgelöste Variable als leeren String durchreicht.

### Geheimnisse

Nie im Klartext gerendert, sondern beschrieben: `gesetzt (98 Zeichen, beginnt mit
NNSXS.…)`. Verbindungszeichenfolgen werden mit maskiertem Passwort gezeigt
(`postgres://loramint_manage:***@db:5432/loramint_db`).

Für `admin` gibt es daneben **anzeigen**, das den Wert per POST nachlädt — kein
Link, denn einem Link folgt man versehentlich, und der Wert stünde dann im
Browserverlauf und in jedem Proxy-Log, das Adressen mitschreibt. Der aufgedeckte
Wert steht in genau dieser einen Antwort und wird nirgends gespeichert.

Der eingereichte Name wird über den Katalog aufgelöst, nicht direkt aus der
Umgebung gelesen: so kann er nur eine Einstellung benennen, die diese Anwendung
kennt, und nicht irgendeine Variable, die der Prozess zufällig trägt.

### Plausibilitätsprüfungen

Was die Seite selbst erkennen kann, sagt sie als Warnzeile bei der betroffenen
Einstellung:

- `TTN_URL` enthält `/console/` — die Adresse der Weboberfläche statt des
  Cluster-Ursprungs. **Dieser Fehler ist im Projekt zweimal passiert.**
- `LDAP_TLS_REJECT_UNAUTHORIZED=false`
- `TRUSTED_PROXIES=0` hinter einem Proxy
- `DATABASE_URL_MANAGE` fehlt
- `SESSION_TTL_HOURS` über einem Monat
- `TTN_APPLICATION_ID`, das wie ein Pfad aussieht

Nur Dinge, die falsch oder fast immer falsch sind. Eine Seite, die vor allem
warnt, ist eine, die niemand liest.

---

## Die Trennlinie (gilt ab Stufe 3)

Disjunkte Mengen, kein Vorrangproblem: jede Einstellung gehört genau einem Ort.
**In der Umgebung bleibt nur, was gebraucht wird, bevor die Anwendung an ihre
eigene Konfiguration kommt** — und was, über die Oberfläche änderbar, das
Sicherheitsmodell aushebeln würde:

| bleibt Umgebung | Grund |
|---|---|
| `DATABASE_URL` | ohne sie kein Zugriff auf den Ort, wo die Konfiguration liegt — und die übrigen Rollen werden aus ihr abgeleitet |
| `SESSION_SECRET` | wird gebraucht, bevor eine Sitzung existiert |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH` / `ADMIN_PW` | das Einrichtungskonto selbst |
| `PORT`, `NODE_ENV`, `TRUSTED_PROXIES` | Prozess- und Proxy-Ebene |

Das sind fünf bis sechs; die übrigen rund 30 ziehen in die Datenbank —
**einschliesslich der 17 LDAP-Variablen**, und das ist der eigentliche Gewinn.

Ursprünglich sollte LDAP in der Umgebung bleiben, weil ein Vertipper im
Suchfilter oder in einer Gruppenkennung dauerhaft aussperrt. Dieses Argument
fällt mit dem Einrichtungskonto weg: wer sich vertippt, meldet sich lokal an und
korrigiert es. Erst dadurch wird „möglichst wenig in Umgebungsvariablen"
tatsächlich erreichbar — von 40 auf unter zehn.

Im Katalog trägt jede Einstellung diese Zuordnung bereits als `tier`.

`TTN_APP_KEY` ist ein Grenzfall: er wird pro Webhook-Anfrage geprüft, aber
`config.ts` bildet seinen Hash beim Import. Er kann mitziehen, sobald dieser
Vergleich den Wert bei Bedarf liest statt einmal beim Start.

---

## Stufe 2: das Einrichtungskonto

`ADMIN_USERNAME` plus `ADMIN_PASSWORD_HASH` (bevorzugt, Argon2 über
`Bun.password`) **oder** `ADMIN_PW` im Klartext — beides zugelassen, bei Klartext
eine Warnung im Log beim Start. Dazu `scripts/hash-password.ts`, das nach dem
Passwort fragt und den Hash ausgibt, ohne ihn in Shell-Historie oder Prozessliste
zu schreiben.

Geprüft **vor** LDAP. Stimmt der Benutzername mit `ADMIN_USERNAME` überein, wird
ausschliesslich lokal entschieden — ein falsches Passwort wird abgewiesen und
nicht ans Verzeichnis durchgereicht. So verrät kein Antwortzeitunterschied,
welcher Pfad griff, und der Name gehört eindeutig dem Konto.

Das Konto erhält die Rolle `admin` und macht die Anwendung ohne konfiguriertes
LDAP überhaupt erst bedienbar. Die vorhandene Anmeldesperre
(`lib/login-throttle.ts`) deckt es mit ab — sie greift vor jeder Prüfung, also
auch vor dieser.

Umgesetzt in `services/setup-account.ts`. Die Rolle kommt nicht aus einer
Gruppe, sondern aus einer Kennzeichnung `setup` im signierten Sitzungs-Cookie,
die `lib/roles.ts` liest: ein Gruppenname müsste zu `LDAP_ADMIN_GROUP` passen,
und die ist womöglich noch gar nicht konfiguriert — genau die Lage, für die es
das Konto gibt.

Drei Stellen hingen bisher an `auth.enabled` und mussten mitgenommen werden,
sonst wäre das Konto nutzlos gewesen: die Registrierung der Anmelderouten
(`frontend/pages/index.tsx`), der Anmeldeknopf im Layout und — am wenigsten
offensichtlich — das Auslesen des Sitzungs-Cookies in `index.ts`. Ohne die
letzte meldete sich das Konto erfolgreich an und war bei der nächsten Anfrage
wieder unbekannt.

**Es ersetzt LDAP nicht.** Es ist für *eine* Person gedacht, die den Server in
Betrieb nimmt und dabei die Verzeichnisanbindung einrichtet; danach melden sich
alle wie bisher über LDAP an und bekommen ihre Rollen aus den Gruppen. Die
Protokolle verlieren dadurch nichts: sie tragen weiterhin die Namen echter
Personen.

## Stufe 3: das Bearbeiten

Umgesetzt in `migrations/005-settings.ts`, `lib/settings-store.ts` und
`services/settings.ts`.

**Kein automatisches Übernehmen.** Die Tabelle startet leer, und die Umgebung
wird für verschiebbare Einstellungen nicht mehr gelesen — ein hochgezogener
Server kommt also ohne LDAP-Anbindung hoch. Das ist der Preis der disjunkten
Trennung und im CHANGELOG als Bruch ausgewiesen; der Weg hindurch führt über das
Einrichtungskonto aus Stufe 2, weshalb es zuerst kam.

**Wie die Werte zur Laufzeit ankommen.** `lib/settings-store.ts` ist eine Map und
importiert nichts — sie muss von `config.ts` gelesen werden, und `config.ts` wird
von allem importiert. `services/settings.ts` füllt sie beim Start. In `config.ts`
sind die betroffenen Werte **Getter**: das Modul wird beim Prozessstart
ausgewertet, die Tabelle erst danach gelesen, und ein Getter ist zugleich das,
was eine Änderung ohne Neustart wirksam macht.

Drei Stellen mussten dafür mitziehen — `index.ts` lädt die Einstellungen und ruft
`validateConfig()`, bevor es das Seitenmodul *dynamisch* importiert, denn
`auth.enabled` entscheidet beim Laden dieses Moduls, welche Routen es überhaupt
gibt. Ausnahme sind `QUERY_MAX_ROWS` und `QUERY_TIMEOUT_MS`: `services/query.ts`
friert sie beim Import ein, was nach der neuen Reihenfolge zwar den geladenen
Wert trifft, eine spätere Änderung aber erst nach einem Neustart. Die Seite sagt
das an der Zeile.



Tabelle `settings`, geschrieben über `DATABASE_URL_MANAGE`. Änderungen wirken
sofort — die Werte werden bei Gebrauch gelesen, nicht beim Start eingefroren.

**Notizen statt Protokoll.** Jede Einstellung trägt ein Notizfeld: wozu sie so
steht. Ein Grund, den man beim Speichern eintippt, ist eine Woche später in einer
Liste vergraben; eine Notiz steht neben dem Wert, den sie erklärt, und lässt sich
korrigieren, wenn die Überlegung sich ändert. `updated_by` und `updated_at` auf
der Zeile beantworten den Rest — wer zuletzt und wann.

Konfigurationsänderungen landen ausdrücklich **nicht** im Änderungsprotokoll.
Dieses handelt von den Daten der Anwendung; jeder Eintrag nennt Tabelle und
Zeile und lässt sich zurückschreiben. Eine Zeitgrenze ist nichts davon, und
Einträge über Einstellungen würden die Frage begraben, für die das Protokoll
gebaut wurde: wer hat diesen Messwert korrigiert, und warum.

Die Notiz eines Geheimnisses lässt sich ändern, ohne den Wert erneut einzugeben —
ein leeres Wertfeld heisst „unverändert lassen".

**Warum die Verwaltungsrolle und nicht die Admin-Rolle**, obwohl die Seite
`admin` verlangt: `loramint_admin_sql` ist die Verbindung der SQL-Konsole und
hält `UPDATE` und `DELETE` auf alle Tabellen, `audit_log` eingeschlossen. Durch
sie zu schreiben hiesse, dass derselbe Codepfad, der eine Einstellung ändert, den
Protokolleintrag darüber anschliessend entfernen könnte — womit das Protokoll als
Nachweis wertlos wäre.

Rolle in der Anwendung und Rolle in der Datenbank sind zwei Achsen: *wer darf
klicken* entscheidet `requireAdmin` in der Route, *was die Verbindung darf* bleibt
so klein wie möglich. Die Rücknahme im Änderungsprotokoll macht es bereits genau
so — `requireAdmin`, aber geschrieben über die Verwaltungsverbindung.

`settings` bekommt einen ausdrücklichen Grant
(`SELECT, INSERT, UPDATE, DELETE`), denn Einstellungen sind im Gegensatz zu den
Protokollen änderbar. Dass er von Hand nachzutragen ist, ist Absicht: die
Verwaltungsrolle hat bewusst keine `ALTER DEFAULT PRIVILEGES`, damit eine später
hinzugefügte Tabelle ihr nichts schenkt.

---

## Dateien

```
lib/config-catalog.ts       der Katalog als Daten: Schlüssel, Gruppe, Bedeutung,
                            Art, Stufe – dazu originOf, displayValue, maskDsn,
                            warningsFor, featureStates. Rein, ohne Netz.
lib/config-catalog.test.ts  siehe unten
frontend/pages/management/
├─ config-page.tsx          Funktionsblock, Gruppen, Warnzeilen
└─ config-routes.tsx        GET /management/config, POST …/reveal
```

## Prüfen

1. `bunx tsc --noEmit` und `bun test`.
2. **Der Vollständigkeitstest** ist der eigentliche Gewinn für die Zukunft:
   `config-catalog.test.ts` liest `config.ts`, sammelt jeden Schlüssel aus
   `requireEnv(…)`, `optional(…)`, `optionalInt(…)` und `Bun.env.X` und behauptet,
   dass jeder davon im Katalog steht. Ein Gegentest hält den Katalog frei von
   Einträgen, die es in `config.ts` nicht mehr gibt. Damit kann niemand mehr eine
   Variable hinzufügen, ohne dass sie auf der Seite erscheint und einen Satz zu
   ihrer Bedeutung trägt — genau die Nachlässigkeit, die zum Fehler beim
   1.6.1-Deployment geführt hat.
3. Redaktionstests: für jede Einstellung der Art „Geheimnis" oder „DSN" darf der
   dargestellte Wert das Geheimnis nicht enthalten, auch bei einer DSN, die sich
   nicht parsen lässt.
4. Am laufenden Server: als `management` ist die Seite ein 404, ein direkter POST
   auf `…/reveal` ebenfalls.
5. **Den Fehler nachstellen**: mit `TTN_API_KEY=""` und `TTN_APPLICATION_ID=""`
   starten. Der Funktionsblock muss „Geräteverwaltung aus — … fehlt" zeigen,
   während die Geräteseite „In Planung" anzeigt.
6. `TTN_URL` auf die Console-Adresse setzen: die Warnzeile muss erscheinen.
