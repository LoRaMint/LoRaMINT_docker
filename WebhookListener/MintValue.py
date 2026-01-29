from dataclasses import dataclass, field
from datetime import datetime
from typing import Union, Optional
import json


@dataclass(frozen=True)
class MintValue:
    """
    Repräsentiert einen Messwert aus einem TTN-Webhook Payload.
    
    Diese Klasse ist unveränderlich nach der Initialisierung und validiert alle Eingaben beim Erstellen des Objekts.
    
    Attributes:
        datatype (str): Der Datentyp des Messwerts ("integer", "float", "string").
        location (str): Der Standort wo die Messung durchgeführt wurde.
        measurand (str): Die Art der Messung (z.B. Temperatur, Luftfeuchtigkeit).
        sensor (str): Der verwendete Sensor für die Messung.
        unit (str): Die Einheit des Messwerts (z.B. "Celsius", "Prozent").
        value (Union[int, float, str]): Der tatsächliche Messwert.
        time_methode (str): Die verwendete Zeitstempel-Methode.
        unixtime (Optional[int]): Der Unix-Zeitstempel der Messung.
        dev_eui (str): Die Geräte-EUI des messenden Geräts.
    """
    
    datatype: str = field()
    location: str = field()
    measurand: str = field()
    sensor: str = field()
    unit: str = field()
    value: Union[int, float, str] = field()
    time_methode: str = field()
    unixtime: Optional[int] = field()
    dev_eui: str = field()
    
    # Konstanten für Validierung
    VALID_DATATYPES = {"integer", "float", "string"}
    VALID_TIME_METHODS = {"server", "custom", "none", "device"}  # device für Backward-Kompatibilität
    
    def __post_init__(self):
        """Validierung nach der Initialisierung durch dataclass."""
        # Datatype validierung und normalisierung
        if not isinstance(self.datatype, str):
            raise TypeError(f"datatype muss ein String sein, erhalten: {type(self.datatype)}")
        
        normalized_datatype = self.datatype.lower()
        if normalized_datatype not in self.VALID_DATATYPES:
            raise ValueError(f"datatype muss einer von {self.VALID_DATATYPES} sein, erhalten: {self.datatype}")
        
        # datatype normalisieren (frozen=True erfordert object.__setattr__)
        object.__setattr__(self, 'datatype', normalized_datatype)
        
        # Value validierung und konvertierung basierend auf datatype
        converted_value = self._convert_and_validate_value(normalized_datatype, self.value)
        object.__setattr__(self, 'value', converted_value)
        
        # String-Felder validierung
        self._validate_string_field('location', self.location, max_length=40)
        self._validate_string_field('measurand', self.measurand, max_length=40)
        self._validate_string_field('sensor', self.sensor, max_length=40)
        self._validate_string_field('unit', self.unit, max_length=40)
        self._validate_string_field('dev_eui', self.dev_eui, max_length=16, min_length=16)
        
        # dev_eui spezifische Validierung (16 Hex-Zeichen)
        if not all(c in '0123456789ABCDEFabcdef' for c in self.dev_eui):
            raise ValueError("dev_eui muss 16 Hex-Zeichen enthalten")
        
        # time_methode validierung
        if not isinstance(self.time_methode, str):
            raise TypeError(f"time_methode muss ein String sein, erhalten: {type(self.time_methode)}")
            
        if self.time_methode not in self.VALID_TIME_METHODS:
            raise ValueError(f"time_methode muss einer von {self.VALID_TIME_METHODS} sein, erhalten: {self.time_methode}")
        
        # unixtime validierung
        if self.time_methode == "none":
            if self.unixtime is not None:
                raise ValueError("unixtime muss None sein wenn time_methode = 'none'")
        else:
            if self.unixtime is None:
                raise ValueError(f"unixtime ist erforderlich wenn time_methode = '{self.time_methode}'")
            if not isinstance(self.unixtime, int) or self.unixtime < 0:
                raise ValueError("unixtime muss eine positive Ganzzahl sein")
    
    def _validate_string_field(self, field_name: str, value: str, max_length: int, min_length: int = 1):
        """Validiert String-Felder."""
        if not isinstance(value, str):
            raise TypeError(f"{field_name} muss ein String sein, erhalten: {type(value)}")
        if len(value.strip()) < min_length:
            raise ValueError(f"{field_name} darf nicht leer sein")
        if len(value) > max_length:
            raise ValueError(f"{field_name} darf maximal {max_length} Zeichen haben, erhalten: {len(value)}")
    
    def _convert_and_validate_value(self, datatype: str, value: Union[int, float, str]) -> Union[int, float, str]:
        """Konvertiert und validiert den Messwert basierend auf dem Datentyp."""
        try:
            if datatype == "integer":
                return int(float(value))  # Erlaubt "123.0" -> 123
            elif datatype == "float":
                return float(value)
            else:  # string
                if not isinstance(value, str):
                    value = str(value)
                if len(value) > 20:  # DB-Constraint
                    raise ValueError("String-Wert darf maximal 20 Zeichen haben")
                return value
        except (ValueError, TypeError) as e:
            raise ValueError(f"Kann Wert '{value}' nicht zu {datatype} konvertieren: {e}")
    
    def to_dict(self) -> dict:
        """Konvertiert das MintValue Objekt zu einem Dictionary."""
        return {
            'device_eui': self.dev_eui,
            'datatype': self.datatype,
            'location': self.location,
            'measurand': self.measurand,
            'sensor': self.sensor,
            'unit': self.unit,
            'value': self.value,
            'time_methode': self.time_methode,
            'unixtime': self.unixtime,
            'timestring': self.get_timestring()
        }
    
    def to_json(self) -> str:
        """Serialisiert das MintValue Objekt zu JSON."""
        return json.dumps(self.to_dict(), ensure_ascii=False, indent=2)
    
    @classmethod
    def from_dict(cls, data: dict) -> 'MintValue':
        """Erstellt ein MintValue Objekt aus einem Dictionary."""
        return cls(
            datatype=data['datatype'],
            location=data['location'],
            measurand=data['measurand'],
            sensor=data['sensor'],
            unit=data['unit'],
            value=data['value'],
            time_methode=data['time_methode'],
            unixtime=data['unixtime'],
            dev_eui=data['device_eui']
        )
    
    @classmethod
    def from_json(cls, json_str: str) -> 'MintValue':
        """Erstellt ein MintValue Objekt aus einem JSON String."""
        return cls.from_dict(json.loads(json_str))
    
    # Backward-Kompatibilitäts-Methoden
    def get_location(self) -> str:
        return self.location

    def get_measurand(self) -> str:
        return self.measurand

    def get_sensor(self) -> str:
        return self.sensor

    def get_unit(self) -> str:
        return self.unit

    def get_value(self) -> Union[int, float, str]:
        return self.value

    def get_datatype(self) -> str:
        return self.datatype

    def get_timemethode(self) -> str:
        return self.time_methode

    def get_unixtime(self) -> Optional[int]:
        return self.unixtime

    def get_timestring(self) -> Optional[str]:
        """Gibt einen lesbaren Zeitstring zurück oder None."""
        if self.time_methode == "none" or self.unixtime is None:
            return None
        return str(datetime.fromtimestamp(self.unixtime))

    def get_device_eui(self) -> str:
        return self.dev_eui
    
    def __eq__(self, other: object) -> bool:
        """Gleichheitsvergleich basierend auf allen relevanten Attributen."""
        if not isinstance(other, MintValue):
            return NotImplemented
        return (
            self.dev_eui == other.dev_eui and
            self.datatype == other.datatype and
            self.location == other.location and
            self.measurand == other.measurand and
            self.sensor == other.sensor and
            self.unit == other.unit and
            self.value == other.value and
            self.time_methode == other.time_methode and
            self.unixtime == other.unixtime
        )
    
    def __hash__(self) -> int:
        """Hash basierend auf unveränderlichen Attributen."""
        return hash((
            self.dev_eui, 
            self.datatype, 
            self.location, 
            self.measurand,
            self.sensor, 
            self.unit, 
            self.value, 
            self.time_methode, 
            self.unixtime
        ))
    
    def __repr__(self) -> str:
        """Entwickler-freundliche Darstellung."""
        return (f"MintValue(datatype='{self.datatype}', location='{self.location}', "
                f"measurand='{self.measurand}', sensor='{self.sensor}', "
                f"unit='{self.unit}', value={self.value!r}, "
                f"time_methode='{self.time_methode}', unixtime={self.unixtime}, "
                f"dev_eui='{self.dev_eui}')")
    
    def __str__(self) -> str:
        """Benutzer-freundliche Darstellung."""
        return (f"MintValue: \\n\\tdevice: {self.dev_eui} \\n\\t{self.measurand}-value: {self.value} {self.unit} "
                f"\\n\\tsensor: {self.sensor} \\n\\tlocation {self.location} \\n\\tdatatype: {self.datatype} "
                f"\\n\\ttimemethode: {self.time_methode}\\n\\ttime: \\t unix: {self.unixtime} "
                f"\\n\\t\\t\\t read: {self.get_timestring()}")