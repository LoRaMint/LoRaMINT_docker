# LoRaMINT ESP32 Library

MicroPython port of the [LoRaMINT Arduino library](../arduino) for programming
LoRaMINT sensor nodes on an **ESP32** with a **Dragino LA66** LoRaWAN module. It
encodes measurement values and log messages according to the LoRaMINT message
protocol (version 1) and sends them via the LA66 AT command set to TTN, which
forwards them to the LoRaMINT backend.

> Part of the [LoRaMINT monorepo](../../README.md). The backend that receives the
> data lives in `packages/api`.

## Contents

```
loramint/                The library package
  __init__.py              exports LoRaMINT and MintValue
  loramint.py              LoRaMINT class - join(), sendLog(), sendValue()
  mintvalue.py             MintValue class - encodes one measurement value
examples/                Example programs
  deepsleep/               for continuous operation - see below
    main.py                  send a fixed value, no sensor needed
    send_bme280.py           read a BME280, send temperature, humidity, pressure
    send_ds18b20.py          read a DS18B20 (1-Wire) and send the temperature
  lightsleep/              the same three, for trying things out in Thonny
  send_value.py            send a single measurement value (one shot)
  send_log.py              send a log entry (one shot)
package.json             mip manifest (used for installation, see below)
```

## Hardware

