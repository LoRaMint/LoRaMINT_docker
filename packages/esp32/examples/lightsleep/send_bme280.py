"""
Example for trying things out: read a BME280 and send temperature, humidity and
air pressure once per minute.

Needs a BME280 MicroPython driver (not bundled) — e.g. robert-hh/BME280:
    mpremote mip install github:robert-hh/BME280
Different drivers expose slightly different APIs; adjust the read line below to
match the driver you install.

Wiring (I2C, ESP32-S3): SDA=GPIO10, SCL=GPIO11, BME280 at address 0x76.

Same as ../deepsleep/send_bme280.py, but it waits in machine.lightsleep()
instead of going into deep sleep. Light sleep returns, so the program keeps
running in the loop below and the Thonny shell stays connected - you can watch
every uplink. It draws about a milliamp, against microamps for deep sleep, but
far less than an idle time.sleep(), which would hold the chip at tens of
milliamps.

Use ../deepsleep/send_bme280.py once the node is meant to run on its own.
"""

import machine
from machine import I2C, Pin

import bme280
from loramint import LoRaMINT, MintValue

UPLINK_INTERVAL = 60  # seconds between measurement cycles
UPLINK_SPACING = 15   # seconds between the three uplinks of one cycle

# BME280 on I2C (ESP32-S3 pins; change to match your board)
I2C_SDA = 10
I2C_SCL = 11

LOCATION = "Raum 101"

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
    temperature, pressure, humidity = sensor.read_compensated_data()

    readings = (
        (temperature, "*C", "Temperatur"),
        (humidity, "% rel", "Luftfeuchte"),
        (pressure / 100, "hPa", "Druck"),  # the driver reports Pa
    )

    for index, (reading, unit, measurand) in enumerate(readings):
        if index:
            # Let the LA66 finish the receive windows of the previous uplink -
            # as a Class A device it will not accept a new one while busy.
            machine.lightsleep(UPLINK_SPACING * 1000)
        if lora.sendValue(MintValue(reading, unit, LOCATION, measurand, "BME280")):
            print("Measurement sent:", measurand, reading, unit)

    machine.lightsleep(UPLINK_INTERVAL * 1000)
