# Build-Stage
FROM python:3.11-slim AS builder



# Set labels
LABEL maintainer="Matthias Ruf <matthias.ruf@uni-ulm.de>"
LABEL version="1.0.0"
LABEL description="This is the official Docker image for the LoRaMINT WebhookListener."

RUN echo "Container is being built"

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Runner-Stage
FROM python:3.11-slim AS runner

WORKDIR /app

COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY . .

ENTRYPOINT ["python"]
CMD ["Webhook.py"]
