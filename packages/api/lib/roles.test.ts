import { describe, expect, test } from "bun:test";
import { hasRole, rolesOf, type RoleConfig } from "./roles";
import type { SessionUser } from "./session";

const user = (groups: string[]): SessionUser => ({
  username: "u",
  displayName: "U",
  groups,
});

const configured: RoleConfig = {
  dataGroup: "daten",
  managementGroup: "verwaltung",
  adminGroup: "admins",
};

describe("the ladder", () => {
  test("one group is enough - each level contains the ones below it", () => {
    // The property that makes the model safe to hand out: nobody has to
    // remember to also add the lower groups.
    expect(rolesOf(user(["daten"]), configured)).toEqual(["data"]);
    expect(rolesOf(user(["verwaltung"]), configured)).toEqual(["data", "management"]);
    expect(rolesOf(user(["admins"]), configured)).toEqual([
      "data",
      "management",
      "admin",
    ]);
  });

  test("an administrator reaches every level", () => {
    for (const role of ["data", "management", "admin"] as const) {
      expect(hasRole(user(["admins"]), role, configured)).toBe(true);
    }
  });

  test("a manager reaches management and below, but not admin", () => {
    expect(hasRole(user(["verwaltung"]), "data", configured)).toBe(true);
    expect(hasRole(user(["verwaltung"]), "management", configured)).toBe(true);
    expect(hasRole(user(["verwaltung"]), "admin", configured)).toBe(false);
  });

  test("the data level reaches nothing above it", () => {
    expect(hasRole(user(["daten"]), "management", configured)).toBe(false);
    expect(hasRole(user(["daten"]), "admin", configured)).toBe(false);
  });

  test("holding several groups is harmless - the highest one wins", () => {
    expect(rolesOf(user(["daten", "verwaltung", "admins"]), configured)).toEqual([
      "data",
      "management",
      "admin",
    ]);
    expect(rolesOf(user(["daten", "verwaltung"]), configured)).toEqual([
      "data",
      "management",
    ]);
  });

  test("an unrelated group grants nothing", () => {
    expect(rolesOf(user(["schueler"]), configured)).toEqual([]);
  });

  test("group names are matched exactly", () => {
    expect(hasRole(user(["Admins"]), "admin", configured)).toBe(false);
    expect(hasRole(user(["admins-2"]), "admin", configured)).toBe(false);
    expect(hasRole(user(["verwaltungs"]), "management", configured)).toBe(false);
  });
});

describe("with nothing configured", () => {
  const open: RoleConfig = {
    dataGroup: null,
    managementGroup: null,
    adminGroup: null,
  };

  test("every signed-in user keeps the read-only level", () => {
    // Otherwise adding this feature would lock out a deployment that never set
    // up groups, which is a change nobody asked for.
    expect(rolesOf(user([]), open)).toEqual(["data"]);
  });

  test("but nobody climbs higher by accident", () => {
    expect(hasRole(user(["admins"]), "management", open)).toBe(false);
    expect(hasRole(user(["admins"]), "admin", open)).toBe(false);
  });
});

describe("with only some levels configured", () => {
  test("an admin group alone still leaves reading open to everyone", () => {
    const config: RoleConfig = {
      dataGroup: null,
      managementGroup: null,
      adminGroup: "admins",
    };
    expect(rolesOf(user([]), config)).toEqual(["data"]);
    // And the admin group still skips straight to the top, without a management
    // group existing to pass through.
    expect(rolesOf(user(["admins"]), config)).toEqual([
      "data",
      "management",
      "admin",
    ]);
  });

  test("a data group alone means nobody manages or administers", () => {
    const config: RoleConfig = {
      dataGroup: "daten",
      managementGroup: null,
      adminGroup: null,
    };
    expect(rolesOf(user(["daten"]), config)).toEqual(["data"]);
    expect(rolesOf(user(["daten", "admins"]), config)).toEqual(["data"]);
  });

  test("a management group without a data group still admits everyone to reading", () => {
    const config: RoleConfig = {
      dataGroup: null,
      managementGroup: "verwaltung",
      adminGroup: null,
    };
    expect(rolesOf(user([]), config)).toEqual(["data"]);
    expect(rolesOf(user(["verwaltung"]), config)).toEqual(["data", "management"]);
  });
});

describe("anonymous visitors", () => {
  test("reach no level, whatever is configured", () => {
    for (const config of [
      configured,
      { dataGroup: null, managementGroup: null, adminGroup: null },
    ] satisfies RoleConfig[]) {
      expect(rolesOf(null, config)).toEqual([]);
      for (const role of ["data", "management", "admin"] as const) {
        expect(hasRole(null, role, config)).toBe(false);
      }
    }
  });
});
