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

from mintvalue import MintValue


class LoRaMINT:
    # LoRaMINT protocol constants (must match the TTN payload formatter / server)
    LOG_MARKER = 0x05      # first byte marking a "LogEintrag" message
    FPORT = 2              # LoRaWAN port used for all LoRaMINT uplinks
    CONFIRM = 0            # 0 = unconfirmed uplink
    MAX_LOG_CHARS = 140    # maximum log message length (matches the Arduino lib)

    def __init__(self, uart_id=2, tx=17, rx=16, baudrate=9600):
        """Open the UART to the LA66 and reset the module."""
        self._uart = UART(uart_id, baudrate=baudrate, bits=8, parity=None,
                          stop=1, tx=tx, rx=rx, timeout=1000)
        self._reset()

    # ------------------------------------------------------------------ #
    # Public API
    # ------------------------------------------------------------------ #

    def join(self, timeout_ms=60000):
        """
        Join the LoRaWAN network via OTAA (AT+JOIN).

        Blocks until the module reports a join result or the timeout elapses.
        Returns True on success, False otherwise. Assumes DevEUI/AppEUI/AppKey
        are already configured on the LA66.
        """
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

        `value` is a MintValue instance. Its 99-byte payload is hex-encoded and
        sent via AT+SENDB. Returns True if the LA66 acknowledged with "OK".
        """
        command = "AT+SENDB={},{},{},{}".format(
            self.CONFIRM, self.FPORT, MintValue.MAX_MESSAGE_SIZE, value.to_byte_string()
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
        return bytes([self.LOG_MARKER]) + message.encode("ascii")

    # ------------------------------------------------------------------ #
    # LA66 / UART helpers
    # ------------------------------------------------------------------ #

    def _reset(self):
        """Reset the LA66 module (ATZ) and wait for it to come back up."""
        self._send_at("ATZ")
        time.sleep(2)
        self._drain()

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
