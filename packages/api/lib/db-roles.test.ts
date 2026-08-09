import { describe, expect, test } from "bun:test";
import { DB_ROLES, ownerRole, roleDsn, rolePassword } from "./db-roles";

const OWNER = "postgres://loramint:s3hr-geheim@db:5432/loramint_db";

describe("rolePassword", () => {
  test("is the same every time, so two processes agree without talking", () => {
    // The whole scheme rests on this: ensure-roles sets the password and the
    // application computes it again, independently.
    expect(rolePassword("geheim", DB_ROLES.manage)).toBe(
      rolePassword("geheim", DB_ROLES.manage),
    );
  });

  test("differs per role", () => {
    const all = Object.values(DB_ROLES).map((r) => rolePassword("geheim", r));
    expect(new Set(all).size).toBe(all.length);
  });

  test("differs per deployment", () => {
    expect(rolePassword("eins", DB_ROLES.manage)).not.toBe(
      rolePassword("zwei", DB_ROLES.manage),
    );
  });

  test("never contains the owner password", () => {
    expect(rolePassword("s3hr-geheim", DB_ROLES.readonly)).not.toContain(
      "s3hr-geheim",
    );
  });

  test("is long enough to be worth having", () => {
    expect(rolePassword("geheim", DB_ROLES.readonly)).toHaveLength(32);
  });

  /**
   * Without a password on the owner there is nothing to derive from, and every
   * deployment would end up with the same four passwords - which anybody could
   * compute. Refusing is the only honest answer.
   */
  test("refuses an empty owner password instead of deriving from nothing", () => {
    expect(() => rolePassword("", DB_ROLES.manage)).toThrow(/empty/i);
  });
});

describe("roleDsn", () => {
  test("keeps host, port and database, swaps the user", () => {
    const dsn = new URL(roleDsn(OWNER, DB_ROLES.readonly));
    expect(dsn.hostname).toBe("db");
    expect(dsn.port).toBe("5432");
    expect(dsn.pathname).toBe("/loramint_db");
    expect(dsn.protocol).toBe("postgres:");
    expect(decodeURIComponent(dsn.username)).toBe("loramint_readonly");
  });

  test("carries query parameters over, so sslmode is not lost", () => {
    const dsn = roleDsn(`${OWNER}?sslmode=require`, DB_ROLES.manage);
    expect(dsn).toContain("sslmode=require");
  });

  test("uses the derived password", () => {
    const dsn = new URL(roleDsn(OWNER, DB_ROLES.admin));
    expect(decodeURIComponent(dsn.password)).toBe(
      rolePassword("s3hr-geheim", DB_ROLES.admin),
    );
  });

  test("never carries the owner's password through", () => {
    for (const role of Object.values(DB_ROLES)) {
      expect(roleDsn(OWNER, role)).not.toContain("s3hr-geheim");
    }
  });

  test("a password with characters that need escaping survives the round trip", () => {
    const odd = "postgres://loramint:p%40ss%3Aword%2F%3F@db:5432/loramint_db";
    const dsn = new URL(roleDsn(odd, DB_ROLES.manage));
    // The owner's password is read back before it is hashed; if it were taken
    // raw, the derivation here and in ensure-roles could disagree.
    expect(decodeURIComponent(dsn.password)).toBe(
      rolePassword("p@ss:word/?", DB_ROLES.manage),
    );
  });

  test("says so when DATABASE_URL is not a connection string", () => {
    expect(() => roleDsn("nicht-wirklich-eine-url", DB_ROLES.manage)).toThrow(
      /DATABASE_URL/,
    );
  });

  test("each role gets its own connection", () => {
    const all = Object.values(DB_ROLES).map((r) => roleDsn(OWNER, r));
    expect(new Set(all).size).toBe(all.length);
  });
});

describe("ownerRole", () => {
  test("reads the owner's name out of the connection", () => {
    expect(ownerRole(OWNER)).toBe("loramint");
  });

  test("answers null rather than throwing on nonsense", () => {
    expect(ownerRole("nicht-wirklich-eine-url")).toBeNull();
  });
});
