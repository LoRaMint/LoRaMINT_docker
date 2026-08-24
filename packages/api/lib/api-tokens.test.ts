import { describe, expect, test } from "bun:test";
import {
  expiryFor,
  generateToken,
  grantsCover,
  hashToken,
  isExpired,
  maxExpiry,
  validateFilter,
  MAX_DAYS,
  TOKEN_PREFIX,
  type Grant,
} from "./api-tokens";

const NOW = new Date("2026-08-24T12:00:00Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const daysBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / DAY_MS);

describe("der Wert", () => {
  test("trägt das Präfix und genug Zufall", () => {
    const value = generateToken();
    expect(value.startsWith(TOKEN_PREFIX)).toBe(true);
    // 32 Bytes base64url sind 43 Zeichen.
    expect(value.length).toBe(TOKEN_PREFIX.length + 43);
  });

  test("ist bei jedem Aufruf ein anderer", () => {
    const values = new Set(Array.from({ length: 50 }, generateToken));
    expect(values.size).toBe(50);
  });

  test("der Hash ist stabil und unterscheidet", () => {
    expect(hashToken("lm_abc")).toBe(hashToken("lm_abc"));
    expect(hashToken("lm_abc")).not.toBe(hashToken("lm_abd"));
    // SHA-256 hex.
    expect(hashToken("lm_abc")).toMatch(/^[0-9a-f]{64}$/);
  });

  test("der Klartext lässt sich aus dem Hash nicht zurückgewinnen", () => {
    const value = generateToken();
    expect(hashToken(value)).not.toContain(value.slice(TOKEN_PREFIX.length));
  });
});

describe("Laufzeit", () => {
  test("die Obergrenze liegt bei 360 Tagen", () => {
    expect(daysBetween(NOW, maxExpiry(NOW))).toBe(MAX_DAYS);
  });

  test("ein Wunsch unterhalb der Grenze wird übernommen", () => {
    expect(daysBetween(NOW, expiryFor(30, NOW))).toBe(30);
  });

  /** Die Regel, die die Obergrenze echt hält - auch beim Verlängern. */
  test("ein Wunsch oberhalb der Grenze wird gedeckelt", () => {
    expect(daysBetween(NOW, expiryFor(1000, NOW))).toBe(MAX_DAYS);
  });

  test("Verlängern misst ab jetzt, nicht ab dem alten Ablauf", () => {
    const später = new Date(NOW.getTime() + 300 * DAY_MS);
    expect(daysBetween(später, expiryFor(MAX_DAYS, später))).toBe(MAX_DAYS);
  });

  test("Unsinn wird zu einem Tag statt zu unbegrenzt", () => {
    expect(daysBetween(NOW, expiryFor(0, NOW))).toBe(1);
    expect(daysBetween(NOW, expiryFor(-5, NOW))).toBe(1);
    expect(daysBetween(NOW, expiryFor(Number.NaN, NOW))).toBe(1);
  });

  test("abgelaufen ist einschließlich des Zeitpunkts selbst", () => {
    expect(isExpired(NOW, NOW)).toBe(true);
    expect(isExpired(new Date(NOW.getTime() - 1), NOW)).toBe(true);
    expect(isExpired(new Date(NOW.getTime() + 1), NOW)).toBe(false);
  });
});

describe("validateFilter", () => {
  test("leer ist gültig und heißt „die ganze Gruppe\"", () => {
    expect(validateFilter({})).toEqual({});
    expect(validateFilter(null)).toEqual({});
    expect(validateFilter(undefined)).toEqual({});
  });

  test("bekannte Felder werden übernommen und beschnitten", () => {
    expect(validateFilter({ device_eui: " A840 ", measurand: "Temperatur" })).toEqual({
      device_eui: "A840",
      measurand: "Temperatur",
    });
  });

  /** Stillschweigend verwerfen würde den Zugriff erweitern, ohne dass es auffällt. */
  test("ein unbekanntes Feld wird abgewiesen, nicht ignoriert", () => {
    expect(typeof validateFilter({ group_name: "klasse-8b" })).toBe("string");
    expect(typeof validateFilter({ public_read: "true" })).toBe("string");
    expect(typeof validateFilter({ from: "2026-01-01" })).toBe("string");
  });

  test("leere Werte fallen weg, statt auf „" + '"' + " zu filtern", () => {
    expect(validateFilter({ device_eui: "", sensor: "   " })).toEqual({});
  });

  test("ein unbekannter Datentyp wird abgewiesen", () => {
    expect(validateFilter({ datatype: "float" })).toEqual({ datatype: "float" });
    expect(typeof validateFilter({ datatype: "gleitkomma" })).toBe("string");
  });

  test("kein Objekt ist kein Filter", () => {
    expect(typeof validateFilter("device_eui=A840")).toBe("string");
    expect(typeof validateFilter([])).toBe("string");
  });
});

describe("grantsCover", () => {
  const row = {
    group_name: "klasse-8b",
    device_eui: "A840",
    measurand: "Temperatur",
    sensor: "BME280",
    location: "Labor",
    datatype: "float",
  };

  test("ohne Berechtigung ist nichts gedeckt", () => {
    expect(grantsCover([], row)).toBe(false);
  });

  test("eine Berechtigung ohne Filter deckt die ganze Gruppe", () => {
    const grants: Grant[] = [{ group: "klasse-8b", filter: {} }];
    expect(grantsCover(grants, row)).toBe(true);
    expect(grantsCover(grants, { ...row, group_name: "ag-wetter" })).toBe(false);
  });

  test("ein Filter engt innerhalb der Gruppe ein", () => {
    const grants: Grant[] = [{ group: "klasse-8b", filter: { device_eui: "A840" } }];
    expect(grantsCover(grants, row)).toBe(true);
    expect(grantsCover(grants, { ...row, device_eui: "B951" })).toBe(false);
  });

  test("mehrere Felder im Filter gelten zusammen", () => {
    const grants: Grant[] = [
      { group: "klasse-8b", filter: { device_eui: "A840", measurand: "Druck" } },
    ];
    expect(grantsCover(grants, row)).toBe(false);
    expect(grantsCover(grants, { ...row, measurand: "Druck" })).toBe(true);
  });

  test("mehrere Berechtigungen wirken als ODER", () => {
    const grants: Grant[] = [
      { group: "ag-wetter", filter: {} },
      { group: "klasse-8b", filter: { device_eui: "A840" } },
    ];
    expect(grantsCover(grants, row)).toBe(true);
    expect(grantsCover(grants, { ...row, group_name: "ag-wetter" })).toBe(true);
    expect(grantsCover(grants, { ...row, group_name: "chor" })).toBe(false);
  });

  test("eine Zeile ohne Gruppe wird von keiner Berechtigung gedeckt", () => {
    const grants: Grant[] = [{ group: "klasse-8b", filter: {} }];
    expect(grantsCover(grants, { ...row, group_name: null })).toBe(false);
  });
});
