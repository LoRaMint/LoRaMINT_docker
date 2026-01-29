# python classes
import time
import json
# "pip install webhook_listener" necessary
import webhook_listener

# self written classes
from MintValue import MintValue
from DatabaseHandler import DatabaseHandler


# The class webhook handles incoming webhook messages. It uses the data from the userdata.json file.
class Webhook(object):

    # Instantiates a webhook object and starts the webhook listener
    def __init__(self, data_path):

        # read userdata file
        try:
            userdata_stream = open(data_path, 'r')
            userdata = userdata_stream.read()
        except FileNotFoundError:
            print("File not found: " + data_path)
            self.listen = False
            return
        except Exception as ex:
            print(f"Error read the file: {ex}")
            self.listen = False
            return

        # parses the json formatted user data
        try:
            userdata = json.loads(userdata)
            self.password = userdata["db_password"]
            self.username = userdata["db_username"]
            self.unix_socket = userdata["unixsocket"]
            self.app_key = userdata["appkey"]
            self.ip = userdata["ip"]
            self.database = userdata["database"]

        except json.decoder.JSONDecodeError:
            print("File " + data_path + " does not fit the json format. ")
            self.listen = False
            return
        except KeyError:
            print("Missing key in file " + data_path)
            self.listen = False
        except Exception as exc:
            print(f"Error decode the json: {exc}")

        # everything works fine -> start the listener
        self.listen = True
        webhooks = webhook_listener.Listener(handlers={'POST': self.process_post_request})
        webhooks.host = self.ip
        webhooks.start()

    # Handles incoming messages. Is called up automatically as soon as a message is received.
    def process_post_request(self, request, *args, **kwargs):

        try:

            # --- check the application key ---
            request_appkey = request.headers.get("X-Downlink-Apikey")
            if request_appkey is None:
                print("Received request has no application key. ")  # no app key
                return
            elif request.headers.get("X-Downlink-Apikey") != self.app_key:  # not the correct app key
                print("Received request with non suitable application key: " + request.headers.get("X-Downlink-Apikey"))
                return
            else:
                pass  # everything is fine

            # --- read the request body ---
            try:
                if int(request.headers.get("Content-Length", 0)) > 0:
                    message_body = str(request.body.read(int(request.headers["Content-Length"])))
                else:
                    print("Received request with content-length lower equal 0.")
                    return  # no message
            except ValueError:
                print("Received request with non numerical content length. ")  # no app key
                return

            # --- parse the request body ---
            json_body = json.loads(
                message_body[2:len(message_body) - 1])  # body of the message starts with "b`" and remaining part is json

            payload = json_body["uplink_message"]["decoded_payload"]

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
                        print("Received message with not numeric timestamp-value")
                        return
                else:
                    print("Unsupported time format: " + time_methode)
                    return

                # --- Determine more attributes from the metadata --

                dev_eui = json_body["end_device_ids"]["dev_eui"]

                # --- create a MintValue object
                value = MintValue(datatype, location, measurand, sensor, unit, value, time_methode, time_value, dev_eui)

                # --- store the value object into the database

                db = DatabaseHandler(self.username, self.password, self.unix_socket, self.database)
                if db.established:
                    # everything is fine
                    db.store_value(value)
                else:
                    # exception in the constructor class of db
                    return

            elif payload["messagetyp"] == 'LogEintrag':

                message = payload["message"]
                dev_eui = json_body["end_device_ids"]["dev_eui"]
                time_unix = int(time.time())
                print("LogEntry:\n\tdevice: {0} \n\ttime: {1}\n\tmessage: {2}".format(dev_eui, time_unix, message))

                db = DatabaseHandler(self.username, self.password, self.unix_socket, self.database)

                if db.established:
                    # everything is fine
                    db.store_log(message, time_unix, dev_eui)
                else:
                    # exception in the constructor class of db
                    return

        except Exception as exception:
            print("Received message with errors: " + str(exception))
            return


while True:
    try:
        webhook = Webhook("./userdata.json")
        while webhook.listen:
            print("Still alive...")
            time.sleep(300)
    except Exception as e:
        print(e)
