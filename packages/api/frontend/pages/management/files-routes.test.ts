import { describe, expect, test } from "bun:test";
import { folderRenamed, showingFolder } from "./files-routes";

/**
 * Jedes Formular des Dateibrowsers trägt ein verstecktes `back`-Feld: die
 * Adresse, von der es abgeschickt wurde, samt `?ordner=`. Umbenennen ist die
 * eine Aktion, die dieses Feld über sich selbst falsch macht - der Ordner, den
 * es nennt, heisst danach anders.
 *
 * `folderFrom` fängt das nicht ab, und das ist richtig so: `isSafePath`
 * beurteilt die Schreibweise eines Pfades, nicht seine Existenz. Die Korrektur
 * gehört deshalb hierher, und weil sie an einer URL herumschreibt, ist jeder
 * Fall unten einer, in dem zu viel Umschreiben genauso schadet wie zu wenig.
 */
describe("die Adresse nach dem Umbenennen eines Ordners", () => {
  test("zeigt den Ordner unter seinem neuen Namen", () => {
    expect(folderRenamed("/management/dateien?ordner=alt", "alt", "neu")).toBe(
      "/management/dateien?ordner=neu",
    );
  });

  test("zieht einen Unterordner mit", () => {
    expect(
      folderRenamed("/management/dateien?ordner=alt/tief", "alt", "neu"),
    ).toBe("/management/dateien?ordner=neu%2Ftief");
  });

  /** Der Browser steht auch im Anleitungseditor, unter einer anderen Adresse. */
  test("lässt den Rest der Adresse stehen", () => {
    expect(
      folderRenamed("/management/anleitungen/abc-123?ordner=alt", "alt", "neu"),
    ).toBe("/management/anleitungen/abc-123?ordner=neu");
  });

  /**
   * „altbau" fängt mit „alt" an und ist ein anderer Ordner. Ohne den
   * Schrägstrich in der Prüfung würde er mit umgeschrieben - ein Sprung in
   * einen Ordner, den niemand angefasst hat.
   */
  test("fasst einen Ordner mit gleichem Anfang nicht an", () => {
    expect(
      folderRenamed("/management/dateien?ordner=altbau", "alt", "neu"),
    ).toBe("/management/dateien?ordner=altbau");
  });

  test("lässt eine Adresse ohne Ordner in Ruhe", () => {
    expect(folderRenamed("/management/dateien", "alt", "neu")).toBe(
      "/management/dateien",
    );
  });
});

/**
 * Ein Pfad im Feld „Neuer Ordner hier" legt mehrere Ebenen auf einmal an. Wer
 * danach stehen bliebe, sähe die oberste davon und müsste den Rest glauben.
 */
describe("die Adresse nach dem Anlegen eines Ordners", () => {
  test("zeigt den angelegten Ordner", () => {
    expect(showingFolder("/management/dateien", "esp32/lightsleep")).toBe(
      "/management/dateien?ordner=esp32%2Flightsleep",
    );
  });

  test("ersetzt den Ordner, in dem man stand", () => {
    expect(showingFolder("/management/dateien?ordner=esp32", "esp32/alt")).toBe(
      "/management/dateien?ordner=esp32%2Falt",
    );
  });

  test("die Wurzel lässt den Parameter ganz weg", () => {
    expect(showingFolder("/management/dateien?ordner=esp32", "")).toBe(
      "/management/dateien",
    );
  });

  test("lässt den Rest der Adresse stehen", () => {
    expect(
      showingFolder("/management/anleitungen/abc-123?ordner=alt", "neu"),
    ).toBe("/management/anleitungen/abc-123?ordner=neu");
  });
});
