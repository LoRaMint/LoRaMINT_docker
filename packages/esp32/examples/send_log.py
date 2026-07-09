"""
Example: join the LoRaWAN network and send a log entry.

Install the loramint package on the board, then run this file (e.g. with
`mpremote run examples/send_log.py`).
"""

from loramint import LoRaMINT

lora = LoRaMINT()

if not lora.check_connection():
    raise SystemExit("Aborting: no UART connection to the LA66.")

print("Joining LoRaWAN network...")
if not lora.join():
    raise SystemExit("Join failed.")
print("Joined.")

if lora.sendLog("ESP32 gestartet"):
    print("Log entry sent.")
