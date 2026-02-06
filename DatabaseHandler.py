# "pip3 install psycopg2-binary" necessary
import logging

import psycopg2

import MintValue

logger = logging.getLogger(__name__)


class DatabaseHandler(object):
    # Creates a database handler object and connects directly to the database
    def __init__(self, username, password, host, port, database):
        try:
            self.connection = psycopg2.connect(
                user=username,
                password=password,
                host=host,
                port=port,
                dbname=database,
            )
            self.cursor = self.connection.cursor()
            self.established = True
            logger.debug(f"Connected to database {database} at {host}:{port}")

        except psycopg2.Error as e:
            logger.error(f"Failed to connect to database: {e}")
            self.established = False

    def run_migrations(self):
        """Runs idempotent database migrations (creates tables if not exist)."""
        if not self.established:
            logger.error("Cannot run migrations: database connection not established")
            return False

        logger.info("Running database migrations...")

        migrations = [
            """
            CREATE TABLE IF NOT EXISTS measured_value(
                uuid VARCHAR(36) NOT NULL PRIMARY KEY,
                geraete_id VARCHAR(16) NOT NULL,
                groesse VARCHAR(40) NOT NULL,
                einheit VARCHAR(40) NOT NULL,
                datentyp VARCHAR(10) NOT NULL CHECK (datentyp IN ('float', 'integer', 'string')),
                sensor VARCHAR(40) NOT NULL,
                ort VARCHAR(40) NOT NULL,
                zeitmethode VARCHAR(10) NOT NULL CHECK (zeitmethode IN ('custom', 'server', 'none')),
                unix_time INT
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS LogNachricht(
                uuid VARCHAR(36) NOT NULL PRIMARY KEY,
                geraete_id VARCHAR(16) NOT NULL,
                message VARCHAR(200) NOT NULL,
                unix_time INT
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS IntegerValue(
                uuid VARCHAR(36) NOT NULL PRIMARY KEY REFERENCES measured_value(uuid) ON DELETE CASCADE,
                value INT NOT NULL
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS FloatValue(
                uuid VARCHAR(36) NOT NULL PRIMARY KEY REFERENCES measured_value(uuid) ON DELETE CASCADE,
                value FLOAT NOT NULL
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS StringValue(
                uuid VARCHAR(36) NOT NULL PRIMARY KEY REFERENCES measured_value(uuid) ON DELETE CASCADE,
                value VARCHAR(20) NOT NULL
            )
            """,
        ]

        try:
            for i, migration in enumerate(migrations, 1):
                self.cursor.execute(migration)
                logger.debug(f"Migration {i}/{len(migrations)} executed")
            self.connection.commit()
            logger.info("Database migrations completed successfully")
            return True
        except psycopg2.Error as e:
            logger.error(f"Error running migrations: {e}")
            self.connection.rollback()
            return False

    def get_uuid(self):
        try:
            self.cursor.execute("SELECT gen_random_uuid()::text;")
            uuid = self.cursor.fetchone()[0]
            logger.debug(f"Generated UUID: {uuid}")
            return uuid
        except psycopg2.Error as e:
            logger.error(f"Error generating UUID: {e}")
            return None

    def store_value(self, value: MintValue):
        uuid = self.get_uuid()

        if uuid is None:
            logger.error("Cannot store value: UUID generation failed")
            return

        try:
            statement = """INSERT INTO measured_value(uuid,geraete_id,groesse,einheit,datentyp,sensor,ort,zeitmethode,unix_time)
                          VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s);"""
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
                statement = "INSERT INTO FloatValue(uuid,value) VALUES (%s, %s);"
            elif value.get_datatype() == "integer":
                statement = "INSERT INTO IntegerValue(uuid,value) VALUES (%s, %s);"
            else:
                statement = "INSERT INTO StringValue(uuid,value) VALUES (%s, %s);"

            data = (uuid, value.get_value())
            self.cursor.execute(statement, data)
            self.connection.commit()

            logger.debug(f"Stored value with UUID {uuid}")

        except psycopg2.Error as e:
            logger.error(f"Error storing value: {e}")
            self.connection.rollback()

    def store_log(self, message, time, device_eui):
        uuid = self.get_uuid()

        if uuid is None:
            logger.error("Cannot store log: UUID generation failed")
            return

        try:
            statement = "INSERT INTO LogNachricht(uuid, geraete_id, unix_time, message) VALUES (%s, %s, %s, %s);"
            data = (uuid, device_eui, time, message)
            self.cursor.execute(statement, data)
            self.connection.commit()

            logger.debug(f"Stored log with UUID {uuid}")

        except psycopg2.Error as e:
            logger.error(f"Error storing log: {e}")
            self.connection.rollback()

    def close(self):
        try:
            self.cursor.close()
            self.connection.close()
            logger.debug("Database connection closed")
        except psycopg2.Error as e:
            logger.error(f"Error closing connection: {e}")
