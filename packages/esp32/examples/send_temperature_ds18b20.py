"""
Example: read the temperature from a DS18B20 and send it once per minute.

The DS18B20 is a 1-Wire sensor. MicroPython ships the drivers for it built in
(`onewire` + `ds18x20`), so nothing extra needs to be installed.

Wiring (1-Wire, ESP32-S3): DATA=GPIO4, plus a 4.7 kOhm pull-up resistor between
DATA and 3V3. Power the sensor from 3V3 and GND. Several DS18B20 can share the
one data line; this example reads the first one found.
"""

import time
from machine import Pin

import onewire
import ds18x20
from loramint import LoRaMINT, MintValue

UPLINK_INTERVAL = 60  # seconds between uplinks

# DS18B20 on a 1-Wire bus (ESP32-S3 pin; change to match your board)
ONEWIRE_DATA = 4
bus = ds18x20.DS18X20(onewire.OneWire(Pin(ONEWIRE_DATA)))

roms = bus.scan()
if not roms:
    raise SystemExit("Aborting: no DS18B20 found on the 1-Wire bus.")
rom = roms[0]  # use the first sensor on the bus

lora = LoRaMINT()

if not lora.check_connection():
    raise SystemExit("Aborting: no UART connection to the LA66.")

print("Joining LoRaWAN network...")
if not lora.join():
    raise SystemExit("Join failed.")
print("Joined.")

while True:
    # Trigger a conversion, then wait for it (>=750 ms at 12-bit resolution).
    bus.convert_temp()
    time.sleep_ms(750)
    temperature = bus.read_temp(rom)
    value = MintValue(temperature, "*C", "Raum 101", "Temperatur", "DS18B20")
    if lora.sendValue(value):
        print("Measurement sent:", temperature)
    time.sleep(UPLINK_INTERVAL)
