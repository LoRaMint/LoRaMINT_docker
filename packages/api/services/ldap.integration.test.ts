import { describe, expect, test } from "bun:test";
import { connect } from "node:net";

/**
 * Integration tests against the throwaway OpenLDAP directory from
 * `compose.dev.yml` (profile `ldap`) - see dev_scripts/ldap/README.md. Start it
 * with:
 *
 *     docker compose -f compose.dev.yml --profile ldap up -d openldap
 *
 * They are skipped when nothing is listening, so `bun test` still works without
 * Docker; CI starts the container so they really run there. Point them at a
 * different directory with LDAP_TEST_URL.
 *
 * The expectations below encode the fixture in dev_scripts/ldap/seed.ldif -
 * change one and you have to change the other.
 */

// The config module requires TTN_APP_KEY at import time, and services/ldap.ts
// pulls it in for the `authenticate` convenience wrapper. The tests themselves
// pass their config explicitly and never touch the configured directory.
process.env.TTN_APP_KEY ??= "integration-test";
const { authenticateWith } = await import("./ldap");
type LdapConfig = import("./ldap").LdapConfig;

const URL = Bun.env.LDAP_TEST_URL ?? "ldap://localhost:1389";
const BASE = "dc=loramint,dc=test";
const PEOPLE = `ou=people,${BASE}`;

/** True when something accepts TCP connections at `url` within a second. */
const reachable = await new Promise<boolean>((resolve) => {
  const { hostname, port } = new globalThis.URL(URL.replace(/^ldaps?:/, "http:"));
  const socket = connect({ host: hostname, port: Number(port) || 389 });
  const done = (result: boolean) => {
    socket.destroy();
    resolve(result);
  };
  socket.setTimeout(1000);
  socket.once("connect", () => done(true));
  socket.once("timeout", () => done(false));
  socket.once("error", () => done(false));
});

// Skipping is the right default locally, but in CI it would turn a broken
// directory setup into a green run that tested nothing. There the workflow sets
// LDAP_TESTS_REQUIRED, which makes an unreachable directory a failure instead.
if (!reachable) {
  const hint =
    "  Start it with: docker compose -f compose.dev.yml --profile ldap up -d openldap";
  if (Bun.env.LDAP_TESTS_REQUIRED === "1") {
    throw new Error(
      `LDAP_TESTS_REQUIRED is set but nothing is listening at ${URL}.\n${hint}`,
    );
  }
  console.warn(`LDAP integration tests skipped: nothing listening at ${URL}.\n${hint}`);
}

const base: LdapConfig = {
  url: URL,
  userDnTemplate: null,
  bindDn: null,
  bindPassword: null,
  searchBase: null,
  searchFilter: "(uid={username})",
  displayNameAttribute: "cn",
  groupAttribute: null,
  groupSearchBase: null,
  groupFilter: "(member={dn})",
  groupNameAttribute: "cn",
  rejectUnauthorized: true,
  timeoutMs: 5000,
};

const directBind: LdapConfig = {
  ...base,
  userDnTemplate: `uid={username},${PEOPLE}`,
};

/** Search-and-bind plus group resolution by searching the group entries. */
const withGroups: LdapConfig = {
  ...base,
  bindDn: `cn=service,ou=system,${BASE}`,
  bindPassword: "servicepw",
  searchBase: PEOPLE,
  searchFilter: "(uid={username})",
  displayNameAttribute: "displayName",
  // Works against plain groupOfNames entries, so no memberof overlay is needed.
  groupSearchBase: `ou=groups,${BASE}`,
  groupFilter: "(member={dn})",
  groupNameAttribute: "cn",
};

const searchBind: LdapConfig = {
  ...base,
  bindDn: `cn=service,ou=system,${BASE}`,
  bindPassword: "servicepw",
  searchBase: PEOPLE,
  // The fixture marks permitted users with employeeType; a directory that
  // provides memberOf would restrict on the group instead.
  searchFilter: "(&(uid={username})(employeeType=loramint))",
  displayNameAttribute: "displayName",
};

describe.skipIf(!reachable)("LDAP direct bind", () => {
  test("accepts correct credentials", async () => {
    const result = await authenticateWith(directBind, "mruf", "geheim123");
    expect(result).toEqual({
      ok: true,
      // Without a search there is no directory entry to read a name off, so the
      // login name is all we have.
      data: { username: "mruf", displayName: "mruf", groups: [] },
    });
  });

  test("rejects a wrong password", async () => {
    const result = await authenticateWith(directBind, "mruf", "falsch");
    expect(result).toEqual({ ok: false, error: "invalid_credentials" });
  });

  test("rejects an unknown user with the same error as a wrong password", async () => {
    const result = await authenticateWith(directBind, "gibtsnicht", "egal1234");
    expect(result).toEqual({ ok: false, error: "invalid_credentials" });
  });

  test("rejects an empty password instead of binding anonymously", async () => {
    const result = await authenticateWith(directBind, "mruf", "");
    expect(result).toEqual({ ok: false, error: "invalid_credentials" });
  });

  test("trims surrounding whitespace off the login name", async () => {
    const result = await authenticateWith(directBind, "  mruf  ", "geheim123");
    expect(result.ok).toBe(true);
  });

  test("a login name with DN metacharacters still authenticates", async () => {
    const result = await authenticateWith(directBind, "we, ird*", "seltsam000");
    expect(result.ok).toBe(true);
  });

  test("a login name cannot inject another RDN into the template", async () => {
    // Unescaped this would resolve to cn=service,ou=system - a real entry whose
    // password is being supplied here.
    const result = await authenticateWith(
      directBind,
      "service,ou=system",
      "servicepw",
    );
    expect(result).toEqual({ ok: false, error: "invalid_credentials" });
  });
});

