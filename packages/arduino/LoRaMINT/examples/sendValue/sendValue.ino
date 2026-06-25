#include "LoRaMINT.h"
#include "MintValue.h"

LoRaMINT loramint = LoRaMINT();

void setup() {
	
}

void loop() {
  
  MintValue value = MintValue("Value","Einheit","Ort","Messgroesse","Sensor");
  loramint.sendValue(value);
  delay(10000);

}
