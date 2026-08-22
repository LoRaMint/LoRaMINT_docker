import { describe, expect, test } from "bun:test";
import { facetOptions, NO_GROUP, type Combination, type Selection } from "./facets";

/**
 * Two sensors that share one measurand and have one of their own each, spread
 * over two locations and two groups - enough for every rule below to be able to
 * fail.
 */
const ROWS: Combination[] = [
  { measurand: "temperature", sensor: "bme280", location: "innen", group: "klasse-8b", isPublic: true },
  { measurand: "humidity", sensor: "bme280", location: "innen", group: "klasse-8b", isPublic: true },
  { measurand: "temperature", sensor: "ds18b20", location: "aussen", group: NO_GROUP, isPublic: false },
  { measurand: "co2", sensor: "scd30", location: "innen", group: "ag-wetter", isPublic: false },
];

const NOTHING: Selection = {
  measurands: [],
  sensors: [],
  location: "",
  group: "",
  isPublic: "",
};

const select = (partial: Partial<Selection>): Selection => ({ ...NOTHING, ...partial });

describe("ohne Auswahl", () => {
  test("kommt jede Facette vollständig zurück", () => {
    const options = facetOptions(ROWS, NOTHING);
    expect(options.measurands).toEqual(["co2", "humidity", "temperature"]);
    expect(options.sensors).toEqual(["bme280", "ds18b20", "scd30"]);
    expect(options.locations).toEqual(["aussen", "innen"]);
    // Das Sentinel ist keine Gruppe, sondern eine Wahlmöglichkeit, die der
    // Aufrufer anhängt - hier darf es nicht auftauchen.
    expect(options.groups).toEqual(["ag-wetter", "klasse-8b"]);
  });
});

describe("gegenseitige Einschränkung", () => {
  test("ein Sensor schränkt die Messgrößen auf die gemeinsam aufgetretenen ein", () => {
    const options = facetOptions(ROWS, select({ sensors: ["ds18b20"] }));
    expect(options.measurands).toEqual(["temperature"]);
  });

  /** Die Regel, die das Aussperren verhindert. */
  test("und lässt die Sensorliste selbst unangetastet", () => {
    const options = facetOptions(ROWS, select({ sensors: ["ds18b20"] }));
    expect(options.sensors).toEqual(["bme280", "ds18b20", "scd30"]);
  });

  test("mehrere Sensoren wirken als ODER", () => {
    const options = facetOptions(ROWS, select({ sensors: ["ds18b20", "scd30"] }));
    expect(options.measurands).toEqual(["co2", "temperature"]);
  });

  test("eine Messgröße schränkt umgekehrt die Sensoren ein", () => {
    const options = facetOptions(ROWS, select({ measurands: ["humidity"] }));
    expect(options.sensors).toEqual(["bme280"]);
  });

  test("Location schränkt Messgrößen und Sensoren ein", () => {
    const options = facetOptions(ROWS, select({ location: "aussen" }));
    expect(options.measurands).toEqual(["temperature"]);
    expect(options.sensors).toEqual(["ds18b20"]);
  });
});

describe("Gruppe und Öffentlich", () => {
  /** Fehler 2: beide filterten die Daten, aber nie die Listen. */
  test("eine Gruppe schränkt Messgrößen und Sensoren ein", () => {
    const options = facetOptions(ROWS, select({ group: "klasse-8b" }));
    expect(options.measurands).toEqual(["humidity", "temperature"]);
    expect(options.sensors).toEqual(["bme280"]);
  });

  test("NO_GROUP trifft genau die Zeilen ohne Gruppe", () => {
    const options = facetOptions(ROWS, select({ group: NO_GROUP }));
    expect(options.measurands).toEqual(["temperature"]);
    expect(options.sensors).toEqual(["ds18b20"]);
  });

  test("„öffentlich: ja\" schränkt ein", () => {
    const options = facetOptions(ROWS, select({ isPublic: "true" }));
    expect(options.measurands).toEqual(["humidity", "temperature"]);
    expect(options.sensors).toEqual(["bme280"]);
  });

  /** "" heisst "nicht einschränken" und muss von "false" unterscheidbar bleiben. */
  test("„öffentlich: nein\" ist nicht dasselbe wie „alle\"", () => {
    expect(facetOptions(ROWS, select({ isPublic: "false" })).sensors).toEqual([
      "ds18b20",
      "scd30",
    ]);
    expect(facetOptions(ROWS, select({ isPublic: "" })).sensors).toEqual([
      "bme280",
      "ds18b20",
      "scd30",
    ]);
  });
});

describe("kein Aussperren", () => {
  /**
   * Die Invariante: was angeboten wurde, passt zur restlichen Auswahl. Wer eine
   * Messgröße aus der eingeschränkten Liste wählt, darf den Sensor, der sie
   * überhaupt ermöglicht hat, nicht aus dessen Liste verlieren.
   */
  test("der Sensor, der eine Messgröße ermöglicht hat, bleibt wählbar", () => {
    const afterSensor = facetOptions(ROWS, select({ sensors: ["bme280"] }));
    expect(afterSensor.measurands).toContain("humidity");

    const afterBoth = facetOptions(ROWS, select({ sensors: ["bme280"], measurands: ["humidity"] }));
    expect(afterBoth.sensors).toContain("bme280");
  });

  test("alles abwählen führt zur vollen Liste zurück", () => {
    expect(facetOptions(ROWS, NOTHING)).toEqual(facetOptions(ROWS, select({})));
  });

  test("eine Auswahl ohne Treffer leert die übrigen Listen, statt zu raten", () => {
    const options = facetOptions(ROWS, select({ sensors: ["scd30"], location: "aussen" }));
    expect(options.measurands).toEqual([]);
  });
});
