"""
Example: read the air pressure from a BME280 and send it once per minute.

Needs a BME280 MicroPython driver (not bundled) — e.g. robert-hh/BME280:
    mpremote mip install github:robert-hh/BME280
Different drivers expose slightly different APIs; adjust the read line below to
match the driver you install.

Wiring (I2C — ESP32 defaults): SDA=GPIO21, SCL=GPIO22, BME280 at address 0x76.
"""

import time
from machine import I2C, Pin

import bme280
from loramint import LoRaMINT, MintValue

UPLINK_INTERVAL = 60  # seconds between uplinks

# BME280 on I2C
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
sensor = bme280.BME280(i2c=i2c)

lora = LoRaMINT()

if not lora.check_connection():
    raise SystemExit("Aborting: no UART connection to the LA66.")

print("Joining LoRaWAN network...")
if not lora.join():
    raise SystemExit("Join failed.")
print("Joined.")

while True:
    # robert-hh/BME280 (float variant): returns (temperature, pressure, humidity).
    _, pressure, _ = sensor.read_compensated_data()
    pressure = pressure / 100  # Pa -> hPa
    value = MintValue(pressure, "hPa", "Raum 101", "Druck", "BME280")
    if lora.sendValue(value):
        print("Measurement sent:", pressure)
    time.sleep(UPLINK_INTERVAL)
