/*
  LoRaMINT example: read the temperature from a BME280 and send it via
  LoRaWAN (Dragino LA66) to the LoRaMINT backend.

  Wiring (I2C, BME280 at address 0x76 — Arduino Uno):
    VIN -> 3.3V     SDA -> A4
    GND -> GND      SCL -> A5

  Adapted from an Adafruit BME280 example.
  Original code (c) Limor Fried & Kevin Townsend, Adafruit Industries — BSD license.
*/

#include <Wire.h>
// Requires these Adafruit libraries — install them via the Arduino Library Manager:
//   Adafruit BME280 Library, Adafruit Unified Sensor, Adafruit BusIO
// (see packages/arduino/README.md for download links)
#include <Adafruit_Sensor.h>
#include <Adafruit_BME280.h>
#include "LoRaMINT.h"
#include "MintValue.h"

LoRaMINT loramint = LoRaMINT();
Adafruit_BME280 bme;

void setup() {
    Serial.begin(9600);
    while (!Serial);    // wait for the serial connection

    Serial.println(F("LoRaMINT – Temperature (BME280)"));

    if (!bme.begin(0x76)) {
        // No BME280 — a BMP280 can also measure temperature, so report it if present.
        uint8_t id = bme.sensorID();
        if (id >= 0x56 && id <= 0x58) {
            Serial.println("A BMP280 is connected. It can measure temperature and "
                           "pressure, but this example requires a BME280.");
        } else {
            Serial.println("No BME280 found — check wiring and the I2C address (0x76).");
        }
        while (1) delay(10);
    }

    Serial.println("LoRaMINT – Send Temperature Example");
}

void loop() {
    float temperature = bme.readTemperature();

    MintValue value = MintValue(temperature, "*C", "Ort", "Temperatur", "BME 280");
    loramint.sendValue(value);
    delay(60000); // send once per minute
}
