/*
 * decodes ttn uplink message as provided by the LoRaMINT message protocol version one.
 */
function decodeUplink(input) {

  var result;

  if(input.bytes[0] == 0x05){
    result = decodeLogMessage(input);
  }else{
    result = decodeValue(input);
  }

  return {data: result,  warnings: [], errors: []};

}


/*
 * decodes log messages
 */
function decodeLogMessage(input){

    messagetyp = "LogEintrag";
    message = "";
    for (var i = 1; i < input.bytes.length; i++) {
      message += String.fromCharCode(input.bytes[i]);
    }

    return { messagetyp: messagetyp, message: message};

}


/*
 * decodes values
 */
function decodeValue(input){

    messagetyp = "Messwert";

    var timemethode = input.bytes[1] & 0x3;
    if(timemethode == 0){
      timemethode = "none";
    }else if(timemethode == 1){
      timemethode = "server";
    }else if(timemethode == 2){
      timemethode = "custom"
    }else{
      timemethode = "none"
    }



    var index = 2

    var datatype_enc = input.bytes[1] >> 2;
    var value = 2;

    switch(datatype_enc) {
      case 1: // byte
        value = input.bytes[index++]
        datatype = "integer";
        break;
      case 2: // int
        value = (input.bytes[index] << 8)+ input.bytes[index+1];
        index+=2;
        datatype = "integer";
        break;
      case 3: // long
        value = (input.bytes[index] << 24)+ (input.bytes[index+1] << 16)+ (input.bytes[index+2] << 8) +input.bytes[index+3];
        index+=4;
        datatype = "integer";
        break;
      case 4: // float
        var arr =[];
        while(index <  6){
          arr.push(input.bytes[index++]);
        }
        value = decodeFloat(arr ,1,8,23,-126,127,false);
        datatype = "float";
        break;
      case 5: // double
        var arr =[];
        while(index <  6){
          arr.push(input.bytes[index++]);
        }
        value = decodeFloat(arr ,1,8,23,-126,127,false);
        datatype = "float";
        break;
      case 6: // String
        value = "";
        while(index < input.bytes.length&&input.bytes[index]!=30){
          value += String.fromCharCode(input.bytes[index++]);
        }
        datatype = "String";
        break;
      default:
        // code block
    }

    index++; // sets the index to the byte after the data separator

    var unit = "";
    while(index < input.bytes.length&&input.bytes[index]!=30){
          unit += String.fromCharCode(input.bytes[index++]);
    }

    index++; // sets the index to the byte after the data separator

    var measurand = "";
    while(index < input.bytes.length&&input.bytes[index]!=30){
          measurand += String.fromCharCode(input.bytes[index++]);
    }

    index++; // sets the index to the byte after the data separator

    var location = "";
    while(index < input.bytes.length&&input.bytes[index]!=30){
          location += String.fromCharCode(input.bytes[index++]);
    }

    index++;

    var sensor = "";
    while(index < input.bytes.length&&input.bytes[index]!=30){
          sensor += String.fromCharCode(input.bytes[index++]);
    }
    index++;

    if(timemethode == "custom"){
      var timevalue = (input.bytes[index] << 24)+ (input.bytes[index+1] << 16)+ (input.bytes[index+2] << 8) +input.bytes[index+3];
      index+=4;
      return {messagetyp: messagetyp, value: value, unit: unit, measurand: measurand, location: location,
      sensor: sensor, datatype: datatype, timemethode: timemethode,timevalue: timevalue};
    }
    return {messagetyp: messagetyp, value: value, unit: unit, measurand: measurand, location: location, sensor: sensor, datatype: datatype, timemethode: timemethode};

}






/*
 *
 * decodes floating point numbers according to the ieee 754 standard. Source: https://gist.github.com/kg/2192799
 *
 */
function decodeFloat(bytes, signBits, exponentBits, fractionBits, eMin, eMax, littleEndian) {
  var totalBits = (signBits + exponentBits + fractionBits);

  var binary = "";
  for (var i = 0, l = bytes.length; i < l; i++) {
    var bits = bytes[i].toString(2);
    while (bits.length < 8)
      bits = "0" + bits;

    if (littleEndian)
      binary = bits + binary;
    else
      binary += bits;
  }

  var sign = (binary.charAt(0) == '1')?-1:1;
  var exponent = parseInt(binary.substr(signBits, exponentBits), 2) - eMax;
  var significandBase = binary.substr(signBits + exponentBits, fractionBits);
  var significandBin = '1'+significandBase;
  var i = 0;
  var val = 1;
  var significand = 0;

  if (exponent == -eMax) {
      if (significandBase.indexOf('1') == -1)
          return 0;
      else {
          exponent = eMin;
          significandBin = '0'+significandBase;
      }
  }

  while (i < significandBin.length) {
      significand += val * parseInt(significandBin.charAt(i));
      val = val / 2;
      i++;
  }

  return sign * significand * Math.pow(2, exponent);
}