- ESP32 development board running [MicroPython](https://micropython.org/)
- [Dragino LA66 LoRaWAN module](https://wiki.dragino.com/xwiki/bin/view/Main/User%20Manual%20for%20LoRaWAN%20End%20Nodes/LA66%20LoRaWAN%20Shield/)

### Wiring (default UART2)

| ESP32 | LA66 |
|-------|------|
| `GPIO17` (TX) | RX |
| `GPIO16` (RX) | TX |
| `GND` | GND |
| `3V3` / `5V` | VCC (per module spec) |

The DevEUI / AppEUI / AppKey must already be configured on the LA66 (OTAA join).

## Installation

**Option A – with `mip`** (recommended). Installs the `loramint` package from
GitHub straight onto the board via
[`mpremote`](https://docs.micropython.org/en/latest/reference/mpremote.html):

```bash
mpremote mip install github:LoRaMint/LoRaMINT_docker/packages/esp32
```

Or from within MicroPython on the board:

```python
import mip
mip.install("github:LoRaMint/LoRaMINT_docker/packages/esp32")
```

**Option B – manual copy.** Copy the `loramint/` package folder to the board:

```bash
mpremote cp -r loramint :
```

Then pick an example from `examples/` and copy it to the board root as `main.py`
so it runs automatically on boot:

```bash
mpremote cp examples/deepsleep/main.py :main.py
```

## Provisioning the LA66 (OTAA keys)

The LA66 ships with its DevEUI, AppEUI and AppKey already set. You normally just
read them from the module and register those values in the TTN console — nothing
needs to be set on the device.

```text
AT+CFG          # show all keys at once
AT+DEUI=?       # DevEUI (unique per device)
AT+APPEUI=?     # AppEUI / JoinEUI
AT+APPKEY=?     # AppKey
```

(Only set them with `AT+DEUI=<hex>` etc. if you want to override the defaults.)

If a join fails with `txTimeout`, the request was sent but no gateway answered —
check that the keys match TTN and the antenna is connected.

## Usage

### Join and send a log entry

```python
from loramint import LoRaMINT

lora = LoRaMINT()                 # UART2, TX=GPIO17, RX=GPIO16, 9600 baud

if lora.join():                   # OTAA join (AT+JOIN), skipped if still joined
    lora.sendLog("Sensor gestartet")   # max 140 characters
```

### Send a measurement value

```python
from loramint import LoRaMINT, MintValue

lora = LoRaMINT()
lora.join()

# datatype is inferred: float -> "float"
value = MintValue(21.5, "*C", "Raum 101", "Temperatur", "BME280")
lora.sendValue(value)
```

### Choosing the datatype and a custom timestamp

```python
# Explicit datatype ("byte", "int", "long", "float", "double", "string")
humidity = MintValue(65, "%", "Raum 101", "Feuchte", "BME280", datatype="int")

# Custom Unix timestamp instead of the server's receive time
reading = MintValue(21.5, "*C", "Raum 101", "Temperatur", "BME280",
                    time=1700000000)

lora.sendValue(humidity)
lora.sendValue(reading)
```

### Custom UART / pins

```python
lora = LoRaMINT(uart_id=1, tx=4, rx=5, baudrate=9600)
```

## API

### `LoRaMINT`

| Method | Description |
|--------|-------------|
| `LoRaMINT(uart_id=2, tx=17, rx=16, baudrate=9600, reset=False)` | Open the UART. With `reset=True` the LA66 is also reset (`ATZ`) — see below. |
| `check_connection(timeout_ms=3000)` | Verify the UART link via `AT+VER=?`. Prints a status message; returns `True` if the LA66 responded. |
| `get_version(timeout_ms=3000)` | Query the LA66 firmware version (`AT+VER=?`). Returns the version string or `None`. |
| `is_joined(timeout_ms=3000)` | Whether the LA66 still holds a LoRaWAN session (`AT+NJS=?`). |
| `join(timeout_ms=60000, force=False)` | Join the network via OTAA. Returns immediately when already joined, unless `force=True`. Returns `True` on success. |
| `sendLog(message)` | Send a log entry (`LogEintrag`, max 140 chars). Returns `True` on `OK`. |
| `sendValue(value)` | Send a `MintValue` (`Messwert`). Returns `True` on `OK`. |

### `MintValue`

```python
MintValue(value, unit, location, measurand, sensor, datatype=None, time=None)
```

| Parameter | Max length | Description |
|-----------|-----------|-------------|
| `value` | — | Measured value (int, float or str) |
| `unit` | 10 | Unit of measurement (e.g. `"*C"`, `"hPa"`, `"%"`) |
| `location` | 30 | Location identifier (e.g. `"Raum 101"`) |
| `measurand` | 15 | What is measured (e.g. `"Temperatur"`) |
| `sensor` | 10 | Sensor identifier (e.g. `"BME280"`) |
| `datatype` | — | `"byte"`, `"int"`, `"long"`, `"float"`, `"double"` or `"string"`; inferred if omitted |
| `time` | — | Optional Unix timestamp (int) |

Fields exceeding their length limit are replaced with `"too long"`; a string
`value` is truncated to 20 characters (matching the Arduino library).

### Spacing between uplinks

Leave a delay (≈10 s or more) between consecutive uplinks. As a Class A device
the LA66 opens its receive windows right after each transmission and will not
accept a new uplink while it is still busy — sending `sendLog` and `sendValue`
back to back makes the second one fail. The examples use
`UPLINK_INTERVAL = 60` seconds. This also keeps you within the TTN fair-use
policy.

### `deepsleep/` or `lightsleep/` — which folder to use

The same three programs exist twice. They differ in how the ESP32 spends the
wait between uplinks; nothing idles in `time.sleep()`, which would hold the chip
at tens of milliamps for the whole interval.

| Folder | Call | Current | Effect |
|---|---|---|---|
| `deepsleep/` | `machine.deepsleep()` | ~10–20 µA | Does **not** return. The board restarts and runs the file from the top — the restart *is* the next cycle. No loop in the file. |
| `lightsleep/` | `machine.lightsleep()` | ~1 mA | Returns. A plain `while True` loop carries on, RAM intact. |

**Use `lightsleep/` while working in Thonny.** Deep sleep restarts the board; on
a chip with native USB (ESP32-S3/C3) the serial port disappears with it and
Thonny loses the connection. Light sleep leaves the shell attached, so you see
every uplink. **Use `deepsleep/` for a node that runs on its own.**

At a one-minute interval the two are closer than the currents suggest: the
active phase dominates either way, and deep sleep pays for a full boot every
cycle. Deep sleep only pulls clearly ahead once the interval grows to several
minutes. On a development board neither shows much — the USB-serial chip and the
voltage regulator draw more than the ESP32 asleep.

#### Getting back in: the stop bridge

A board in the deep-sleep cycle is reachable for only the two or three seconds
it is awake each minute, which makes it awkward to interrupt. Each `deepsleep/`
program therefore checks a **stop pin** as its very first statement — before the
UART, before the sensor, so it works even when the wiring is at fault:

```python
STOP_PIN = 5

if not Pin(STOP_PIN, Pin.IN, Pin.PULL_UP).value():
    raise SystemExit("Stop bridge on GPIO{} - cycle not started.".format(STOP_PIN))
```

Put a jumper wire between GPIO5 and GND, restart the board, and you get a free
REPL instead of the cycle. Pull the wire and restart to run again.

**Never use a strapping pin for this** — on the ESP32-S3 those are GPIO0, 3, 45
and 46. They are sampled at reset, and waking from deep sleep *is* a reset, so a
bridge on one of them puts the board into the ROM download mode rather than into
the REPL. `boot:0x23 (DOWNLOAD)` in the reset banner is what that looks like.

Without the bridge, the fallback is to let the computer race the wake-up window:

```bash
while ! mpremote connect /dev/cu.usbmodem14101 fs rm :main.py; do sleep 0.2; done
```

Two things are specific to `deepsleep/`, because the restart forces them:

- **Every failure path ends in deep sleep as well.** A node that stops on an
  error stays awake at full clock until the battery is empty and never retries.
  The `lightsleep/` programs stop with a message instead — someone is watching.
- **The start-up log entry is guarded** by
  `machine.reset_cause() != machine.DEEPSLEEP_RESET`, so it goes out on a cold
  start only rather than on every wake-up. A press on RST counts as a cold
  start, which is intended: it makes an unplanned restart visible in the
  backend.

In both folders the **LA66 must stay powered.** It holds the LoRaWAN session and
the frame counter across an ESP32 restart, which is what lets `join()` return
immediately. Switching it off with the ESP32 costs a full OTAA join per cycle
and defeats the whole arrangement.

A short pause *within* a cycle always uses `machine.lightsleep()`, in both
folders — `send_bme280.py` spaces its three uplinks that way, and
`send_ds18b20.py` waits out the sensor's conversion time. It keeps the RAM
alive, so the readings survive.

### The join is not repeated

An OTAA handshake costs an uplink plus two receive windows and can block for up
to `timeout_ms` — by far the most expensive thing a battery-powered node does.
The LA66 stores its LoRaWAN session itself and keeps it across an ESP32 reboot,
so `join()` first asks `AT+NJS=?` and returns straight away when the session is
still there. Nothing changes for calling code: `join()` is still the one call
you make before sending.

Two consequences worth knowing:

- **`ATZ` is no longer sent on construction.** The reset wipes that stored
  session and is what forced a fresh join on every start. Stale bytes on the
  line are cleared before every command anyway, so the reset was not needed for
  that. Pass `LoRaMINT(reset=True)` when a module is wedged and a clean state is
  worth the join.
- **`join(force=True)`** does the handshake unconditionally, for the rare case
  where you want a new session (e.g. after changing the keys).

A module that does not answer `AT+NJS=?` raises `OSError` rather than quietly
joining again — an unnoticed rejoin on every wake-up is exactly what this
change exists to prevent.

## Protocol

Both message types are sent with `AT+SENDB=0,2,<len>,<hexdata>` (unconfirmed,
LoRaWAN port 2).

**Log message** — `0x05` marker byte followed by the ASCII message
(`len = message length + 1`, no padding).

**Measurement value** — always a 99-byte payload:

```
byte 0     0x06                     protocol v1 + "measured value"
byte 1     (datatype << 2) | tflag  datatype + time flag (01 server, 10 custom)
bytes ...  value                    big-endian (1/2/4 bytes) or ASCII string
0x1E       separator
unit 0x1E  measurand 0x1E  location 0x1E  sensor 0x1E
[4 bytes]  Unix time, big-endian    only when a custom time is given
0x00 ...   zero padding             up to 99 bytes
```

This matches `packages/esp32/arduino` and the TTN payload formatter. The encoding is
verified by an encode/decode round-trip against a port of that formatter.
