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
loramint.py     LoRaMINT class - join() the network, sendLog(), sendValue()
mintvalue.py    MintValue class - describes and encodes one measurement value
main.py         Example: join, send a log entry, send measurements
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

Upload the three files to the board (e.g. with
[`mpremote`](https://docs.micropython.org/en/latest/reference/mpremote.html) or Thonny):

```bash
mpremote cp loramint.py :
mpremote cp mintvalue.py :
mpremote cp main.py :
```

`main.py` runs automatically on boot.

## Usage

### Join and send a log entry

```python
from loramint import LoRaMINT

lora = LoRaMINT()                 # UART2, TX=GPIO17, RX=GPIO16, 9600 baud

if lora.join():                   # OTAA join (AT+JOIN)
    lora.sendLog("Sensor gestartet")   # max 140 characters
```

### Send a measurement value

```python
from loramint import LoRaMINT
from mintvalue import MintValue

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
| `LoRaMINT(uart_id=2, tx=17, rx=16, baudrate=9600)` | Open the UART and reset the LA66 (`ATZ`). |
| `check_connection(timeout_ms=3000)` | Verify the UART link via `AT+VER=?`. Prints a status message; returns `True` if the LA66 responded. |
| `get_version(timeout_ms=3000)` | Query the LA66 firmware version (`AT+VER=?`). Returns the version string or `None`. |
| `join(timeout_ms=60000)` | Join the network via OTAA. Returns `True` on success. |
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
back to back makes the second one fail. `main.py` uses `UPLINK_INTERVAL = 20`
seconds. This also keeps you within the TTN fair-use policy.

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

This matches `packages/arduino` and the TTN payload formatter. The encoding is
verified by an encode/decode round-trip against a port of that formatter.
