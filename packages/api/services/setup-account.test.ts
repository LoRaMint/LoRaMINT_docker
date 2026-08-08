import { afterEach, describe, expect, test } from "bun:test";
import { setupAccount } from "../config";
import { verifySetupAccount } from "./setup-account";
import { hasRole, rolesOf } from "../lib/roles";
import { createSession, readSession } from "../lib/session";

/**
 * The setup account against a described configuration.
 *
 * Written into the config object rather than into the environment: config.ts
 * reads `Bun.env` once at import time, and the test runner shares one module
 * registry across files, so setting variables here would come too late. The
 * service reads these fields on every call, which is what makes overwriting
 * them enough - the same approach as services/ttn.test.ts.
 */
const configure = (values: Partial<typeof setupAccount>) => {
  Object.assign(setupAccount, {
    enabled: false,
    username: null,
    passwordHash: null,
    password: null,
    ...values,
  });
};

afterEach(() => {
  configure({});
});

/** Argon2id over "richtig-langes-passwort", generated the way the script does. */
const HASH = await Bun.password.hash("richtig-langes-passwort", {
  algorithm: "argon2id",
});

describe("wenn kein Einrichtungskonto konfiguriert ist", () => {
  test("gilt jeder Name als fremd, damit LDAP gefragt wird", async () => {
    configure({});
    expect(await verifySetupAccount("admin", "egal")).toEqual({ kind: "other" });
  });

  test("auch ein Name ohne Passwort schaltet es nicht ein", async () => {
    configure({ enabled: false, username: "admin" });
    expect(await verifySetupAccount("admin", "egal")).toEqual({ kind: "other" });
  });
});

describe("mit Klartextpasswort", () => {
  const withPlain = () =>
    configure({ enabled: true, username: "setup", password: "geheim-genug-123" });

  test("richtiger Name und richtiges Passwort melden an", async () => {
    withPlain();
    const result = await verifySetupAccount("setup", "geheim-genug-123");
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.user.username).toBe("setup");
    expect(result.user.groups).toEqual([]);
    expect(result.user.setup).toBe(true);
  });

  /**
   * The decision that keeps the name unambiguously local: a wrong password is
   * refused here rather than handed on, so nobody can find out by trying whether
   * a directory entry of the same name exists.
   */
  test("falsches Passwort wird abgewiesen und NICHT an LDAP durchgereicht", async () => {
    withPlain();
    expect(await verifySetupAccount("setup", "falsch")).toEqual({ kind: "wrong" });
  });

  test("ein leeres Passwort passt nie", async () => {
    withPlain();
    expect(await verifySetupAccount("setup", "")).toEqual({ kind: "wrong" });
  });

  test("ein anderer Name geht ans Verzeichnis", async () => {
    withPlain();
    expect(await verifySetupAccount("mruf", "geheim-genug-123")).toEqual({
      kind: "other",
    });
  });

  test("Leerzeichen aus der Zwischenablage stören den Namen nicht", async () => {
    withPlain();
    expect((await verifySetupAccount("  setup  ", "geheim-genug-123")).kind).toBe(
      "ok",
    );
  });

  test("der Name bleibt gross-/kleinschreibungsempfindlich wie im Verzeichnis", async () => {
    withPlain();
    expect(await verifySetupAccount("Setup", "geheim-genug-123")).toEqual({
      kind: "other",
    });
  });
});

describe("mit Hash", () => {
  test("prüft gegen den Hash", async () => {
    configure({ enabled: true, username: "setup", passwordHash: HASH });
    expect((await verifySetupAccount("setup", "richtig-langes-passwort")).kind).toBe(
      "ok",
    );
    expect(await verifySetupAccount("setup", "daneben")).toEqual({ kind: "wrong" });
  });

  test("der Hash gewinnt, wenn beides gesetzt ist", async () => {
    configure({
      enabled: true,
      username: "setup",
      passwordHash: HASH,
      password: "das-hier-gilt-nicht",
    });
    expect((await verifySetupAccount("setup", "richtig-langes-passwort")).kind).toBe(
      "ok",
    );
    expect(await verifySetupAccount("setup", "das-hier-gilt-nicht")).toEqual({
      kind: "wrong",
    });
  });

  test("ein unlesbarer Hash sperrt aus, statt jeden hereinzulassen", async () => {
    configure({ enabled: true, username: "setup", passwordHash: "kein-hash" });
    expect(await verifySetupAccount("setup", "irgendwas")).toEqual({
      kind: "wrong",
    });
  });
});

describe("was das Konto darf", () => {
  /** No directory configured at all - the situation the account exists for. */
  const noDirectory = { dataGroup: null, managementGroup: null, adminGroup: null };

  test("es ist Administrator, obwohl es keine Gruppen hat", async () => {
    configure({ enabled: true, username: "setup", password: "geheim-genug-123" });
    const result = await verifySetupAccount("setup", "geheim-genug-123");
    if (result.kind !== "ok") throw new Error("unerwartet");

    expect(hasRole(result.user, "admin", noDirectory)).toBe(true);
    expect(rolesOf(result.user, noDirectory)).toEqual([
      "data",
      "management",
      "admin",
    ]);
  });

  test("ohne die Kennzeichnung reicht es nur bis data", () => {
    const ordinary = { username: "x", displayName: "x", groups: [] };
    expect(hasRole(ordinary, "admin", noDirectory)).toBe(false);
  });

  /**
   * The flag travels inside the signed payload, so it survives a round trip
   * through the cookie - and cannot be added to one from outside without the
   * secret.
   */
  test("die Kennzeichnung übersteht das Sitzungs-Cookie", () => {
    const secret = "x".repeat(40);
    const cookie = createSession(
      { username: "setup", displayName: "setup", groups: [], setup: true },
      secret,
      8,
    );
    const back = readSession(cookie, secret);
    expect(back?.setup).toBe(true);
    expect(hasRole(back, "admin", noDirectory)).toBe(true);
  });

  test("eine gewöhnliche Sitzung trägt die Kennzeichnung nicht", () => {
    const secret = "x".repeat(40);
    const cookie = createSession(
      { username: "mruf", displayName: "Matthias", groups: ["loramint-admin"] },
      secret,
      8,
    );
    expect(readSession(cookie, secret)?.setup).toBeUndefined();
  });
});
