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
