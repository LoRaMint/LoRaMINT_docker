"""
Example for continuous operation: read a BME280 and send temperature, humidity
and air pressure.

Needs a BME280 MicroPython driver (not bundled) — e.g. robert-hh/BME280:
    mpremote mip install github:robert-hh/BME280
Different drivers expose slightly different APIs; adjust the read line below to
match the driver you install.

Wiring (I2C, ESP32-S3): SDA=GPIO10, SCL=GPIO11, BME280 at address 0x76.

There is no loop here. machine.deepsleep() does not return - the ESP32 restarts
and runs this file from the top again, so the restart *is* the next cycle. In
deep sleep the chip draws microamps, where an idle time.sleep() would keep it at
tens of milliamps for the whole interval.

The restart takes the serial port down with it, so this file is awkward to watch
in Thonny. Use ../lightsleep/send_bme280.py while trying things out.

The three values are read in one go and therefore share one instant, but they
leave as three separate uplinks with a pause in between: as a Class A device the
LA66 opens its receive windows after each transmission and will not accept the
next uplink while it is still busy. Three uplinks per cycle also cost three
times the airtime - against the battery and against the TTN fair-use policy.
Raise UPLINK_INTERVAL if the node runs on a battery.

The LA66 is a separate chip and keeps its LoRaWAN session and frame counter
across the restart, so join() returns immediately and a cycle costs no OTAA
handshake. Do not switch the LA66 off together with the ESP32.

On a development board the USB-serial chip and the voltage regulator usually
draw far more than the ESP32 in deep sleep; the saving only shows on a board
built without them.
"""

import machine
from machine import I2C, Pin

import bme280
from loramint import LoRaMINT, MintValue

UPLINK_INTERVAL = 60  # seconds of deep sleep between measurement cycles
UPLINK_SPACING = 15   # seconds between the three uplinks of one cycle

# BME280 on I2C (ESP32-S3 pins; change to match your board)
I2C_SDA = 10
I2C_SCL = 11

# Stop bridge: connect this pin to GND (a jumper wire is enough) to keep the
# cycle from starting. Deep sleep leaves the board reachable for only the few
# seconds it is awake, which makes it hard to interrupt from Thonny or mpremote;
# with the bridge in place the program ends right here and hands you the REPL.
#
# Pick a free pin, never a strapping pin - on the ESP32-S3 those are GPIO0, 3,
# 45 and 46. They are sampled at reset, and waking from deep sleep *is* a reset,
# so a bridge on one of them would put the board into download mode instead.
STOP_PIN = 5

LOCATION = "Raum 101"


def sleep_until_next_cycle():
    """Enter deep sleep. Never returns - the ESP32 restarts on wake-up."""
    machine.deepsleep(UPLINK_INTERVAL * 1000)


# Checked before anything else, so the bridge works even when the sensor, the
# LA66 or the wiring is at fault.
if not Pin(STOP_PIN, Pin.IN, Pin.PULL_UP).value():
    raise SystemExit("Stop bridge on GPIO{} - cycle not started.".format(STOP_PIN))

i2c = I2C(0, sda=Pin(I2C_SDA), scl=Pin(I2C_SCL))
sensor = bme280.BME280(i2c=i2c)

lora = LoRaMINT()

# Every failure has to end in deep sleep too. A node that just stops here stays
# awake at full clock until the battery is empty - more expensive than running
# normally - and never gets a second chance.
if not lora.check_connection():
    print("No UART connection to the LA66 - retrying after deep sleep.")
    sleep_until_next_cycle()

print("Joining LoRaWAN network...")
if not lora.join():
    print("Join failed - retrying after deep sleep.")
    sleep_until_next_cycle()
print("Joined.")

if machine.reset_cause() != machine.DEEPSLEEP_RESET:
    # Cold start only: after a wake-up this would be sent on every cycle. A
    # press on RST counts as a cold start, which is intended - it makes an
    # unplanned restart visible in the backend.
    #
    # The first measurements follow in the next cycle: sending them right after
    # the log entry would make them fail on the LA66's receive windows.
    if lora.sendLog("ESP32 gestartet"):
        print("Log entry sent.")
    sleep_until_next_cycle()

# robert-hh/BME280 (float variant): returns (temperature, pressure, humidity).
temperature, pressure, humidity = sensor.read_compensated_data()

readings = (
    (temperature, "*C", "Temperatur"),
    (humidity, "% rel", "Luftfeuchte"),
    (pressure / 100, "hPa", "Druck"),  # the driver reports Pa
)

for index, (reading, unit, measurand) in enumerate(readings):
    if index:
        # Let the LA66 finish the receive windows of the previous uplink. Light
        # sleep rather than time.sleep(): it keeps the readings in RAM but drops
        # the CPU from tens of milliamps to about one. Bytes arriving from the
        # LA66 during it are lost, which is fine - the library discards whatever
        # is buffered before every command anyway.
        machine.lightsleep(UPLINK_SPACING * 1000)
    if lora.sendValue(MintValue(reading, unit, LOCATION, measurand, "BME280")):
        print("Measurement sent:", measurand, reading, unit)

sleep_until_next_cycle()
