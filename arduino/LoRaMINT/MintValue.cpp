/*
 *	LoRaMINT.cpp - This class describes the properties of a measurement 
 *	value and directly provides methods to send them to the TTN 
 * 	according to the LoRaMINT measurement system.  
 */

#include "Arduino.h"
#include "MintValue.h"

/**
*
* Constructor of the LoRaMINT-Value class for a byte value. If you need a constructor for another datatype look below.  
*
*/
MintValue::MintValue(byte value, String unit, String location, String measurand, String sensor) {

  _option[0] = B00000110;  // The first six bits encode the LoRaMINT protocol number (000001 -> first version).
                           // The last two bits indicate that it is a measured value. (10 -> measured value)
  _option[1] = B00000101;  // The first six bits encode the datatype of the value. (000001 -> byte)
                           // The last two bits indicate that there is no time information. (01 -> time from server)


  _valueB = value;

  // unit
  if (unit.length() <= 10) {
    _unit = unit;
  } else {
    _unit = "too long";
  }

  if (location.length() <= 30) {
    _location = location;
  } else {
    _location = "too long";
  }

  if (measurand.length() <= 15) {
    _measurand = measurand;
  } else {
    _measurand = "too long";
  }

  if (sensor.length() <= 10) {
    _sensor = sensor;
  } else {
    _sensor = "too long";
  }
}



MintValue::MintValue(int value, String unit, String location, String measurand, String sensor) {

  _option[0] = B00000110;  // The first six bits encode the LoRaMINT protocol number (000001 -> first version).
                           // The last two bits indicate that it is a measured value. (10 -> measured value)
  _option[1] = B00001001;  // The The first six bits encode the datatype of the value. (000010 -> int)
                           // The last two bits indicate that there is no time information. (01 -> time from server)
  _valueI = value;

  if (unit.length() <= 10) {
    _unit = unit;
  } else {
    _unit = "too long";
  }

  if (location.length() <= 30) {
    _location = location;
  } else {
    _location = "too long";
  }

  if (measurand.length() <= 15) {
    _measurand = measurand;
  } else {
    _measurand = "too long";
  }

  if (sensor.length() <= 10) {
    _sensor = sensor;
  } else {
    _sensor = "too long";
  }
}


MintValue::MintValue(long value, String unit, String location, String measurand, String sensor) {

  _option[0] = B00000110;  // The first six bits encode the LoRaMINT protocol number (000001 -> first version).
                           // The last two bits indicate that it is a measured value. (10 -> measured value)
  _option[1] = B00001101;  // The first six bits encode the datatype of the value. (000011 -> long)
                           // The last two bits indicate that there is no time information. (01 -> time from server)
  _valueL = value;

  if (unit.length() <= 10) {
    _unit = unit;
  } else {
    _unit = "too long";
  }

  if (location.length() <= 30) {
    _location = location;
  } else {
    _location = "too long";
  }

  if (measurand.length() <= 15) {
    _measurand = measurand;
  } else {
    _measurand = "too long";
  }

  if (sensor.length() <= 10) {
    _sensor = sensor;
  } else {
    _sensor = "too long";
  }
}


MintValue::MintValue(float value, String unit, String location, String measurand, String sensor) {

  _option[0] = B00000110;  // The first six bits encode the LoRaMINT protocol number (000001 -> first version).
                           // The last two bits indicate that it is a measured value. (10 -> measured value)
  _option[1] = B00010001;  // The first six bits encode the datatype of the value. (000100 -> float)
                           // The last two bits indicate that there is no time information. (01 -> time from server)
  _valueF = value;

  if (unit.length() <= 10) {
    _unit = unit;
  } else {
    _unit = "too long";
  }

  if (location.length() <= 30) {
    _location = location;
  } else {
    _location = "too long";
  }

  if (measurand.length() <= 15) {
    _measurand = measurand;
  } else {
    _measurand = "too long";
  }

  if (sensor.length() <= 10) {
    _sensor = sensor;
  } else {
    _sensor = "too long";
  }
}


MintValue::MintValue(double value, String unit, String location, String measurand, String sensor) {

  _option[0] = B00000110;  // The first six bits encode the LoRaMINT protocol number (000001 -> first version).
                           // The last two bits indicate that it is a measured value. (10 -> measured value)
  _option[1] = B00010101;  // The first six encode the datatype of the value. (000101 -> double)
                           // The last two bits indicate that there is no time information. (01-> time from server)
  _valueD = value;

  if (unit.length() <= 10) {
    _unit = unit;
  } else {
    _unit = "too long";
  }

  if (location.length() <= 30) {
    _location = location;
  } else {
    _location = "too long";
  }

  if (measurand.length() <= 15) {
    _measurand = measurand;
  } else {
    _measurand = "too long";
  }

  if (sensor.length() <= 10) {
    _sensor = sensor;
  } else {
    _sensor = "too long";
  }
}


