/*
	LoRaMINT.h - Library for sending Data via LoRaWAN using the Dragino
	LA66 LoRaWAN Shield in conjunction with TheThingsNetwork and an MariaDB
	database. All set up like the LoRaMINT-standard.
	Created by Matthias Ruf, March, 2023

	For more information see <LoRaMINT-domain missing>
*/




#include "Arduino.h"
#include "LoRaMINT.h"
#include "SoftwareSerial.h"
#include "MintValue.h"


LoRaMINT:: LoRaMINT() : loraSerial(10, 11){
  loraSerial.begin(9600); // Start the SoftwareSerial stream
  loraSerial.println("ATZ"); // reset LA66
	
}

void LoRaMINT:: sendLog(String logMessage){

  byte arr[140+1]; // 140 chars log message and 1 byte header
  arr[0] = B00000101;
  int i = 1;
  while(i <= logMessage.length() && i < 141){
      arr[i] = logMessage.charAt(i-1);
      i++;
  }
  while(i<141){
      arr[i++] = 0;
  }

  String out = "";
  for(int i = 0; i < logMessage.length() + 1;i++){
    out += byteToHex(arr[i]);
  }
  loraSerial.print("AT+SENDB=0,2,");
  loraSerial.print(logMessage.length() + 1);
  loraSerial.print(",");
  loraSerial.println(out); //header


}


void LoRaMINT:: sendValue(MintValue value){
	loraSerial.print("AT+SENDB=0,2,");
    value.toByteString();
    loraSerial.print(value.maxMessageSize);
    loraSerial.print(",");
    loraSerial.println(value.toByteString());
}

String LoRaMINT::byteToHex(byte value){

  byte digit1 = value % 16;
  byte digit2 = (value - digit1)/16;

  return hexToString(digit2) + hexToString(digit1);

}

String LoRaMINT::hexToString(byte value){
  const char hexChars[] = "0123456789ABCDEF";
  if (value < 16) {
    return String(hexChars[value]);
  }
  return "0";
}


