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

describe("correcting a stored message", () => {
  test("holds a correction to the same rule as an incoming message", () => {
    // A correction must not be able to produce a row the webhook could never
    // have written in the first place.
    expect(logEntries.validateField("message", "Batterie schwach")).toBeNull();
    expect(logEntries.validateField("message", "x".repeat(200))).toBeNull();
    expect(logEntries.validateField("message", "x".repeat(201))).toMatch(/200 Zeichen/);
    expect(logEntries.validateField("message", null)).toMatch(/nicht leer/);
  });

  test("has nothing to say about a column it does not govern", () => {
    expect(logEntries.validateField("device_eui", "whatever")).toBeNull();
  });
});
