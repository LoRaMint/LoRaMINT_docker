"""
Example: join the LoRaWAN network, send a log entry and measurement values.

On an ESP32 running MicroPython, main.py runs automatically after boot.py.
Upload this file together with loramint.py and mintvalue.py to the board.
"""

import time

from loramint import LoRaMINT
from mintvalue import MintValue

# Seconds to wait between uplinks. A delay is required: the LA66 must not be
# given a new uplink while it is still busy with the previous one (Class A RX
# windows). ~10 s or more works reliably; it also respects TTN fair use.
UPLINK_INTERVAL = 20

# Open the UART to the LA66 (defaults: UART2, TX=GPIO17, RX=GPIO16, 9600 baud)
lora = LoRaMINT()

# Verify the UART link before doing anything else
if not lora.check_connection():
    raise SystemExit("Aborting: no UART connection to the LA66.")

print("Joining LoRaWAN network...")
if not lora.join():
    raise SystemExit("Join failed.")
print("Joined.")

# Send an initial log entry
if lora.sendLog("ESP32 gestartet"):
    print("Log entry sent.")

# Send a measurement value every UPLINK_INTERVAL seconds
while True:
    time.sleep(UPLINK_INTERVAL)
    value = MintValue(21.5, "*C", "Raum 101", "Temperatur", "BME280")
    if lora.sendValue(value):
        print("Measurement sent.")
