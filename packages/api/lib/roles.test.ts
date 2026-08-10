import { describe, expect, test } from "bun:test";
import { canReachData, dataScope, hasRole, rolesOf, type RoleConfig } from "./roles";
import type { SessionUser } from "./session";

const CONFIG: RoleConfig = {
  dataGroup: "loramint-data",
  managementGroup: "loramint-management",
  adminGroup: "loramint-admin",
};

const user = (...groups: string[]): SessionUser => ({
  username: "mruf",
  displayName: "Matthias Ruf",
  groups,
});

describe("die Leiter ist weg", () => {
  /**
   * The change this file exists for. Before, `management` contained `data` and
   * whoever managed devices also edited measurements. The three areas no longer
   * contain one another.
   */
  test("management allein gibt kein Recht an Messwerten", () => {
    const person = user("loramint-management");
    expect(hasRole(person, "management", CONFIG)).toBe(true);
    expect(hasRole(person, "data", CONFIG)).toBe(false);
  });

  test("data allein gibt kein Recht an Geräten", () => {
    const person = user("loramint-data");
    expect(hasRole(person, "data", CONFIG)).toBe(true);
    expect(hasRole(person, "management", CONFIG)).toBe(false);
  });

  test("wer beides braucht, ist in beiden Gruppen", () => {
    expect(rolesOf(user("loramint-data", "loramint-management"), CONFIG)).toEqual([
      "data",
      "management",
    ]);
  });

  /** The one exception, and it is deliberate: a locked-out server must be recoverable. */
  test("admin enthält weiterhin alles", () => {
    const person = user("loramint-admin");
    for (const role of ["data", "management", "admin"] as const) {
      expect(hasRole(person, role, CONFIG)).toBe(true);
    }
  });

  test("das Einrichtungskonto ebenfalls, es hat gar keine Gruppen", () => {
    const setup: SessionUser = {
      username: "setup",
      displayName: "Setup",
      groups: [],
      setup: true,
    };
    expect(rolesOf(setup, CONFIG)).toEqual(["data", "management", "admin"]);
  });

  test("ohne Anmeldung nichts", () => {
    expect(rolesOf(null, CONFIG)).toEqual([]);
    expect(hasRole(null, "data", CONFIG)).toBe(false);
  });

  /**
   * A deployment that never configured the data group expects every signed-in
   * user to be able to read. The other two must not behave that way, or an
   * unconfigured server would hand out editing rights.
   */
  test("nicht eingerichtete Datengruppe lässt jeden lesen", () => {
    const open = { ...CONFIG, dataGroup: null };
    expect(hasRole(user(), "data", open)).toBe(true);
    expect(hasRole(user(), "management", { ...CONFIG, managementGroup: null })).toBe(false);
    expect(hasRole(user(), "admin", { ...CONFIG, adminGroup: null })).toBe(false);
  });
});

describe("welche Zeilen jemand sieht", () => {
  const DECLARED = ["klasse-8b", "ag-wetter"];

  test("die Datenrolle sieht alles", () => {
    expect(dataScope(user("loramint-data"), CONFIG, DECLARED)).toBe("all");
    expect(dataScope(user("loramint-admin"), CONFIG, DECLARED)).toBe("all");
  });

  /**
   * The fourth source of rights: membership alone, without any role. This is
   * what lets a class edit its own readings without being given the run of every
   * other group's data.
   */
  test("Gruppenzugehörigkeit allein genügt für die eigenen Zeilen", () => {
    expect(dataScope(user("klasse-8b"), CONFIG, DECLARED)).toEqual(["klasse-8b"]);
    expect(canReachData(user("klasse-8b"), CONFIG, DECLARED)).toBe(true);
  });

  test("eine nicht erklärte Verzeichnisgruppe zählt nicht", () => {
    expect(dataScope(user("chor"), CONFIG, DECLARED)).toEqual([]);
    expect(canReachData(user("chor"), CONFIG, DECLARED)).toBe(false);
  });

  /**
   * An empty scope is an answer, not a failure. Falling back to "show
   * everything" when somebody belongs to nothing is the mistake this asserts
   * against.
   */
  test("wer in keiner Gruppe ist, sieht nichts über das Öffentliche hinaus", () => {
    expect(dataScope(user("loramint-management"), CONFIG, DECLARED)).toEqual([]);
    expect(canReachData(user("loramint-management"), CONFIG, DECLARED)).toBe(false);
  });

  test("Geräteverwalter mit eigener Datengruppe sieht genau diese", () => {
    const person = user("loramint-management", "ag-wetter");
    expect(dataScope(person, CONFIG, DECLARED)).toEqual(["ag-wetter"]);
  });
});
