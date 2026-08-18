import { describe, expect, test } from "bun:test";
import { fillFraction, validateEntry, type EntryInput } from "./dashboard";

const BASE: EntryInput = {
  name: "Büro Nord",
  deviceEui: "A8404145A184DB83",
  sensor: "bme280",
  measurand: "Temperatur",
  rangeMode: "fixed",
  minValue: -20,
  maxValue: 50,
};

describe("validateEntry", () => {
  test("ein gültiger, fester Eintrag geht durch", () => {
    expect(validateEntry(BASE)).toBeNull();
  });

  test("ein gültiger, dynamischer Eintrag geht durch", () => {
    expect(
      validateEntry({ ...BASE, rangeMode: "dynamic", minValue: null, maxValue: null }),
    ).toBeNull();
  });

  test("leerer Name wird abgewiesen", () => {
    expect(validateEntry({ ...BASE, name: "  " })).not.toBeNull();
  });

  test("Device-EUI muss 16 Hex-Zeichen sein", () => {
    expect(validateEntry({ ...BASE, deviceEui: "zu-kurz" })).not.toBeNull();
  });

  test("fest ohne min/max wird abgewiesen", () => {
    expect(validateEntry({ ...BASE, minValue: null, maxValue: null })).not.toBeNull();
  });

  test("fest mit min >= max wird abgewiesen", () => {
    expect(validateEntry({ ...BASE, minValue: 50, maxValue: 50 })).not.toBeNull();
    expect(validateEntry({ ...BASE, minValue: 51, maxValue: 50 })).not.toBeNull();
  });

  test("dynamisch mit gesetzten Werten wird abgewiesen", () => {
    expect(
      validateEntry({ ...BASE, rangeMode: "dynamic", minValue: 0, maxValue: null }),
    ).not.toBeNull();
  });
});

describe("fillFraction", () => {
  test("klemmt auf [0, 1]", () => {
    expect(fillFraction(-100, 0, 10)).toBe(0);
    expect(fillFraction(100, 0, 10)).toBe(1);
  });

  test("liegt linear dazwischen", () => {
    expect(fillFraction(5, 0, 10)).toBeCloseTo(0.5);
  });

  test("entartete Spanne (max <= min) füllt nichts", () => {
    expect(fillFraction(5, 10, 10)).toBe(0);
    expect(fillFraction(5, 10, 0)).toBe(0);
  });
});
