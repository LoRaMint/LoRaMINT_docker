"""
LoRaMINT - MicroPython library for sending data via LoRaWAN using the Dragino
LA66 module on an ESP32, following the LoRaMINT message protocol (version 1).

Mirrors the Arduino LoRaMINT library: log messages are encoded as a 0x05 marker
byte followed by the ASCII message and transmitted with the LA66 AT command
"AT+SENDB=<confirm>,<port>,<len>,<hexdata>".

The ESP32 talks to the LA66 over a hardware UART:

    ESP32 TX (GPIO17) ---> LA66 RX
    ESP32 RX (GPIO16) <--- LA66 TX
    GND -------------------- GND

Created for the LoRaMINT project.
"""

import time

import ubinascii
from machine import UART


class LoRaMINT:
    # LoRaMINT protocol constants (must match the TTN payload formatter / server)
    LOG_MARKER = 0x05      # first byte marking a "LogEintrag" message
    FPORT = 2              # LoRaWAN port used for all LoRaMINT uplinks
    CONFIRM = 0            # 0 = unconfirmed uplink
    MAX_LOG_CHARS = 140    # maximum log message length (matches the Arduino lib)

    def __init__(self, uart_id=2, tx=17, rx=16, baudrate=9600, reset=False):
        """
        Open the UART to the LA66.

        `reset` sends ATZ to bring the module up in a known state. It defaults
        to False because the reset throws away the LoRaWAN session stored on the
        LA66, which forces a full OTAA join on every start - the most expensive
        thing a battery-powered node can do. Stale bytes on the line are cleared
        by _drain() before every command, so the reset is not needed for that.
        Pass reset=True when the module is wedged and a clean state is worth the
        join.
        """
        self._uart = UART(uart_id, baudrate=baudrate, bits=8, parity=None,
                          stop=1, tx=tx, rx=rx, timeout=1000)
        if reset:
            self._reset()

    # ------------------------------------------------------------------ #
    # Public API
    # ------------------------------------------------------------------ #

    def check_connection(self, timeout_ms=3000):
        """
        Verify the UART link to the LA66 by querying its firmware version
        (AT+VER=?). Prints a status message and returns True if the module
        responded, False otherwise.
        """
        version = self.get_version(timeout_ms)
        if version:
            print("UART OK - LA66 version:", version)
            return True
        print("UART connection failed - no response to AT+VER=? "
              "(check TX/RX wiring, common GND, UART pins and baud rate)")
        return False

    def get_version(self, timeout_ms=3000):
        """
        Query the LA66 firmware version (AT+VER=?).

        Returns the version string, or None if the module did not respond
        (which indicates a broken UART link).
        """
        self._drain()
        self._send_at("AT+VER=?")
        for line in self._read_response(timeout_ms):
            upper = line.upper()
            if upper == "OK" or upper.startswith("AT+VER"):
                continue  # skip the command echo and the trailing OK
            return line
        return None

    def is_joined(self, timeout_ms=3000):
        """
        Report whether the LA66 still holds a valid LoRaWAN session (AT+NJS=?).

        The module keeps the session across an ESP32 reboot, so this is what
        lets join() skip the OTAA handshake.

        Raises OSError when the module does not answer the query. Answering it
        is not optional: a module that stays silent here would otherwise be
        rejoined on every wake-up without anyone noticing.
        """
        self._drain()
        self._send_at("AT+NJS=?")
        for line in self._read_response(timeout_ms):
            upper = line.upper()
            if upper == "OK" or upper.startswith("AT+NJS"):
                continue  # skip the command echo and the trailing OK
            if line in ("0", "1"):
                return line == "1"
            break
        raise OSError("LA66 did not answer AT+NJS=? (join status)")

    def join(self, timeout_ms=60000, force=False):
        """
        Join the LoRaWAN network via OTAA (AT+JOIN).

        Returns immediately when the LA66 reports an existing session, unless
        `force` is set. An OTAA handshake costs an uplink plus two receive
        windows, so skipping it is the single largest saving on a node that
        wakes up often.

        Otherwise blocks until the module reports a join result or the timeout
        elapses. Returns True on success, False otherwise. Assumes
        DevEUI/AppEUI/AppKey are already configured on the LA66.
        """
        if not force and self.is_joined():
            return True

        self._drain()
        self._send_at("AT+JOIN")
        matched = self._wait_for(("joined", "join failed", "join_fail"), timeout_ms)
        return matched == "joined"

    def sendLog(self, message):
        """
        Send a log entry ("LogEintrag") to the LoRaMINT backend.

        The payload is the 0x05 marker byte followed by the ASCII bytes of
        `message`, hex-encoded and sent via AT+SENDB. Returns True if the LA66
        acknowledged the command with "OK".
        """
        payload = self._encode_log(message)
        hex_payload = ubinascii.hexlify(payload).decode().upper()
        command = "AT+SENDB={},{},{},{}".format(
            self.CONFIRM, self.FPORT, len(payload), hex_payload
        )
        self._drain()
        self._send_at(command)
        return self._wait_for(("ok",), 5000) == "ok"

    def sendValue(self, value):
        """
        Send a measurement value ("Messwert") to the LoRaMINT backend.

        `value` is a MintValue instance. Its payload is hex-encoded and sent via
        AT+SENDB. Returns True if the LA66 acknowledged with "OK".

        Note that "OK" only means the LA66 accepted the command, not that the
        frame went out: if the payload exceeds what the current data rate allows
        (51 bytes at DR0-DR2), the module transmits an empty frame instead.
        """
        payload = value.to_bytes()
        hex_payload = ubinascii.hexlify(payload).decode().upper()
        command = "AT+SENDB={},{},{},{}".format(
            self.CONFIRM, self.FPORT, len(payload), hex_payload
        )
        self._drain()
        self._send_at(command)
        return self._wait_for(("ok",), 5000) == "ok"

    # ------------------------------------------------------------------ #
    # Payload encoding
    # ------------------------------------------------------------------ #

    def _encode_log(self, message):
        """Build the raw payload bytes for a log message: [0x05] + ASCII."""
        if len(message) > self.MAX_LOG_CHARS:
            raise ValueError(
                "log message exceeds {} characters".format(self.MAX_LOG_CHARS)
            )
        # "replace" keeps non-ASCII input from raising (it becomes "?").
        return bytes([self.LOG_MARKER]) + message.encode("ascii", "replace")

    # ------------------------------------------------------------------ #
    # LA66 / UART helpers
    # ------------------------------------------------------------------ #

    def _reset(self):
        """Reset the LA66 module (ATZ) and wait for it to come back up."""
        self._send_at("ATZ")
        time.sleep(2)
        self._drain()

    def _read_response(self, timeout_ms=3000):
        """
        Read UART lines until a final "OK"/"ERROR" line or the timeout elapses.
        Returns the non-empty lines received (including the terminating one).
        An empty list means the module did not respond at all.
        """
        deadline = time.ticks_add(time.ticks_ms(), timeout_ms)
        lines = []
        while time.ticks_diff(deadline, time.ticks_ms()) > 0:
            line = self._uart.readline()
            if line:
                try:
                    text = line.decode().strip()
                except Exception:
                    text = str(line).strip()
                if text:
                    lines.append(text)
                    upper = text.upper()
                    if upper == "OK" or "ERROR" in upper:
                        break
            else:
                time.sleep_ms(20)
        return lines

    def _send_at(self, command):
        """Write an AT command to the LA66, terminated with CRLF."""
        self._uart.write(command + "\r\n")

    def _drain(self):
        """Discard any bytes currently buffered on the UART."""
        while self._uart.any():
            self._uart.read()

    def _wait_for(self, tokens, timeout_ms):
        """
        Read UART lines until one contains a token (case-insensitive) or the
        timeout elapses. Returns the matched token, or None on timeout.
        """
        deadline = time.ticks_add(time.ticks_ms(), timeout_ms)
        buffer = ""
        while time.ticks_diff(deadline, time.ticks_ms()) > 0:
            line = self._uart.readline()
            if line:
                try:
                    buffer += line.decode()
                except Exception:
                    buffer += str(line)
                lowered = buffer.lower()
                for token in tokens:
                    if token in lowered:
                        return token
            else:
                time.sleep_ms(20)
        return None
