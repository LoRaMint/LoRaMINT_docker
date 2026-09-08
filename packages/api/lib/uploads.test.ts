import { describe, expect, test } from "bun:test";
import {
  ALLOWED_TYPES,
  extensionOf,
  formatBytes,
  isSafeStoredName,
  sanitizeFileName,
  typeOf,
  uniqueName,
} from "./uploads";

/** Convenience: the name, or null when the input was refused. */
const name = (raw: string): string | null => {
  const result = sanitizeFileName(raw);
  return "name" in result ? result.name : null;
};

describe("was ein gespeicherter Name sein darf", () => {
  test("gewöhnliche Namen gehen durch", () => {
    for (const gut of ["a.py", "arbeitsblatt-3.pdf", "bild_2.png", "x.zip"]) {
      expect(isSafeStoredName(gut)).toBe(true);
    }
  });

  /**
   * The allowlist earns its keep here: none of these is refused by a rule about
   * it, they are refused by not being in the set.
   */
  test("alles, womit man das Verzeichnis verlassen könnte, nicht", () => {
    for (const schlecht of [
      "../x.py",
      "..",
      "a/b.py",
      "a\\b.py",
      "/etc/passwd",
      "a b.py",
      "GROSS.PNG",
      "ümlaut.pdf",
      "a\u0000.py",
      "a\n.py",
    ]) {
      expect(isSafeStoredName(schlecht)).toBe(false);
    }
  });

  /** Führende Punkte halten .hidden und .tmp-… aus Liste und Auslieferung heraus. */
  test("ein führender Punkt nie", () => {
    expect(isSafeStoredName(".hidden")).toBe(false);
    expect(isSafeStoredName(".tmp-abc.py")).toBe(false);
    expect(isSafeStoredName(".htaccess")).toBe(false);
  });

  test("und nichts Endloses", () => {
    expect(isSafeStoredName("a".repeat(96) + ".py")).toBe(false);
  });
});

describe("Namen aus dem Browser", () => {
  test("ein gewöhnlicher Name bleibt er selbst", () => {
    expect(name("messung.py")).toBe("messung.py");
  });

  test("Grossbuchstaben werden klein", () => {
    expect(name("BILD.PNG")).toBe("bild.png");
    // Sonst sind das auf Linux zwei Dateien und auf macOS eine.
    expect(name("Bild.png")).toBe(name("bild.PNG"));
  });

  test("Umlaute werden ausgeschrieben, nicht gelöscht", () => {
    expect(name("Grüße vom Löwen.pdf")).toBe("gruesse-vom-loewen.pdf");
  });

  test("ein mitgeschickter Pfad wird abgeschnitten", () => {
    expect(name("C:\\Users\\ruf\\blatt.pdf")).toBe("blatt.pdf");
    expect(name("/home/ruf/blatt.pdf")).toBe("blatt.pdf");
    expect(name("../../etc/passwd.txt")).toBe("passwd.txt");
  });

  test("Steuerzeichen verschwinden", () => {
    expect(name("a\nb\u0000.py")).toBe("ab.py");
  });

  test("die Endung entscheidet, und zwar die letzte", () => {
    expect(name("a.php.pdf")).toBe("a.php.pdf");
    expect(typeOf("a.php.pdf")?.mime).toBe("application/pdf");
  });

  test("was Skript tragen kann, wird abgelehnt", () => {
    for (const raw of ["seite.html", "bild.svg", "daten.xml", "x.htm"]) {
      expect(name(raw)).toBeNull();
    }
  });

  test("ohne Endung, ohne Basis, ohne alles: eine Meldung", () => {
    for (const raw of ["", ".htaccess", "ohnepunkt", "....", "a.tar.gz"]) {
      expect(name(raw)).toBeNull();
    }
  });

  test("die Meldung sagt, was erlaubt wäre", () => {
    const result = sanitizeFileName("seite.html");
    expect("error" in result && result.error).toContain("pdf");
  });

  test("sehr lange Namen werden gekürzt, nicht abgelehnt", () => {
    const lang = name("x".repeat(300) + ".py");
    expect(lang).not.toBeNull();
    expect(lang!.length).toBeLessThanOrEqual(84);
  });

  /**
   * The invariant the download route relies on. Not a sample of inputs but the
   * rule itself: whatever comes out is servable, or nothing comes out.
   */
  test("was herauskommt, ist immer ein zulässiger Name", () => {
    const eingaben = [
      "../../etc/passwd",
      "..%2f..%2fx.png",
      "C:\\Users\\x\\a.pdf",
      ".htaccess",
      "a.php.pdf",
      "a.html",
      "a.svg",
      "Grüße vom Löwen.PDF",
      "x".repeat(300) + ".py",
      "a\n\u0000.py",
      "....",
      "",
      "a.tar.gz",
      "BILD.PNG",
      "---.png",
      "  .png",
      "😀.png",
    ];
    for (const eingabe of eingaben) {
      const result = sanitizeFileName(eingabe);
      if ("name" in result) {
        expect(isSafeStoredName(result.name)).toBe(true);
        expect(typeOf(result.name)).toBeDefined();
      } else {
        expect(result.error.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("Auslieferung nach Endung", () => {
  test("Bilder und PDF werden angezeigt, Quelltext heruntergeladen", () => {
    expect(typeOf("a.png")?.disposition).toBe("inline");
    expect(typeOf("a.pdf")?.disposition).toBe("inline");
    expect(typeOf("a.py")?.disposition).toBe("attachment");
    expect(typeOf("a.zip")?.disposition).toBe("attachment");
  });

  test("was nicht in der Liste steht, hat keinen Typ", () => {
    for (const endung of ["html", "svg", "xml", "exe", ""]) {
      expect(ALLOWED_TYPES[endung]).toBeUndefined();
    }
    expect(typeOf("ohnepunkt")).toBeUndefined();
  });

  test("die Endung wird ohne Rücksicht auf Grossschreibung gelesen", () => {
    expect(extensionOf("A.PNG")).toBe("png");
  });
});

describe("freie Namen vorschlagen", () => {
  test("ist der Name frei, bleibt er", () => {
    expect(uniqueName("bild.png", new Set())).toBe("bild.png");
  });

  test("sonst wird durchgezählt, die Endung bleibt", () => {
    expect(uniqueName("bild.png", new Set(["bild.png"]))).toBe("bild-2.png");
    expect(uniqueName("bild.png", new Set(["bild.png", "bild-2.png"]))).toBe("bild-3.png");
  });

  test("ein Name, der schon auf -2 endet, verwirrt nicht", () => {
    expect(uniqueName("bild-2.png", new Set(["bild-2.png"]))).toBe("bild-2-2.png");
  });
});

describe("Grössen", () => {
  /** Zahl und Einheit getrennt, damit die Spalte am Komma ausgerichtet werden kann. */
  test("Zahl und Einheit kommen getrennt", () => {
    expect(formatBytes(512)).toEqual({ wert: "512", einheit: "B" });
    expect(formatBytes(2048)).toEqual({ wert: "2", einheit: "kB" });
    expect(formatBytes(3_400_000)).toEqual({ wert: "3,4", einheit: "MB" });
  });

  test("das Dezimaltrennzeichen ist ein Komma", () => {
    expect(formatBytes(1_500_000).wert).toBe("1,5");
  });
});
