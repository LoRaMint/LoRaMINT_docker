"""
Example: join the LoRaWAN network, send a log entry and a measurement value.

On an ESP32 running MicroPython, main.py runs automatically after boot.py.
Upload this file together with loramint.py and mintvalue.py to the board.
"""

import time

from loramint import LoRaMINT
from mintvalue import MintValue

# Open the UART to the LA66 (defaults: UART2, TX=GPIO17, RX=GPIO16, 9600 baud)
lora = LoRaMINT()

print("Joining LoRaWAN network...")
if not lora.join():
    print("Join failed.")
else:
    print("Joined.")

    # 1. Send a log entry
    if lora.sendLog("ESP32 gestartet"):
        print("Log entry sent.")

    # 2. Send a measurement value (float, timestamped by the server)
    temperature = 21.5
    value = MintValue(temperature, "*C", "Raum 101", "Temperatur", "BME280")
    if lora.sendValue(value):
        print("Measurement sent.")

    # Repeatedly send a reading every 20 seconds
    while True:
        reading = MintValue(21.5, "*C", "Raum 101", "Temperatur", "BME280")
        lora.sendValue(reading)
        time.sleep(20)
