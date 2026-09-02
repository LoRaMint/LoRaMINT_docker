/*
 *	LoRaMINT.cpp - This class describes the properties of a measurement 
 *	value and directly provides methods to send them to the TTN 
 * 	according to the LoRaMINT measurement system.  
 */

#ifndef MintValue_h
#define MintValue_h

#include "Arduino.h"

class MintValue{
	
	public:
		// constructor
		MintValue(byte value,   String unit, String location, String measurand, String sensor  );
		MintValue( int value,   String unit, String location, String measurand, String sensor  );
		MintValue(long value,   String unit, String location, String measurand, String sensor  );
 		MintValue(float value,  String unit, String location, String measurand, String sensor  );
 		MintValue(double value, String unit, String location, String measurand, String sensor  );
		MintValue(String value, String unit, String location, String measurand, String sensor  );
		MintValue(byte value,   String unit, String location, String measurand, String sensor, long time  );
		MintValue( int value,   String unit, String location, String measurand, String sensor, long time  );
		MintValue(long value,   String unit, String location, String measurand, String sensor, long time  );
 		MintValue(float value,  String unit, String location, String measurand, String sensor, long time  );
 		MintValue(double value, String unit, String location, String measurand, String sensor, long time  );
		MintValue(String value, String unit, String location, String measurand, String sensor, long time  );
		
		// methodes which pars the messages
		void toBytes(byte* buffer);
		String toByteString();
		const int maxMessageSize = 99;

	private:
		// contains options (0 no value; 1 int value; 2 double value; 3 String value)
		byte   _option[2];
		// variables for measured values
		byte _valueB;
		int _valueI;
		long _valueL;
		float _valueF;
		double _valueD;
		String _valueS;

		// variable for the Unit
		String _unit;
		// variable for the location
		String _location;
		// variable for the measurand
		String _measurand;
		// variable which describes the sensor
		String _sensor;

		long _time;

		static const char dataseparator = 0x1E;  // ASCII record separator

		String byteToHex(byte value);
		String hexToString(byte value);
};

#endif
