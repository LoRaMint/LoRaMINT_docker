# "pip3 install mysql-connector-python" necessary
import MintValue
import mysql.connector as sql_con


class DatabaseHandler(object):
    # Creates a database handler object and connects directly to the database
    def __init__(self, username, password, host, port, database):
        try:
            self.connection = sql_con.connect(
                user=username,
                password=password,
                host=host,
                port=port,
                database=database,
            )
            self.cursor = self.connection.cursor(prepared=True)
            self.established = True

        except sql_con.Error:
            self.established = False

    # Sends the measured value to the database

    def get_uuid(self):
        try:
            statement = "SELECT UUID();"
            self.cursor.execute(statement)

            return self.cursor.fetchone()[0]
        except sql_con.Error as e:
            print("mysql.connector.Error in methode get_uuid" + str(e))

        return None

    def store_value(self, value: MintValue):
        uuid = self.get_uuid()

        if uuid is None:
            return

        try:
            statement = "INSERT INTO measured_value(uuid,geraete_id,groesse,einheit,datentyp,sensor,ort,zeitmethode,unix_time) VALUE (%s, %s, %s, %s, %s, %s, %s, %s, %s);"
            data = (
                uuid,
                value.get_device_eui(),
                value.get_measurand(),
                value.get_unit(),
                value.get_datatype(),
                value.get_sensor(),
                value.get_location(),
                value.get_timemethode(),
                value.get_unixtime(),
            )
            self.cursor.execute(statement, data)

            if value.get_datatype() == "float":
                statement = "INSERT INTO FloatValue(uuid,value) VALUE (%s, %s);"

            elif value.get_datatype() == "integer":
                statement = "INSERT INTO IntegerValue(uuid,value) VALUE (%s, %s);"
            else:
                statement = "INSERT INTO StringValue(uuid,value) VALUE (%s, %s);"

            data = (uuid, value.get_value())
            self.cursor.execute(statement, data)
            self.connection.commit()

        except sql_con.Error as e:
            print("mysql.connector.Error in methode store_value: " + str(e))

        print(value)

    # Sends log messages to the database

    def store_log(self, message, time, device_eui):
        uuid = self.get_uuid()

        if uuid is None:
            return

        try:
            statement = "INSERT INTO LogNachricht(uuid, geraete_id, unix_time, message) VALUE (%s, %s, %s, %s);"
            data = (uuid, device_eui, time, message)
            self.cursor.execute(statement, data)
            self.connection.commit()

        except sql_con.Error as e:
            print("mysql.connector.Error in methode store_log: " + str(e))

    # closes the connection to the database
    def close(self):
        try:
            self.connection.close()
        except sql_con.Error as e:
            print(e)
