"""
Example for continuous operation: send one measurement value per cycle.

Install the loramint package on the board, then copy this file to the board root
as main.py so it runs automatically after boot.py.

There is no loop here. machine.deepsleep() does not return - the ESP32 restarts
and runs this file from the top again, so the restart *is* the next cycle. In
deep sleep the chip draws microamps, where an idle time.sleep() would keep it at
tens of milliamps for the whole interval.

The restart takes the serial port down with it, so this file is awkward to watch
in Thonny. Use main_lightsleep.py while trying things out.

The LA66 is a separate chip and keeps its LoRaWAN session and frame counter
across the restart, so join() returns immediately and a cycle costs no OTAA
handshake. Do not switch the LA66 off together with the ESP32 - that loses the
session and every cycle pays for a full join again.

On a development board the USB-serial chip and the voltage regulator usually
draw far more than the ESP32 in deep sleep; the saving only shows on a board
built without them.
"""

import machine
from machine import Pin

from loramint import LoRaMINT, MintValue

# Seconds to sleep between uplinks. Also keeps the node within the TTN fair-use
# policy, so do not go far below this.
UPLINK_INTERVAL = 60

# Stop bridge: connect this pin to GND (a jumper wire is enough) to keep the
# cycle from starting. Deep sleep leaves the board reachable for only the few
# seconds it is awake, which makes it hard to interrupt from Thonny or mpremote;
# with the bridge in place the program ends right here and hands you the REPL.
#
# Pick a free pin, never a strapping pin - on the ESP32-S3 those are GPIO0, 3,
# 45 and 46. They are sampled at reset, and waking from deep sleep *is* a reset,
# so a bridge on one of them would put the board into download mode instead.
STOP_PIN = 5


def sleep_until_next_cycle():
    """Enter deep sleep. Never returns - the ESP32 restarts on wake-up."""
    machine.deepsleep(UPLINK_INTERVAL * 1000)


# Checked before anything else, so the bridge works even when the LA66 or the
# wiring is at fault.
if not Pin(STOP_PIN, Pin.IN, Pin.PULL_UP).value():
    raise SystemExit("Stop bridge on GPIO{} - cycle not started.".format(STOP_PIN))

# Open the UART to the LA66 (defaults: UART2, TX=GPIO17, RX=GPIO16, 9600 baud)
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
    # The first measurement follows in the next cycle: two uplinks back to back
    # would make the second one fail, because as a Class A device the LA66 is
    # still busy with the receive windows of the first.
    if lora.sendLog("ESP32 gestartet"):
        print("Log entry sent.")
    sleep_until_next_cycle()

value = MintValue(21.5, "*C", "Raum 101", "Temperatur", "BME280")
if lora.sendValue(value):
    print("Measurement sent.")

sleep_until_next_cycle()
