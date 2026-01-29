# WebhookListener

Der WebhookListener empfängt Webhook-Nachrichten von The Things Network (TTN) und speichert Messwerte sowie Log-Einträge in einer MariaDB-Datenbank.

## Architektur

Der Stack besteht aus zwei Services:

- **webhooklistener** - Python-Anwendung, die auf Port 8090 Webhook-Requests entgegennimmt
- **db** - MariaDB Datenbank

Traefik wird als Reverse-Proxy verwendet und leitet Anfragen von `webhook.loramint.sfz-ox.de` an den WebhookListener weiter.

## Umgebungsvariablen

| Variable | Beschreibung | Pflicht |
|---|---|---|
| `DB_PASSWORD` | Passwort für den Datenbankbenutzer | Ja |
| `DB_USERNAME` | Benutzername für die Datenbank | Ja |
| `DB_DATABASE` | Name der Datenbank | Ja |
| `APP_KEY` | API-Key zur Validierung eingehender Webhooks (TTN X-Downlink-Apikey) | Ja |
| `MARIADB_ROOT_PASSWORD` | Root-Passwort für MariaDB | Ja |

Die folgenden Variablen sind intern vorkonfiguriert und müssen normalerweise nicht angepasst werden:

| Variable | Beschreibung | Default |
|---|---|---|
| `DB_HOST` | Hostname der Datenbank | `db` (Service-Name) |
| `DB_PORT` | Port der Datenbank | `3306` |
| `WEBHOOK_HOST` | Bind-Adresse des Listeners | `0.0.0.0` |

## Deployment in Portainer

1. In Portainer einen neuen **Stack** erstellen
2. Die `docker-compose.yml` einfügen oder das Git-Repository verknüpfen
3. Die Umgebungsvariablen im Portainer-Stack konfigurieren:
   - `DB_PASSWORD`
   - `DB_USERNAME`
   - `DB_DATABASE`
   - `APP_KEY`
   - `MARIADB_ROOT_PASSWORD`
4. Stack deployen

Das externe Netzwerk `traefik` muss bereits existieren, bevor der Stack gestartet wird.

## Lokaler Test

```bash
# .env-Datei anlegen
cp .env.example .env
# Variablen in .env anpassen

# Stack starten
docker compose up -d
```
