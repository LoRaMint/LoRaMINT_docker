/*
  LoRaMINT example: send a text log message via LoRaWAN (Dragino LA66) to the
  LoRaMINT backend.
*/

#include "LoRaMINT.h"

LoRaMINT loramint = LoRaMINT();

void setup() {
}

void loop() {
    loramint.sendLog("This is a sample log message");
    delay(60000); // send once per minute
}
