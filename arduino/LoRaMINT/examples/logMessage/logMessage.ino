#include "LoRaMINT.h"

LoRaMINT loramint = LoRaMINT();

void setup() {
	
}

void loop() {
  
  loramint.sendLog("This is a sample log message");
  delay(20000); // 20 secondes delay

}