MintValue::MintValue(String value, String unit, String location, String measurand, String sensor) {

  _option[0] = B00000110;  // The first six bits encode the LoRaMINT protocol number (000001 -> first version).
                           // The last two bits indicate that it is a measured value. (10 -> measured value)
  _option[1] = B00011001;  // The first six bits encode the datatype of the value. (000110 -> String)
                           // The last two bits indicate that there is no time information. (01 -> time from server)

  if (value.length() <= 20) {
    _valueS = value;
  } else {
    _valueS = value.substring(0, 20);
  }

  if (unit.length() <= 10) {
    _unit = unit;
  } else {
    _unit = "too long";
  }

  if (location.length() <= 30) {
    _location = location;
  } else {
    _location = "too long";
  }

  if (measurand.length() <= 15) {
    _measurand = measurand;
  } else {
    _measurand = "too long";
  }

  if (sensor.length() <= 10) {
    _sensor = sensor;
  } else {
    _sensor = "too long";
  }
}


MintValue::MintValue(byte value, String unit, String location, String measurand, String sensor, long time) {

  _option[0] = B00000110;  // The first six bits encode the LoRaMINT protocol number (000001 -> first version).
                           // The last two bits indicate that it is a measured value. (10 -> measured value)
  _option[1] = B00000110;  // The first six bits encode the datatype of the value. (000001 -> byte)
                           // The last two bits indicate that there is no time information. (10 -> custom time)


  _valueB = value;

  // unit
  if (unit.length() <= 10) {
    _unit = unit;
  } else {
    _unit = "too long";
  }

  if (location.length() <= 30) {
    _location = location;
  } else {
    _location = "too long";
  }

  if (measurand.length() <= 15) {
    _measurand = measurand;
  } else {
    _measurand = "too long";
  }

  if (sensor.length() <= 10) {
    _sensor = sensor;
  } else {
    _sensor = "too long";
  }

  _time = time;
}



MintValue::MintValue(int value, String unit, String location, String measurand, String sensor, long time) {

  _option[0] = B00000110;  // The first six bits encode the LoRaMINT protocol number (000001 -> first version).
                           // The last two bits indicate that it is a measured value. (10 -> measured value)
  _option[1] = B00001010;  // The The first six bits encode the datatype of the value. (000010 -> int)
                           // The last two bits indicate that there is no time information. (10 -> custom time)
  _valueI = value;

  if (unit.length() <= 10) {
    _unit = unit;
  } else {
    _unit = "too long";
  }

  if (location.length() <= 30) {
    _location = location;
  } else {
    _location = "too long";
  }

  if (measurand.length() <= 15) {
    _measurand = measurand;
  } else {
    _measurand = "too long";
  }

  if (sensor.length() <= 10) {
    _sensor = sensor;
  } else {
    _sensor = "too long";
  }

  _time = time;

}


MintValue::MintValue(long value, String unit, String location, String measurand, String sensor, long time) {

  _option[0] = B00000110;  // The first six bits encode the LoRaMINT protocol number (000001 -> first version).
                           // The last two bits indicate that it is a measured value. (10 -> measured value)
  _option[1] = B00001110;  // The first six bits encode the datatype of the value. (000011 -> long)
                           // The last two bits indicate that there is no time information. (10 -> custom time)
  _valueL = value;

  if (unit.length() <= 10) {
    _unit = unit;
  } else {
    _unit = "too long";
  }

  if (location.length() <= 30) {
    _location = location;
  } else {
    _location = "too long";
  }

  if (measurand.length() <= 15) {
    _measurand = measurand;
  } else {
    _measurand = "too long";
  }

  if (sensor.length() <= 10) {
    _sensor = sensor;
  } else {
    _sensor = "too long";
  }

  _time = time;

}


MintValue::MintValue(float value, String unit, String location, String measurand, String sensor, long time) {

  _option[0] = B00000110;  // The first six bits encode the LoRaMINT protocol number (000001 -> first version).
                           // The last two bits indicate that it is a measured value. (10 -> measured value)
  _option[1] = B00010010;  // The first six bits encode the datatype of the value. (000101 -> float)
                           // The last two bits indicate that there is no time information. (10 -> custom time)
  _valueF = value;

  if (unit.length() <= 10) {
    _unit = unit;
  } else {
    _unit = "too long";
  }

  if (location.length() <= 30) {
    _location = location;
  } else {
    _location = "too long";
  }

  if (measurand.length() <= 15) {
    _measurand = measurand;
  } else {
    _measurand = "too long";
  }

  if (sensor.length() <= 10) {
    _sensor = sensor;
  } else {
    _sensor = "too long";
  }

  _time = time;

}


