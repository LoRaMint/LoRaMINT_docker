"""
Example: join the LoRaWAN network and send a single measurement value.

Install the loramint package on the board, then run this file (e.g. with
`mpremote run examples/send_value.py`).
"""

from loramint import LoRaMINT, MintValue

lora = LoRaMINT()

if not lora.check_connection():
    raise SystemExit("Aborting: no UART connection to the LA66.")

print("Joining LoRaWAN network...")
if not lora.join():
    raise SystemExit("Join failed.")
print("Joined.")

value = MintValue(21.5, "*C", "Raum 101", "Temperatur", "BME280")
if lora.sendValue(value):
    print("Measurement sent.")
