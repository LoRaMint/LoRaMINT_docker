/***************************************************************************
  This sketch is part of the LoRaMINT-library. It's designed for the bme280 
  humidity, temperature & pressure sensor. It measures the temperature and 
  sends the measured value to the database via the measurement network.
 
  This sketch is inspired by a example of the Adafruit BME 280 library.

  Adafruit invests time and resources providing this open source code,
  please support Adafruit andopen-source hardware by purchasing products
  from Adafruit!
  
  Designed specifically to work with the Adafruit BME280 Breakout
  ----> http://www.adafruit.com/products/2650

  Modiefied by Matthias Ruf for the LoRaMINT measurment system. 

  Original code written by Limor Fried & Kevin Townsend for Adafruit Industries.
  BSD license, all text above must be included in any redistribution
  See the LICENSE file for details.
 ***************************************************************************/

#include <Wire.h>
#include <SPI.h>
#include <Adafruit_Sensor.h>
#include <Adafruit_BME280.h>
#include "LoRaMINT.h"
#include "MintValue.h"

#define BME_SCK 13
#define BME_MISO 12
#define BME_MOSI 11
#define BME_CS 10

#define SEALEVELPRESSURE_HPA (1013.25)



LoRaMINT loramint = LoRaMINT();

Adafruit_BME280 bme;



unsigned long delayTime;

void setup() {
    Serial.begin(9600);
    while(!Serial);    // time to get serial running
    Serial.println(F("BME280 Temperature"));

    unsigned status;  
    status = bme.begin(0x76);

    if (!status) {
        Serial.println("Could not find a valid BME280 sensor, check wiring, address, sensor ID!");
        Serial.print("SensorID was: 0x"); Serial.println(bme.sensorID(),16);
        Serial.print("        ID of 0xFF probably means a bad address, a BMP 180 or BMP 085\n");
        Serial.print("   ID of 0x56-0x58 represents a BMP 280,\n");
        Serial.print("        ID of 0x60 represents a BME 280.\n");
        Serial.print("        ID of 0x61 represents a BME 680.\n");
        while (1) delay(10);
    }
    
    Serial.println("-- Send Temperature Example --");
}


void loop() { 

  float temperature = bme.readTemperature();
  
  MintValue value = MintValue(temperature,"*C","Ort","Temperatur","BME 280");
  loramint.sendValue(value);
  delay(20000); // 20 seconds delay between two messages 

}

