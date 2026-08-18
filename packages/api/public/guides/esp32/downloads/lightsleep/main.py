"""
Example for trying things out: send one measurement value per minute.

Same as ../deepsleep/main.py, but it waits in machine.lightsleep() instead of
going into deep sleep. Light sleep returns, so the program keeps running in the
loop below and the Thonny shell stays connected - you can watch every uplink. It
draws about a milliamp, against microamps for deep sleep, but far less than an
idle time.sleep(), which would hold the chip at tens of milliamps.

Use ../deepsleep/main.py once the node is meant to run on its own.
"""

import machine

from loramint import LoRaMINT, MintValue

# Seconds to wait between uplinks. Also keeps the node within the TTN fair-use
# policy, so do not go far below this.
UPLINK_INTERVAL = 60

# Open the UART to the LA66 (defaults: UART2, TX=GPIO17, RX=GPIO16, 9600 baud)
lora = LoRaMINT()

if not lora.check_connection():
    raise SystemExit("Aborting: no UART connection to the LA66.")

print("Joining LoRaWAN network...")
if not lora.join():
    raise SystemExit("Join failed.")
print("Joined.")

if lora.sendLog("ESP32 gestartet"):
    print("Log entry sent.")

while True:
    # Waiting first, so the log entry above and the first measurement do not go
    # out back to back - as a Class A device the LA66 is still busy with the
    # receive windows of the previous uplink.
    machine.lightsleep(UPLINK_INTERVAL * 1000)

    value = MintValue(21.5, "*C", "Raum 101", "Temperatur", "BME280")
    if lora.sendValue(value):
        print("Measurement sent.")
