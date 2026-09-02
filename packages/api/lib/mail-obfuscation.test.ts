import { describe, expect, test } from "bun:test";
import {
  fallbackText,
  looksLikeAddress,
  readableAddress,
  rot13,
  splitAddress,
} from "./mail-obfuscation";

describe("rot13", () => {
  test("ist sein eigenes Gegenstück", () => {
    const text = "matthias.ruf";
    expect(rot13(rot13(text))).toBe(text);
  });

  test("lässt Ziffern, Punkte und Bindestriche in Ruhe", () => {
    expect(rot13("a1-b.c")).toBe("n1-o.p");
  });

  test("rührt das @ nicht an – deshalb werden die Hälften getrennt", () => {
    expect(rot13("a@b")).toContain("@");
  });
});

describe("splitAddress", () => {
  test("trennt am letzten @", () => {
    expect(splitAddress("a@b@c.de")).toEqual({ local: "a@b", host: "c.de" });
  });

  test("gibt null für etwas, das keine Adresse ist", () => {
    for (const kaputt of ["kaputt", "@host.de", "name@", ""]) {
      expect(splitAddress(kaputt)).toBeNull();
    }
  });
});

describe("looksLikeAddress", () => {
  test("erkennt eine Adresse als Beschriftung", () => {
    expect(looksLikeAddress("info@example.org")).toBe(true);
    expect(looksLikeAddress("  info@example.org  ")).toBe(true);
  });

  test("ein Wort ist keine", () => {
    expect(looksLikeAddress("Kontakt")).toBe(false);
    expect(looksLikeAddress("schreib uns@ mal")).toBe(false);
  });
});

describe("die Fassung für Besucher ohne JavaScript", () => {
  test("ersetzt das @, damit ein einfaches Muster nicht greift", () => {
    expect(readableAddress("info@example.org")).toBe("info (at) example.org");
  });

  test("sagt die Adresse nicht zweimal, wenn sie schon die Beschriftung ist", () => {
    expect(fallbackText("info@example.org", "info@example.org")).toBe(
      "info (at) example.org",
    );
  });

  test("nennt sie hinter einem Wort, sonst wäre der Kontakt weg", () => {
    expect(fallbackText("Kontakt", "info@example.org")).toBe(
      "Kontakt (info (at) example.org)",
    );
  });
});
