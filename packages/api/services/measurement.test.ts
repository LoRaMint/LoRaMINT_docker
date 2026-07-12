import { describe, expect, test } from "bun:test";
import type { TtnDecodedPayload } from "../types";
import { MeasurementFilterSchema } from "../types";
import { escapeCsvField, measurements } from "./measurement";

const EUI = "A1B2C3D4E5F60001";

const payload = (over: Partial<TtnDecodedPayload> = {}): TtnDecodedPayload => ({
  messagetyp: "Messwert",
  datatype: "float",
  location: "Raum 101",
  measurand: "Temperatur",
  sensor: "BME280",
  unit: "*C",
  value: 21.5,
  timemethode: "server",
  ...over,
});

describe("measurements.validate", () => {
  test("accepts a valid float measurement", () => {
    const result = measurements.validate(payload(), EUI);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.value).toBe("21.5");
      expect(result.data.datatype).toBe("float");
      expect(result.data.recordedAt).toBeInstanceOf(Date);
    }
  });

  test("rejects a device_eui that is not 16 hex chars", () => {
    expect(measurements.validate(payload(), "XYZ").ok).toBe(false);
    expect(measurements.validate(payload(), "A1B2C3D4E5F6000").ok).toBe(false);
  });

  test("rejects an unknown datatype", () => {
    expect(measurements.validate(payload({ datatype: "boolean" }), EUI).ok).toBe(false);
  });

  test("rejects empty and overlong string fields", () => {
    expect(measurements.validate(payload({ unit: "" }), EUI).ok).toBe(false);
    expect(measurements.validate(payload({ sensor: "x".repeat(41) }), EUI).ok).toBe(false);
  });

  test("truncates integer values and rejects non-numeric ones", () => {
    const ok = measurements.validate(payload({ datatype: "integer", value: 12.7 }), EUI);
    expect(ok.ok && ok.data.value).toBe("12");
    expect(measurements.validate(payload({ datatype: "integer", value: "abc" }), EUI).ok).toBe(false);
  });

  test("rejects string values longer than 20 chars", () => {
    expect(measurements.validate(payload({ datatype: "string", value: "x".repeat(21) }), EUI).ok).toBe(false);
  });

  test("sets recordedAt to null for time method 'none'", () => {
    const result = measurements.validate(payload({ timemethode: "none" }), EUI);
    expect(result.ok && result.data.recordedAt).toBeNull();
  });

  test("handles custom time and rejects a negative timevalue", () => {
    const ok = measurements.validate(payload({ timemethode: "custom", timevalue: 1700000000 }), EUI);
    expect(ok.ok).toBe(true);
    expect(ok.ok && ok.data.recordedAt).toBeInstanceOf(Date);
    expect(measurements.validate(payload({ timemethode: "custom", timevalue: -1 }), EUI).ok).toBe(false);
  });

  test("rejects an unknown time method", () => {
    expect(measurements.validate(payload({ timemethode: "later" }), EUI).ok).toBe(false);
  });
});

describe("escapeCsvField", () => {
  test("wraps a plain value in quotes", () => {
    expect(escapeCsvField("hello")).toBe('"hello"');
  });

  test("doubles embedded quotes", () => {
    expect(escapeCsvField('a"b')).toBe('"a""b"');
  });

  test("neutralizes formula-injection prefixes", () => {
    expect(escapeCsvField("=1+1")).toBe(`"'=1+1"`);
    expect(escapeCsvField("+cmd")).toBe(`"'+cmd"`);
    expect(escapeCsvField("-2")).toBe(`"'-2"`);
    expect(escapeCsvField("@x")).toBe(`"'@x"`);
  });

  test("renders null/undefined as an empty field", () => {
    expect(escapeCsvField(null)).toBe('""');
    expect(escapeCsvField(undefined)).toBe('""');
  });
});

describe("MeasurementFilterSchema", () => {
  test("parses an empty object into all-undefined fields", () => {
    const result = MeasurementFilterSchema.parse({});
    expect(result).toEqual({});
  });

  test("accepts a plain date or a full ISO timestamp for from/to", () => {
    const result = MeasurementFilterSchema.parse({ from: "2026-07-01", to: "2026-07-10T12:00:00Z" });
    expect(result.from).toBe("2026-07-01");
    expect(result.to).toBe("2026-07-10T12:00:00Z");
  });

  test("rejects a malformed from/to value", () => {
    expect(() => MeasurementFilterSchema.parse({ from: "not-a-date" })).toThrow();
  });

  test("rejects an unknown datatype", () => {
    expect(() => MeasurementFilterSchema.parse({ datatype: "boolean" })).toThrow();
  });

  test("rejects a device_eui that is not 16 hex chars", () => {
    expect(() => MeasurementFilterSchema.parse({ device_eui: "XYZ" })).toThrow();
    expect(() => MeasurementFilterSchema.parse({ device_eui: "A1B2C3D4E5F6000" })).toThrow();
  });

  test("accepts a valid device_eui", () => {
    const result = MeasurementFilterSchema.parse({ device_eui: "A1B2C3D4E5F60001" });
    expect(result.device_eui).toBe("A1B2C3D4E5F60001");
  });
});