MintValue::MintValue(double value, String unit, String location, String measurand, String sensor, long time) {

  _option[0] = B00000110;  // The first six bits encode the LoRaMINT protocol number (000001 -> first version).
                           // The last two bits indicate that it is a measured value. (10 -> measured value)
  _option[1] = B00010110;  // The first six encode the datatype of the value. (000101 -> double)
                           // The last two bits indicate that there is no time information. (10 -> custom time)
  _valueD = value;

  if (unit.length() <= 10) {
    _unit = unit;
  } else {
    _unit = "too long";
  }

  if (location.length() <= 30) {
    _location = location;
  } else {
    _location = "too long";
  }

  if (measurand.length() <= 15) {
    _measurand = measurand;
  } else {
    _measurand = "too long";
  }

  if (sensor.length() <= 10) {
    _sensor = sensor;
  } else {
    _sensor = "too long";
  }

  _time = time;

}


MintValue::MintValue(String value, String unit, String location, String measurand, String sensor, long time) {

  _option[0] = B00000110;  // The first six bits encode the LoRaMINT protocol number (000001 -> first version).
                           // The last two bits indicate that it is a measured value. (10 -> measured value)
  _option[1] = B00011010;  // The first six bits encode the datatype of the value. (000110 -> String)
                           // The last two bits indicate that there is no time information. (10 -> custom time)

  if (value.length() <= 20) {
    _valueS = value;
  } else {
    _valueS = value.substring(0, 20);
  }

  if (unit.length() <= 10) {
    _unit = unit;
  } else {
    _unit = "too long";
  }

  if (location.length() <= 30) {
    _location = location;
  } else {
    _location = "too long";
  }

  if (measurand.length() <= 15) {
    _measurand = measurand;
  } else {
    _measurand = "too long";
  }

  if (sensor.length() <= 10) {
    _sensor = sensor;
  } else {
    _sensor = "too long";
  }

  _time = time;

}




void MintValue::toBytes(byte* buffer) {


  int index = 0;  // Index of buffer array

  // the LoRaMINT - message header
  buffer[0] = _option[0];
  buffer[1] = _option[1];
  index = 2;

  // encode the value
  byte datatype = _option[1] >> 2;

  switch (datatype) {
    case 1:  // byte
      buffer[index++] = _valueB;
      break;
    case 2:  // int
      buffer[index++] = _valueI >> 8;
      buffer[index++] = _valueI;
      break;
    case 3:  // long
      buffer[index++] = _valueL >> 24;
      buffer[index++] = _valueL >> 16;
      buffer[index++] = _valueL >> 8;
      buffer[index++] = _valueL;
      break;
    case 4:  // float
      union {
        float floatBuffer[1];
        byte byteBuffer[sizeof(float)];
      };
      floatBuffer[0] = _valueF;
      for (int i = sizeof(byteBuffer) - 1; i >= 0; i--) {
        buffer[index++] = byteBuffer[i];
      }
      break;
    case 5:  // double
      union {
        double doubleBuffer[1];
        byte byteBufferD[sizeof(double)];
      };
      doubleBuffer[0] = _valueD;
      for (int i = sizeof(byteBufferD) - 1; i >= 0; i--) {
        buffer[index++] = byteBufferD[i];
      }
      break;
    case 6:  // String
      for (int i = 0; i < _valueS.length(); i++) {
        buffer[index++] = (byte) _valueS.charAt(i);
      }
      break;
    default:
      return;
  }

  buffer[index++] = dataseparator;

  // encode the unit of the value
  for (int i = 0; i < _unit.length(); i++, index++) {
    buffer[index] = (byte)_unit.charAt(i);  // transfer ASCII characters
  }
  buffer[index++] = dataseparator;  // separator

  // encode the measurand
  for (int i = 0; i < _measurand.length(); i++, index++) {
    buffer[index] = (byte)_measurand.charAt(i);  // transfer ASCII characters
  }
  buffer[index++] = dataseparator;  // separator

  // encode the location
  for (int i = 0; i < _location.length(); i++, index++) {
    buffer[index] = (byte)_location.charAt(i);  // transfer ASCII characters
  }
  buffer[index++] = dataseparator;  // separator


  // encode the sensor information
  for (int i = 0; i < _sensor.length(); i++, index++) {
    buffer[index] = (byte)_sensor.charAt(i);  // transfer ASCII characters
  }
  buffer[index++] = dataseparator;  // separator



  if(byte(_option[1]<<6) == B10000000){
      buffer[index++] = _time >> 24;
      buffer[index++] = _time >> 16;
      buffer[index++] = _time >> 8;
      buffer[index++] = _time;
  }

  while(index<maxMessageSize){
    buffer[index++] = (byte) 0;
  }



}


String MintValue::toByteString() {

  byte arr[maxMessageSize];
  toBytes(arr);

  String out = "";
  for(int i = 0; i < maxMessageSize;i++){
    out += byteToHex(arr[i]);
  }
  return out;
}



String MintValue::byteToHex(byte value){

  byte digit1 = value % 16;
  byte digit2 = (value - digit1)/16;

  return hexToString(digit2) + hexToString(digit1);

}

String MintValue::hexToString(byte value){
  const char hexChars[] = "0123456789ABCDEF";
  if (value < 16) {
    return String(hexChars[value]);
  }
  return "0";
}
