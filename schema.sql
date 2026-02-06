Create table measured_value(
uuid varchar(36) NOT NULL PRIMARY KEY,
geraete_id VARCHAR(16) NOT NULL,
groesse VARCHAR(40) NOT NULL,
einheit VARCHAR(40) NOT NULL,
datentyp ENUM ('float', 'integer', 'string') NOT NULL,
sensor VARCHAR(40) NOT NULL,
ort VARCHAR(40) NOT NULL,
zeitmethode ENUM('custom','server','none') NOT NULL,
unix_time INT
);

Create table LogNachricht(
uuid varchar(36) NOT NULL PRIMARY KEY,
geraete_id VARCHAR(16) NOT NULL,
message VARCHAR(200) NOT NULL,
unix_time INT
);

CREATE TABLE IntegerValue(
uuid varchar(36) NOT NULL PRIMARY KEY REFERENCES measured_value(uuid) ON DELETE CASCADE,
value INT NOT NULL
);

CREATE TABLE FloatValue(
uuid varchar(36) NOT NULL PRIMARY KEY REFERENCES measured_value(uuid) ON DELETE CASCADE,
value FLOAT NOT NULL
);

CREATE TABLE StringValue(
uuid varchar(36) NOT NULL PRIMARY KEY REFERENCES measured_value(uuid) ON DELETE CASCADE,
value VARCHAR(20) NOT NULL
);
