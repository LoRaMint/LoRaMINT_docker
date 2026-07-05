"""
MintValue - describes a single measurement value and encodes it according to the
LoRaMINT message protocol (version 1). MicroPython port of the Arduino MintValue
class.

Wire format of an encoded value (always padded to 99 bytes):

    byte 0        _option[0] = 0x06  (protocol v1 + "measured value")
    byte 1        _option[1] = (datatype << 2) | timeflag
    bytes ...     value (big-endian; 1/2/4 bytes or ASCII for strings)
    0x1E          record separator
    unit  0x1E  measurand  0x1E  location  0x1E  sensor  0x1E
    [4 bytes]     Unix time, big-endian (only if a custom time is given)
    0x00 ...      zero padding up to 99 bytes

Note the field order on the wire is unit, measurand, location, sensor - the
constructor takes them in the Arduino order (unit, location, measurand, sensor)
and to_bytes() reorders them to match the TTN payload formatter.
"""

import struct

import ubinascii


class MintValue:
    # datatype -> encoded value (matches _option[1] >> 2 in the protocol)
    DATATYPES = {
        "byte": 1,
        "int": 2,
        "long": 3,
        "float": 4,
        "double": 5,
        "string": 6,
    }

    TIME_SERVER = 1        # 01 -> timestamp added by the server
    TIME_CUSTOM = 2        # 10 -> custom Unix timestamp included in the payload

    PROTOCOL_OPTION = 0x06  # _option[0]: protocol v1 (000001) + measured value (10)
    DATA_SEPARATOR = 0x1E   # ASCII record separator
    MAX_MESSAGE_SIZE = 99

    # field length limits (matching the Arduino constructors)
    MAX_UNIT = 10
    MAX_LOCATION = 30
    MAX_MEASURAND = 15
    MAX_SENSOR = 10
    MAX_STRING_VALUE = 20

    def __init__(self, value, unit, location, measurand, sensor,
                 datatype=None, time=None):
        """
        Create a measurement value.

        `datatype` is one of DATATYPES ("byte", "int", "long", "float",
        "double", "string"). If omitted it is inferred from `value`
        (str -> string, float -> float, int -> long).

        `time` is an optional Unix timestamp (int); if given, it is embedded in
        the payload and the server uses it instead of its own receive time.
        """
        datatype = (datatype or self._infer_datatype(value)).lower()
        if datatype not in self.DATATYPES:
            raise ValueError("unknown datatype: " + datatype)

        self._datatype = datatype
        if datatype == "string":
            self._value = str(value)[:self.MAX_STRING_VALUE]
        else:
            self._value = value

        self._unit = self._fit(unit, self.MAX_UNIT)
        self._location = self._fit(location, self.MAX_LOCATION)
        self._measurand = self._fit(measurand, self.MAX_MEASURAND)
        self._sensor = self._fit(sensor, self.MAX_SENSOR)
        self._time = time

    # ------------------------------------------------------------------ #
    # Encoding
    # ------------------------------------------------------------------ #

    def to_bytes(self):
        """Return the 99-byte payload for this value."""
        time_flag = self.TIME_CUSTOM if self._time is not None else self.TIME_SERVER
        option1 = (self.DATATYPES[self._datatype] << 2) | time_flag

        buffer = bytearray()
        buffer.append(self.PROTOCOL_OPTION)   # _option[0]
        buffer.append(option1)                # _option[1]
        buffer += self._encode_value()
        buffer.append(self.DATA_SEPARATOR)

        # wire order: unit, measurand, location, sensor
        # "replace" keeps non-ASCII input from raising (it becomes "?") - the
        # protocol only carries ASCII.
        for field in (self._unit, self._measurand, self._location, self._sensor):
            buffer += field.encode("ascii", "replace")
            buffer.append(self.DATA_SEPARATOR)

        if self._time is not None:
            t = self._time & 0xFFFFFFFF
            buffer += bytes([(t >> 24) & 0xFF, (t >> 16) & 0xFF,
                             (t >> 8) & 0xFF, t & 0xFF])

        if len(buffer) > self.MAX_MESSAGE_SIZE:
            raise ValueError(
                "encoded message exceeds {} bytes".format(self.MAX_MESSAGE_SIZE)
            )
        buffer += bytes(self.MAX_MESSAGE_SIZE - len(buffer))  # zero padding
        return bytes(buffer)

    def to_byte_string(self):
        """Return the payload as an uppercase hex string (99 bytes -> 198 chars)."""
        return ubinascii.hexlify(self.to_bytes()).decode().upper()

    # ------------------------------------------------------------------ #
    # Helpers
    # ------------------------------------------------------------------ #

    def _encode_value(self):
        """Encode just the value bytes, big-endian, per datatype."""
        datatype = self._datatype
        value = self._value

        if datatype == "byte":
            return bytes([value & 0xFF])
        if datatype == "int":
            return bytes([(value >> 8) & 0xFF, value & 0xFF])
        if datatype == "long":
            return bytes([(value >> 24) & 0xFF, (value >> 16) & 0xFF,
                          (value >> 8) & 0xFF, value & 0xFF])
        if datatype in ("float", "double"):
            # The Arduino/AVR build encodes both as a 4-byte big-endian
            # IEEE-754 single, which is what the payload formatter decodes.
            return struct.pack(">f", float(value))
        if datatype == "string":
            return value.encode("ascii", "replace")
        raise ValueError("unknown datatype: " + datatype)

    @staticmethod
    def _fit(text, max_len):
        """Return text, or "too long" if it exceeds max_len (Arduino behaviour)."""
        return text if len(text) <= max_len else "too long"

    @staticmethod
    def _infer_datatype(value):
        if isinstance(value, str):
            return "string"
        if isinstance(value, float):
            return "float"
        if isinstance(value, int):
            return "long"
        raise ValueError("cannot infer datatype for value: " + repr(value))
