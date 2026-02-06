# LoRaMINT Docker

Docker-Stack für das LoRaMINT-Projekt mit Traefik als Reverse-Proxy.

## Struktur

```
LoRaMINT_docker/
├── WebhookListener/     # TTN Webhook-Empfänger + MariaDB
└── Tests/               # Test-Webseite (Flask)
```

## WebhookListener

Empfängt Webhook-Nachrichten von The Things Network und speichert Messwerte in einer MariaDB-Datenbank.

- **URL:** `https://webhook.loramint.sfz-ox.de`
- **Datenbank:** `db.loramint.sfz-ox.de:3306`

Details siehe [WebhookListener/README.md](WebhookListener/README.md)

## Deployment

Alle Stacks werden über Portainer deployt und nutzen das externe `traefik`-Netzwerk.