describe.skipIf(!reachable)("LDAP search and bind", () => {
  test("accepts correct credentials and takes the name from the directory", async () => {
    const result = await authenticateWith(searchBind, "mruf", "geheim123");
    expect(result).toEqual({
      ok: true,
      data: { username: "mruf", displayName: "Matthias Ruf", groups: [] },
    });
  });

  test("falls back to the login name when the entry has no display name", async () => {
    const result = await authenticateWith(searchBind, "nodisplay", "passwort789");
    expect(result).toEqual({
      ok: true,
      data: { username: "nodisplay", displayName: "nodisplay", groups: [] },
    });
  });

  test("rejects a user the filter excludes, even with the right password", async () => {
    const result = await authenticateWith(searchBind, "extern", "extern999");
    expect(result).toEqual({ ok: false, error: "invalid_credentials" });
  });

  test("rejects a wrong password", async () => {
    const result = await authenticateWith(searchBind, "mruf", "falsch");
    expect(result).toEqual({ ok: false, error: "invalid_credentials" });
  });

  test("rejects an empty password", async () => {
    const result = await authenticateWith(searchBind, "mruf", "");
    expect(result).toEqual({ ok: false, error: "invalid_credentials" });
  });

  test("a login name with filter metacharacters still authenticates", async () => {
    const result = await authenticateWith(searchBind, "we, ird*", "seltsam000");
    expect(result).toEqual({
      ok: true,
      data: { username: "we, ird*", displayName: "Komischer Name", groups: [] },
    });
  });

  test("a bare wildcard matches no one", async () => {
    const result = await authenticateWith(searchBind, "*", "geheim123");
    expect(result).toEqual({ ok: false, error: "invalid_credentials" });
  });

  test("a filter injection cannot select a different account", async () => {
    const result = await authenticateWith(
      searchBind,
      "*)(uid=mruf",
      "geheim123",
    );
    expect(result).toEqual({ ok: false, error: "invalid_credentials" });
  });

  test("an ambiguous filter is refused rather than guessed at", async () => {
    // Matches every user in the fixture, so the lookup is not decisive.
    const ambiguous: LdapConfig = { ...searchBind, searchFilter: "(uid=*)" };
    const result = await authenticateWith(ambiguous, "mruf", "geheim123");
    expect(result).toEqual({ ok: false, error: "invalid_credentials" });
  });
});

describe("LDAP failure handling", () => {
  test("reports an unreachable directory as unavailable, not as bad credentials", async () => {
    const dead: LdapConfig = {
      ...directBind,
      url: "ldap://127.0.0.1:1",
      timeoutMs: 1000,
    };
    const result = await authenticateWith(dead, "mruf", "geheim123");
    expect(result).toEqual({ ok: false, error: "unavailable" });
  });

  test("reports an unconfigured directory as disabled", async () => {
    const result = await authenticateWith(
      { ...base, url: null },
      "mruf",
      "geheim123",
    );
    expect(result).toEqual({ ok: false, error: "disabled" });
  });
});

/**
 * Group membership drives what a user may do (services/catalog.ts), so it is
 * resolved at sign-in. The fixture puts everyone in `loramint` and only mruf in
 * `loramint-admin`.
 */
describe.skipIf(!reachable)("group resolution", () => {
  test("finds the groups a user belongs to", async () => {
    const result = await authenticateWith(withGroups, "mruf", "geheim123");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect([...result.data.groups].sort()).toEqual(["loramint", "loramint-admin"]);
  });

  test("a user gets exactly their own groups, not someone else's", async () => {
    // Each fixture user is in one level only; reaching the levels below is the
    // ladder's job, not the directory's. See lib/roles.ts.
    const result = await authenticateWith(withGroups, "aschmidt", "passwort456");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect([...result.data.groups].sort()).toEqual([
      "loramint",
      "loramint-management",
    ]);
    expect(result.data.groups).not.toContain("loramint-admin");
  });

  test("a user in no group gets none, rather than failing to sign in", async () => {
    const result = await authenticateWith(withGroups, "extern", "extern999");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.groups).toEqual([]);
  });

  test("a login name with DN metacharacters still resolves its groups", async () => {
    // The DN goes into the group filter, so it has to be escaped there too.
    const result = await authenticateWith(withGroups, "we, ird*", "seltsam000");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.groups).toEqual(["loramint"]);
  });

  test("without group configuration nobody holds a group", async () => {
    const result = await authenticateWith(searchBind, "mruf", "geheim123");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.groups).toEqual([]);
  });

  test("an unreachable group base does not break the login", async () => {
    // Groups are an authorisation input, not an authentication one: failing to
    // read them must leave the user signed in with no groups, not locked out.
    const broken: LdapConfig = { ...withGroups, groupSearchBase: "ou=nope,dc=nowhere" };
    const result = await authenticateWith(broken, "mruf", "geheim123");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.groups).toEqual([]);
  });
});
