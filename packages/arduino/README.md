# LoRaMINT Arduino Library

Arduino library for programming the sensor nodes of **LoRaMINT** — a general-purpose,
long-range measurement system for STEM education in schools. It encodes measurement
values and sends them via LoRaWAN (Dragino LA66 shield) to The Things Network (TTN),
which forwards them to the LoRaMINT backend via webhook.

> This package is part of the [LoRaMINT monorepo](../../README.md). The backend
> that receives the data lives in `packages/api`. All paths below are relative to
> this directory (`packages/arduino/`).

## 1 Contents

```
LoRaMINT/                    # Main library (custom): LoRaMINT + MintValue
```

`LoRaMINT/` contains the `LoRaMINT` class (`sendValue` / `sendLog` over the LA66)
and the `MintValue` class (encoding of a measurement per the LoRaMINT protocol).

The BME280 examples additionally need three Adafruit libraries, which are **not**
bundled here. Install them via the Arduino Library Manager or download them from
Adafruit:

- [Adafruit BME280 Library](https://github.com/adafruit/Adafruit_BME280_Library)
- [Adafruit Unified Sensor](https://github.com/adafruit/Adafruit_Sensor)
- [Adafruit BusIO](https://github.com/adafruit/Adafruit_BusIO)

## 2 Installation

1. Copy the `LoRaMINT/` folder from this directory into your Arduino libraries
   directory:
   - **Windows:** `Documents\Arduino\libraries\`
   - **macOS:** `~/Documents/Arduino/libraries/`
   - **Linux:** `~/Arduino/libraries/`
2. Install the Adafruit dependencies (only needed for the BME280 examples) via the
   Arduino **Library Manager** — search for `Adafruit BME280 Library`,
   `Adafruit Unified Sensor` and `Adafruit BusIO` — or download them from the
   Adafruit repositories linked above.

Then restart the Arduino IDE. The library appears under **File → Examples → LoRaMINT**.

## 3 Hardware

- Arduino (Uno or compatible)
- [Dragino LA66 LoRaWAN Shield](https://wiki.dragino.com/xwiki/bin/view/Main/User%20Manual%20for%20LoRaWAN%20End%20Nodes/LA66%20LoRaWAN%20Shield/)
- Adafruit BME280 breakout (for temperature/humidity/pressure examples), connected via I2C at address `0x76`

## 4 Usage

**Send a measurement value:**

```cpp
#include "LoRaMINT.h"
#include "MintValue.h"

LoRaMINT loramint = LoRaMINT();

void loop() {
  float temperature = 21.5;
  MintValue value = MintValue(temperature, "*C", "Raum 101", "Temperatur", "BME280");
  loramint.sendValue(value);
  delay(20000);
}
```

**MintValue constructor signature:**

```cpp
MintValue(value, unit, location, measurand, sensor)
MintValue(value, unit, location, measurand, sensor, time)  // with custom Unix timestamp
```

| Parameter | Max length | Description |
|-----------|-----------|-------------|
| `value` | — | Measured value (`byte`, `int`, `long`, `float`, `double`, or `String`) |
| `unit` | 10 chars | Unit of measurement (e.g. `"*C"`, `"hPa"`, `"%"`) |
| `location` | 30 chars | Location identifier (e.g. `"Raum 101"`) |
| `measurand` | 15 chars | What is measured (e.g. `"Temperatur"`) |
| `sensor` | 10 chars | Sensor identifier (e.g. `"BME280"`) |
| `time` | — | Optional Unix timestamp (`long`) |

**Send a log message:**

```cpp
loramint.sendLog("Sensor gestartet");  // max 140 characters
```

## 5 Examples

| Example | Description |
|---------|-------------|
| `sendValue` | Minimal example sending a string value |
| `sendTemperature` | Reads temperature from BME280, sends every 20 s |
| `sendHumidity` | Reads humidity from BME280, sends every 20 s |
| `sendPressure` | Reads air pressure from BME280, sends every 20 s |
| `logMessage` | Sends a text log message every 20 s |
