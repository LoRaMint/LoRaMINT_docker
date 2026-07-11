"""
Example: read the humidity from a BME280 and send it once per minute.

Needs a BME280 MicroPython driver (not bundled) — e.g. robert-hh/BME280:
    mpremote mip install github:robert-hh/BME280
Different drivers expose slightly different APIs; adjust the read line below to
match the driver you install.

Wiring (I2C, ESP32-S3): SDA=GPIO10, SCL=GPIO11, BME280 at address 0x76.
"""

import time
from machine import I2C, Pin

import bme280
from loramint import LoRaMINT, MintValue

UPLINK_INTERVAL = 60  # seconds between uplinks

# BME280 on I2C (ESP32-S3 pins; change to match your board)
I2C_SDA = 10
I2C_SCL = 11
i2c = I2C(0, sda=Pin(I2C_SDA), scl=Pin(I2C_SCL))
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
    _, _, humidity = sensor.read_compensated_data()
    value = MintValue(humidity, "% rel", "Raum 101", "Luftfeuchte", "BME280")
    if lora.sendValue(value):
        print("Measurement sent:", humidity)
    time.sleep(UPLINK_INTERVAL)
