# Die eingeschränkten Datenbankrollen

Hier standen einmal drei SQL-Skripte, die je eine Rolle mit einem selbst
gewählten Passwort anlegten. Sie sind entfernt, weil sie seit der Ableitung der
Rollen aus `DATABASE_URL` **in die Irre führen würden**: ein von Hand gesetztes
Passwort errät die Anwendung nicht, und die Installation könnte sich nicht
verbinden.

Stattdessen — und das ist der einzige Weg:

```bash
bun run ensure-roles          # lokal
                              # im Container läuft es beim Start von selbst
```

Das Skript legt die vier Rollen an, falls sie fehlen, und frischt bei jedem Lauf
Passwörter, Einstellungen und Rechte auf. Die Passwörter werden aus dem in
`DATABASE_URL` abgeleitet (siehe `lib/db-roles.ts`), sodass nichts konfiguriert,
weitergegeben oder gespeichert werden muss.

## Wer was darf, und warum

| Rolle | Rechte | Wofür |
|---|---|---|
| `loramint_readonly` | `SELECT` überall, `default_transaction_read_only` | jede Leseanfrage der Anwendung und die SQL-Seite unterhalb von `admin` |
| `loramint_ingest` | `INSERT` auf `measurements`, `log_entries` | der TTN-Webhook — bewusst **kein** `SELECT` |
| `loramint_manage` | Daten und `settings` voll; `audit_log`, `device_log` nur `SELECT, INSERT` | jede Änderung durch einen Menschen |
| `loramint_admin_sql` | alle Tabellen schreibend, kein `CREATE` | die SQL-Seite für Administratoren |

Die Verbindung folgt der **Absicht der Operation**, nicht dem Modul, in dem der
Code steht, und nicht der Rolle des Angemeldeten: wer als Administrator auf einer
Seite nur liest, liest über `loramint_readonly`.

Die Rolle aus `DATABASE_URL` besitzt das Schema und ist im Docker-Standardaufbau
Superuser. Sie wird **nur** für Migrationen und für diese Rollenanlage benutzt;
der laufende Betrieb kommt ohne sie aus.

## Was das Skript *nicht* tut

Es ist rein additiv: es legt an und erteilt, aber **es nimmt nichts weg**. Zwei
Folgen, die man kennen sollte:

- Eine Installation, die vor der Umstellung eigene Rollennamen benutzt hat,
  behält diese Rollen. Sie werden nicht mehr verwendet, existieren aber weiter
  samt ihrer Rechte und ihres alten Passworts. Solche Waisen gehören von Hand
  entfernt (`DROP ROLE …`, nachdem `REASSIGN OWNED`/`DROP OWNED` erledigt ist).
- Wird einer Rolle im Code ein Recht **entzogen**, erreicht das eine bestehende
  Datenbank nicht: dort bleibt das weitere Recht bestehen. Eine engere Zusage
  gilt dann für eine frische Installation, nicht für eine gewachsene. Wer eine
  Rolle enger fasst, muss das `REVOKE` selbst nachziehen.

Das ist Absicht — die Zusicherungen dieses Aufbaus beruhen darauf, dass Rechte
*nie erteilt wurden*, nicht darauf, dass ein Skript sie wieder einsammelt. Es
heisst aber auch, dass eine Verschärfung nicht von selbst ankommt.
