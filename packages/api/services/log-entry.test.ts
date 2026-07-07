import { describe, expect, test } from "bun:test";
import type { TtnDecodedPayload } from "../types";
import { logEntries } from "./log-entry";

const EUI = "A1B2C3D4E5F60001";

const payload = (over: Partial<TtnDecodedPayload> = {}): TtnDecodedPayload => ({
  messagetyp: "LogEintrag",
  message: "Device booted",
  ...over,
});

describe("logEntries.validate", () => {
  test("accepts a valid log entry", () => {
    const result = logEntries.validate(payload(), EUI);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.message).toBe("Device booted");
  });

  test("rejects a device_eui that is not 16 hex chars", () => {
    expect(logEntries.validate(payload(), "nope").ok).toBe(false);
  });

  test("rejects an empty or whitespace-only message", () => {
    expect(logEntries.validate(payload({ message: "" }), EUI).ok).toBe(false);
    expect(logEntries.validate(payload({ message: "   " }), EUI).ok).toBe(false);
  });

  test("rejects a missing message", () => {
    expect(logEntries.validate(payload({ message: undefined }), EUI).ok).toBe(false);
  });

  test("rejects a message longer than 200 chars", () => {
    expect(logEntries.validate(payload({ message: "x".repeat(201) }), EUI).ok).toBe(false);
  });
});
