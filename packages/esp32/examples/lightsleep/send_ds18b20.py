"""
Example for trying things out: read a DS18B20 and send the temperature once per
minute.

The DS18B20 is a 1-Wire sensor. MicroPython ships the drivers for it built in
(`onewire` + `ds18x20`), so nothing extra needs to be installed.

Wiring (1-Wire, ESP32-S3): DATA=GPIO4, plus a 4.7 kOhm pull-up resistor between
DATA and 3V3. Power the sensor from 3V3 and GND. Several DS18B20 can share the
one data line; this example reads the first one found.

Same as ../deepsleep/send_ds18b20.py, but it waits in machine.lightsleep()
instead of going into deep sleep. Light sleep returns, so the program keeps
running in the loop below and the Thonny shell stays connected - you can watch
every uplink. It draws about a milliamp, against microamps for deep sleep, but
far less than an idle time.sleep(), which would hold the chip at tens of
milliamps.

Use ../deepsleep/send_ds18b20.py once the node is meant to run on its own.
"""

import machine
from machine import Pin

import ds18x20
import onewire
from loramint import LoRaMINT, MintValue

UPLINK_INTERVAL = 60  # seconds between measurements

# DS18B20 on a 1-Wire bus (ESP32-S3 pin; change to match your board)
ONEWIRE_DATA = 4

LOCATION = "Raum 101"

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
    # The sensor converts on its own, so the ESP32 can spend the wait asleep.
    bus.convert_temp()
    machine.lightsleep(750)
    temperature = bus.read_temp(rom)

    if lora.sendValue(MintValue(temperature, "*C", LOCATION, "Temperatur", "DS18B20")):
        print("Measurement sent:", temperature)

    machine.lightsleep(UPLINK_INTERVAL * 1000)
