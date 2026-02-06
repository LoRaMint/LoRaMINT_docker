# python classes
import json
import logging
import os
import sys
import time

# "pip install webhook_listener" necessary
import webhook_listener

# Load .env file for local development
from dotenv import load_dotenv

load_dotenv()

from DatabaseHandler import DatabaseHandler

# self written classes
from MintValue import MintValue

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger(__name__)


# The class webhook handles incoming webhook messages. It uses environment variables for configuration.
class Webhook(object):
    # Instantiates a webhook object and starts the webhook listener
    def __init__(self):
        logger.info("Initializing WebhookListener...")

        # read configuration from environment variables
        self.password = os.environ.get("DB_PASSWORD", "")
        self.username = os.environ.get("DB_USERNAME", "")
        self.db_host = os.environ.get("DB_HOST", "localhost")
        self.db_port = int(os.environ.get("DB_PORT", "3306"))
        self.app_key = os.environ.get("APP_KEY", "")
        self.ip = os.environ.get("WEBHOOK_HOST", "0.0.0.0")
        self.database = os.environ.get("DB_DATABASE", "")

        logger.info(f"Database host: {self.db_host}:{self.db_port}")
        logger.info(f"Database name: {self.database}")
        logger.info(f"Webhook host: {self.ip}")

        if (
            not self.password
            or not self.username
            or not self.database
            or not self.app_key
        ):
            logger.error(
                "Missing required environment variables (DB_PASSWORD, DB_USERNAME, DB_DATABASE, APP_KEY)"
            )
            self.listen = False
            return

        # Run database migrations on startup
        logger.info("Connecting to database...")
        db = DatabaseHandler(
            self.username,
            self.password,
            self.db_host,
            self.db_port,
            self.database,
        )
        if db.established:
            logger.info("Database connection established")
            db.run_migrations()
            db.close()
        else:
            logger.warning("Could not connect to database - migrations skipped")

        # everything works fine -> start the listener
        self.listen = True
        logger.info(f"Starting webhook listener on {self.ip}:8090...")
        webhooks = webhook_listener.Listener(
            handlers={"POST": self.process_post_request}
        )
        webhooks.host = self.ip
        webhooks.start()
        logger.info("Webhook listener started successfully")

    # Handles incoming messages. Is called up automatically as soon as a message is received.
    def process_post_request(self, request, *args, **kwargs):
        logger.info("Received POST request")
        try:
            # --- check the application key ---
            request_appkey = request.headers.get("X-Downlink-Apikey")
            if request_appkey is None:
                logger.warning("Request rejected: missing application key")
                return
            elif request.headers.get("X-Downlink-Apikey") != self.app_key:
                logger.warning(f"Request rejected: invalid application key")
                return

            logger.debug("Application key validated")

            # --- read the request body ---
            try:
                if int(request.headers.get("Content-Length", 0)) > 0:
                    message_body = str(
                        request.body.read(int(request.headers["Content-Length"]))
                    )
                else:
                    logger.warning("Request rejected: content-length is 0")
                    return
            except ValueError:
                logger.warning("Request rejected: non-numeric content-length")
                return

            # --- parse the request body ---
            json_body = json.loads(
                message_body[2 : len(message_body) - 1]
            )  # body of the message starts with "b`" and remaining part is json

            payload = json_body["uplink_message"]["decoded_payload"]
            dev_eui = json_body["end_device_ids"]["dev_eui"]

            logger.info(f"Processing message from device {dev_eui}")

            # --- Determine attributes from the payload section ---

            if payload["messagetyp"] == "Messwert":
                datatype = payload["datatype"]
                location = payload["location"]
                measurand = payload["measurand"]
                sensor = payload["sensor"]
                unit = payload["unit"]
                value = payload["value"]
                time_methode = payload["timemethode"]

                if time_methode == "server":
                    time_value = int(time.time())
                elif time_methode == "none":
                    time_value = None
                elif time_methode == "custom":
                    try:
                        time_value = int(payload["timevalue"])
                    except ValueError:
                        logger.error(f"Invalid timestamp value for device {dev_eui}")
                        return
                else:
                    logger.error(
                        f"Unsupported time format '{time_methode}' for device {dev_eui}"
                    )
                    return

                # --- create a MintValue object
                mint_value = MintValue(
                    datatype,
                    location,
                    measurand,
                    sensor,
                    unit,
                    value,
                    time_methode,
                    time_value,
                    dev_eui,
                )

                logger.info(f"Messwert: {measurand}={value}{unit} from {dev_eui}")

                # --- store the value object into the database
                db = DatabaseHandler(
                    self.username,
                    self.password,
                    self.db_host,
                    self.db_port,
                    self.database,
                )
                if db.established:
                    db.store_value(mint_value)
                    db.close()
                    logger.info(f"Messwert stored successfully")
                else:
                    logger.error("Failed to connect to database for storing value")
                    return

            elif payload["messagetyp"] == "LogEintrag":
                message = payload["message"]
                time_unix = int(time.time())

                logger.info(f"LogEintrag from {dev_eui}: {message}")

                db = DatabaseHandler(
                    self.username,
                    self.password,
                    self.db_host,
                    self.db_port,
                    self.database,
                )

                if db.established:
                    db.store_log(message, time_unix, dev_eui)
                    db.close()
                    logger.info("LogEintrag stored successfully")
                else:
                    logger.error("Failed to connect to database for storing log")
                    return
            else:
                logger.warning(f"Unknown message type: {payload.get('messagetyp')}")

        except KeyError as e:
            logger.error(f"Missing key in payload: {e}")
            return
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse JSON: {e}")
            return
        except Exception as exception:
            logger.error(f"Error processing request: {exception}")
            return


if __name__ == "__main__":
    logger.info("=" * 50)
    logger.info("LoRaMINT WebhookListener starting...")
    logger.info("=" * 50)

while True:
    try:
        webhook = Webhook()
        while webhook.listen:
            logger.info("Heartbeat - still alive...")
            time.sleep(300)
    except KeyboardInterrupt:
        logger.info("Shutting down...")
        break
    except Exception as e:
        logger.error(f"Error in main loop: {e}")
        time.sleep(5)
