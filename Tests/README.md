# Test-Webseite mit Docker und Traefik

Eine einfache Python-Webseite zum Testen der Docker- und Traefik-Konfiguration.

## Ziel

Bereitstellung einer minimalen Python-Webapplikation, die:
- In einem Docker-Container läuft
- Über Traefik als Reverse-Proxy erreichbar ist
- Als Testumgebung für die LoRaMINT-Infrastruktur dient

## Komponenten

- **Flask-App**: Einfache Python-Webseite
- **Dockerfile**: Container-Definition
- **docker-compose.yml**: Orchestrierung mit Traefik-Labels
- **Traefik**: Reverse-Proxy mit automatischem Routing

## Geplante Struktur

```
Tests/
├── README.md
├── app/
│   ├── main.py
│   └── requirements.txt
├── Dockerfile
└── docker-compose.yml
```

## Traefik

Traefik ist der Reverse-Proxy für alle Services auf `*.sfz-ox.de`. Die Konfiguration erfolgt über Docker-Labels.

### Voraussetzungen

- Traefik läuft als externer Service
- Externes Docker-Netzwerk `traefik` existiert
- DNS-Eintrag für die Subdomain zeigt auf den Server

### Label-Konfiguration

| Label | Wert | Beschreibung |
|-------|------|--------------|
| `traefik.enable` | `true` | Aktiviert Traefik-Routing für den Container |
| `traefik.http.routers.<name>.rule` | `Host(\`subdomain.sfz-ox.de\`)` | Domain-Routing-Regel |
| `traefik.http.routers.<name>.entrypoints` | `websecure` | HTTPS-Entrypoint (Port 443) |
| `traefik.http.routers.<name>.tls` | `true` | TLS/SSL aktivieren |
| `traefik.http.routers.<name>.tls.certResolver` | `http_resolver` | Let's Encrypt Zertifikat via HTTP-Challenge |
| `traefik.http.services.<name>.loadbalancer.server.port` | `<port>` | Interner Container-Port |
| `traefik.docker.network` | `traefik` | Netzwerk für Traefik-Kommunikation |

### Beispiel docker-compose.yml

```yaml
services:
  app:
    build: .
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.myapp.rule=Host(`myapp.sfz-ox.de`)"
      - "traefik.http.routers.myapp.entrypoints=websecure"
      - "traefik.http.routers.myapp.tls=true"
      - "traefik.http.routers.myapp.tls.certResolver=http_resolver"
      - "traefik.http.services.myapp.loadbalancer.server.port=5000"
      - "traefik.docker.network=traefik"
    networks:
      - traefik

networks:
  traefik:
    external: true
```

### Hinweise

- `<name>` muss ein eindeutiger Identifier für den Router/Service sein
- Der interne Port muss mit dem exponierten Port der Applikation übereinstimmen
- Das Netzwerk `traefik` muss vor dem Start existieren (`docker network create traefik`)

### Traefik-Server Konfiguration (Referenz)

Falls Traefik selbst aufgesetzt werden muss, hier die Konfiguration aus der Referenz:

```yaml
services:
  traefik:
    image: traefik:latest
    ports:
      - "80:80"
      - "443:443"
    command:
      # Global
      - --global.checkNewVersion=true
      - --global.sendAnonymousUsage=true
      - --log.level=INFO
      - --api
      - --ping

      # HTTP Entrypoint (automatische Weiterleitung zu HTTPS)
      - --entryPoints.web.address=:80
      - --entrypoints.web.http.redirections.entrypoint.to=websecure
      - --entrypoints.web.http.redirections.entrypoint.scheme=https

      # HTTPS Entrypoint
      - --entryPoints.websecure.address=:443

      # Let's Encrypt mit HTTP-Challenge
      - --certificatesresolvers.http_resolver.acme.tlschallenge=true
      - --certificatesresolvers.http_resolver.acme.email=<EMAIL>
      - --certificatesresolvers.http_resolver.acme.storage=/http_resolver/acme.json

      # Docker Provider
      - --providers.docker.exposedByDefault=false
      - --providers.docker.watch=true
    volumes:
      - /etc/localtime:/etc/localtime:ro
      - /var/run/docker.sock:/var/run/docker.sock
      - ./traefik_data/http_resolver:/http_resolver
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.traefik_https.rule=Host(`traefik.example.de`)"
      - "traefik.http.routers.traefik_https.entrypoints=websecure"
      - "traefik.http.routers.traefik_https.tls=true"
      - "traefik.http.routers.traefik_https.tls.certResolver=http_resolver"
      - "traefik.http.routers.traefik_https.service=api@internal"
```

## Dockerfile

Multi-Stage Build für optimierte Container-Größe (Referenz aus docker-demo):

```dockerfile
# Build-Stage
FROM python:3.11-slim AS builder

WORKDIR /app
COPY ./app/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Runner-Stage
FROM python:3.11-slim AS runner

LABEL maintainer="LoRaMINT"
LABEL version="1.0.0"
LABEL description="LoRaMINT Test-Webseite"

WORKDIR /app

COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY ./app .

ENV FLASK_ENV=production

ENTRYPOINT ["python"]
CMD ["main.py"]
```

## Docker Compose

Build-Konfiguration mit Kontext und Dockerfile-Pfad:

```yaml
services:
  loramint-test:
    build:
      context: .
      dockerfile: Dockerfile
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.loramint-test.rule=Host(`test.sfz-ox.de`)"
      - "traefik.http.routers.loramint-test.entrypoints=websecure"
      - "traefik.http.routers.loramint-test.tls=true"
      - "traefik.http.routers.loramint-test.tls.certResolver=http_resolver"
      - "traefik.http.services.loramint-test.loadbalancer.server.port=5000"
      - "traefik.docker.network=traefik"
    networks:
      - traefik

networks:
  traefik:
    external: true
```

## Verwendung

```bash
# Netzwerk erstellen (falls nicht vorhanden)
docker network create traefik

# Container bauen und starten
docker compose up -d --build

# Logs anzeigen
docker compose logs -f

# Container stoppen
docker compose down
```
