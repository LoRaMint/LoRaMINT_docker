#!/bin/bash

# Test script for the LoRaMINT webhook API
# Usage: ./scripts/test-webhook.sh
#
# Requires the dev server to be running (bun run dev)
# Uses the TTN_APP_KEY from .env (default: your-ttn-api-key)

BASE_URL="http://localhost:8090/api/v1"
API_KEY="${TTN_APP_KEY:-your-ttn-api-key}"

send() {
  local description="$1"
  local payload="$2"
  echo "--- $description ---"
  curl -s -X POST "$BASE_URL/webhook" \
    -H "Content-Type: application/json" \
    -H "X-Downlink-Apikey: $API_KEY" \
    -d "$payload" | python3 -m json.tool 2>/dev/null || echo "(no valid JSON response)"
  echo ""
}

echo "=== LoRaMINT Webhook Tests ==="
echo ""

# 1. Temperature measurement (float, server time)
send "Temperature measurement (float, server time)" '{
  "end_device_ids": { "dev_eui": "A1B2C3D4E5F60001" },
  "uplink_message": {
    "decoded_payload": {
      "messagetyp": "Messwert",
      "datatype": "float",
      "measurand": "temperature",
      "unit": "celsius",
      "sensor": "DHT22",
      "location": "room-101",
      "value": 23.5,
      "timemethode": "server"
    }
  }
}'

# 2. Humidity measurement (integer, server time)
send "Humidity measurement (integer, server time)" '{
  "end_device_ids": { "dev_eui": "A1B2C3D4E5F60001" },
  "uplink_message": {
    "decoded_payload": {
      "messagetyp": "Messwert",
      "datatype": "integer",
      "measurand": "humidity",
      "unit": "percent",
      "sensor": "DHT22",
      "location": "room-101",
      "value": 65,
      "timemethode": "server"
    }
  }
}'

# 3. CO2 measurement (float, custom timestamp)
send "CO2 measurement (float, custom timestamp)" '{
  "end_device_ids": { "dev_eui": "A1B2C3D4E5F60002" },
  "uplink_message": {
    "decoded_payload": {
      "messagetyp": "Messwert",
      "datatype": "float",
      "measurand": "co2",
      "unit": "ppm",
      "sensor": "SCD30",
      "location": "lab-01",
      "value": 412.7,
      "timemethode": "custom",
      "timevalue": 1700000000
    }
  }
}'

# 4. Status measurement (string, no time)
send "Status measurement (string, no time)" '{
  "end_device_ids": { "dev_eui": "A1B2C3D4E5F60003" },
  "uplink_message": {
    "decoded_payload": {
      "messagetyp": "Messwert",
      "datatype": "string",
      "measurand": "status",
      "unit": "enum",
      "sensor": "internal",
      "location": "gateway-01",
      "value": "active",
      "timemethode": "none"
    }
  }
}'

# 5. Log entry
send "Log entry" '{
  "end_device_ids": { "dev_eui": "A1B2C3D4E5F60001" },
  "uplink_message": {
    "decoded_payload": {
      "messagetyp": "LogEintrag",
      "message": "Device booted successfully"
    }
  }
}'

# 6. Error case: wrong API key
echo "--- Error: wrong API key ---"
curl -s -X POST "$BASE_URL/webhook" \
  -H "Content-Type: application/json" \
  -H "X-Downlink-Apikey: wrong-key" \
  -d '{"end_device_ids":{"dev_eui":"A1B2C3D4E5F60001"},"uplink_message":{"decoded_payload":{"messagetyp":"Messwert","datatype":"float","measurand":"temp","unit":"c","sensor":"s","location":"l","value":1,"timemethode":"server"}}}' \
  | python3 -m json.tool 2>/dev/null
echo ""

# 7. Error case: invalid datatype
send "Error: invalid datatype" '{
  "end_device_ids": { "dev_eui": "A1B2C3D4E5F60001" },
  "uplink_message": {
    "decoded_payload": {
      "messagetyp": "Messwert",
      "datatype": "boolean",
      "measurand": "temp",
      "unit": "c",
      "sensor": "s",
      "location": "l",
      "value": true,
      "timemethode": "server"
    }
  }
}'

echo "=== Checking stored data ==="
echo ""
echo "--- Measurements ---"
curl -s "$BASE_URL/measurements" | python3 -m json.tool 2>/dev/null
echo ""
echo "--- Log entries ---"
curl -s "$BASE_URL/log-entries" | python3 -m json.tool 2>/dev/null
