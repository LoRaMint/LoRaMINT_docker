/*
	LoRaMINT.h - Library for sending Data via LoRaWAN using the Dragino
	LA66 LoRaWAN Shield in conjunction with TheThingsNetwork and an MariaDB
	database. All set up like the LoRaMINT-standard.
	Created by Matthias Ruf, March, 2023

	For more information see <LoRaMINT-domain missing>
*/

#ifndef LoRaMINT_h
#define LoRaMINT_h

#include "Arduino.h"
#include "SoftwareSerial.h"
#include "MintValue.h"

class LoRaMINT{

	public:
		LoRaMINT();
		void sendLog(String logMessage);
		void sendValue(MintValue value);
	private:
		SoftwareSerial loraSerial;
		String byteToHex(byte value);
		String hexToString(byte value);
};

#endif
