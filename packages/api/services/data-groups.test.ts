import { describe, expect, test } from "bun:test";
import { dataGroupsOf, declareDataGroup, isRoleGroup } from "./data-groups";
import type { RoleConfig } from "../lib/roles";
import type { SessionUser } from "../lib/session";

const ROLES: RoleConfig = {
  dataGroup: "loramint-lesen",
  managementGroup: "loramint-verwalten",
  adminGroup: "loramint-admins",
  boardGroup: "loramint-board",
};

const user = (groups: string[]): SessionUser => ({
  username: "mruf",
  displayName: "Matthias Ruf",
  groups,
});

describe("die Schnittmenge", () => {
  /** The whole model in one test: directory ∩ declared, nothing else. */
  test("nur was im Verzeichnis *und* erklärt ist", () => {
    const person = user(["klasse-8b", "ag-wetter", "chor"]);
    expect(dataGroupsOf(person, ["klasse-8b", "klasse-9a", "ag-wetter"])).toEqual([
      "klasse-8b",
      "ag-wetter",
    ]);
  });

  test("eine erklärte Gruppe, in der niemand ist, gibt niemandem etwas", () => {
    expect(dataGroupsOf(user(["chor"]), ["klasse-8b"])).toEqual([]);
  });

  test("eine Verzeichnisgruppe, die nicht erklärt ist, zählt nicht", () => {
    expect(dataGroupsOf(user(["klasse-8b"]), [])).toEqual([]);
  });

  test("ohne Anmeldung keine Gruppe", () => {
    expect(dataGroupsOf(null, ["klasse-8b"])).toEqual([]);
  });

  /**
   * The setup account authenticated against the environment and holds no
   * directory groups. It reaches admin - so it can declare groups - but is a
   * member of none, which is the intended shape: configuring the server is not
   * the same as being allowed to read everybody's measurements.
   */
  test("das Einrichtungskonto ist in keiner Datengruppe", () => {
    const setup: SessionUser = {
      username: "Admin",
      displayName: "Admin",
      groups: [],
      setup: true,
    };
    expect(dataGroupsOf(setup, ["klasse-8b"])).toEqual([]);
  });
});

describe("was nicht zur Datengruppe erklärt werden darf", () => {
  /**
   * The point of the whole split. Declaring a role group here would silently
   * make "may administer" mean "may see this data", and the two axes are meant
   * to be grantable independently.
   */
  test("die drei Rollengruppen werden abgewiesen", async () => {
    for (const name of [
      "loramint-lesen",
      "loramint-verwalten",
      "loramint-admins",
    ]) {
      const result = await declareDataGroup({ name }, "mruf", ROLES);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain("Rollengruppe");
    }
  });

  test("ein leerer Name", async () => {
    const result = await declareDataGroup({ name: "   " }, "mruf", ROLES);
    expect(result.ok).toBe(false);
  });

  test("ein Name, der länger ist als die Spalte", async () => {
    const result = await declareDataGroup({ name: "x".repeat(101) }, "mruf", ROLES);
    expect(result.ok).toBe(false);
  });

  /**
   * Checked through the pure predicate rather than through declareDataGroup,
   * which would write to the database - a unit test must not leave a row behind.
   */
  test("eine gewöhnliche Gruppe ist keine Rollengruppe", () => {
    expect(isRoleGroup("klasse-8b", ROLES)).toBe(false);
  });

  /**
   * A deployment without LDAP_ADMIN_GROUP has no admin role group. Null must
   * match nothing rather than compare equal to something.
   */
  test("nicht konfigurierte Rollengruppen blockieren nichts", () => {
    const none = { dataGroup: null, managementGroup: null, adminGroup: null, boardGroup: null };
    expect(isRoleGroup("klasse-8b", none)).toBe(false);
    expect(isRoleGroup("", none)).toBe(false);
  });
});
