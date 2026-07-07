/*
  LoRaMINT example: send a measurement value via LoRaWAN (Dragino LA66) to the
  LoRaMINT backend.
*/

#include "LoRaMINT.h"
#include "MintValue.h"

LoRaMINT loramint = LoRaMINT();

void setup() {
}

void loop() {
    MintValue value = MintValue("Value", "Einheit", "Ort", "Messgroesse", "Sensor");
    loramint.sendValue(value);
    delay(60000); // send once per minute
}
