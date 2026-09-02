# TTN payload formatter

`uplink-formatter.js` is the JavaScript uplink payload formatter that runs **in
The Things Network**, not in this repository's runtime. It turns the raw bytes of
the LoRaMINT message protocol (version 1) into the JSON object that the API's
`POST /api/v1/webhook` endpoint expects (`messagetyp`, `value`, `unit`,
`measurand`, `location`, `sensor`, `datatype`, `timemethode`, `timevalue`).

It is kept here because it is part of the protocol, exactly like
`packages/esp32/loramint/mintvalue.py` and `packages/esp32/arduino/LoRaMINT/MintValue.cpp`
— change one and you have to check the others.

## Installing it

TTN Console → Application `loramint` → **Payload formatters** → **Uplink** →
formatter type *Custom Javascript formatter* → paste the file contents → *Save*.

Check that no device overrides it: End device → **Payload formatters** must say
*Use application payload formatter*, otherwise the device-level formatter wins.

## Wire format

```
byte 0        0x06  protocol v1 + "measured value"   (0x05 = log entry)
byte 1        (datatype << 2) | timeflag
bytes ...     value, big-endian (1/2/4 bytes, or ASCII for strings)
0x1E          record separator
unit 0x1E measurand 0x1E location 0x1E sensor 0x1E
[4 bytes]     Unix time, big-endian, only when timeflag == custom
```

The formatter locates every field by its `0x1E` separator and bounds each loop by
`input.bytes.length`, so the payload must **not** be padded. Padding to a fixed
99 bytes used to make messages undeliverable on weak links: in EU868 the maximum
application payload is 51 bytes at DR0–DR2 (SF12–SF10), so a 99-byte frame is
dropped by the radio module, which then transmits an empty frame instead.

## Known rough edges

Left as-is because this is the copy that is deployed and working; fix in TTN and
here together if you touch it.

- `messagetyp`, `message` and `datatype` are assigned without `var`, so they
  become globals.
- `case 5` ("double") decodes as a 4-byte IEEE-754 single, matching what the
  senders actually transmit.
- An unknown `datatype` falls through `default:` without advancing the index, so
  the following fields are parsed from the wrong offset.
