import { Client, InvalidCredentialsError } from "ldapts";
import { auth } from "../config";
import type { MutationResult } from "../types";
import type { SessionUser } from "../lib/session";
import {
  escapeDnValue,
  escapeFilterValue,
  fillUsername as fill,
} from "../lib/ldap-escape";

/**
 * LDAP authentication. Both supported strategies end in the same decisive step:
 * a bind as the user with the password they typed. Only the directory ever sees
 * the password - it is never stored or logged here.
 *
 * The directory settings are passed in rather than read from the config module,
 * so the integration test can exercise both strategies in one process; the
 * exported `authenticate` binds them to the configured directory.
 */

//====================================
// TYPES
//====================================

export type LdapConfig = {
  url: string | null;
  /** Direct bind: the user's DN, with `{username}` substituted. */
  userDnTemplate: string | null;
  /** Search and bind: the service account used for the lookup. */
  bindDn: string | null;
  bindPassword: string | null;
  searchBase: string | null;
  searchFilter: string;
  displayNameAttribute: string;
  /** Group membership straight off the user entry, e.g. `memberOf`. */
  groupAttribute: string | null;
  /** Or: search the group entries, which works without the memberof overlay. */
  groupSearchBase: string | null;
  groupFilter: string;
  groupNameAttribute: string;
  rejectUnauthorized: boolean;
  timeoutMs: number;
};

/**
 * Failure reasons. Codes rather than sentences: the login page maps them to a
 * fixed message, so nothing an attacker controls is ever reflected back into the
 * page, and the service stays free of UI text.
 */
export type AuthError = "invalid_credentials" | "unavailable" | "disabled";

const INVALID: AuthError = "invalid_credentials";

//====================================
// AUTHENTICATION
//====================================

const newClient = (cfg: LdapConfig) =>
  new Client({
    url: cfg.url!,
    timeout: cfg.timeoutMs,
    connectTimeout: cfg.timeoutMs,
    // Only on ldaps://: ldapts treats the mere presence of `tlsOptions` as a
    // request for TLS (`secure = isSecureProtocol || hasTlsOptions`), so passing
    // it unconditionally makes every plain ldap:// connection fail in a TLS
    // handshake against a server that never offered one.
    ...(cfg.url!.startsWith("ldaps:")
      ? { tlsOptions: { rejectUnauthorized: cfg.rejectUnauthorized } }
      : {}),
  });

/** Reads the configured display-name attribute off a search entry. */
const displayNameOf = (
  cfg: LdapConfig,
  entry: Record<string, unknown>,
  fallback: string,
) => {
  const raw = entry[cfg.displayNameAttribute];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
};

/**
 * Looks the user up with the service account and returns their DN, so the
 * password can then be checked against that exact entry. Used when
 * LDAP_BIND_DN / LDAP_SEARCH_BASE are configured, which also allows logging in
 * by mail address or restricting access to a group via LDAP_SEARCH_FILTER.
 */
const findUserDn = async (
  cfg: LdapConfig,
  username: string,
): Promise<MutationResult<{ dn: string; displayName: string; groups: string[] }>> => {
  const client = newClient(cfg);
  try {
    await client.bind(cfg.bindDn!, cfg.bindPassword ?? "");
    const { searchEntries } = await client.search(cfg.searchBase!, {
      scope: "sub",
      filter: fill(cfg.searchFilter, username, escapeFilterValue),
      attributes: ["dn", cfg.displayNameAttribute, ...(cfg.groupAttribute ? [cfg.groupAttribute] : [])],
      sizeLimit: 2,
    });

    if (searchEntries.length === 0) return { ok: false, error: INVALID };
    // An ambiguous filter must not authenticate an arbitrary one of the matches.
    if (searchEntries.length > 1) {
      console.error(
        `LDAP: filter matched ${searchEntries.length} entries for a login attempt; refusing`,
      );
      return { ok: false, error: INVALID };
    }

    const entry = searchEntries[0]!;
    return {
      ok: true,
      data: {
        dn: entry.dn,
        displayName: displayNameOf(cfg, entry, username),
        groups: attributeValues(entry, cfg.groupAttribute),
      },
    };
  } finally {
    await client.unbind().catch(() => {});
  }
};

/** All string values of `attribute` on an entry, whether single- or multi-valued. */
const attributeValues = (
  entry: Record<string, unknown>,
  attribute: string | null,
): string[] => {
  if (!attribute) return [];
  const raw = entry[attribute];
  const list = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw];
  return list.filter((v): v is string => typeof v === "string" && v.length > 0);
};

/**
 * The groups a user belongs to, as plain names.
 *
 * Two sources, because directories differ. `groupAttribute` reads them off the
 * user entry (Active Directory's `memberOf`); `groupSearchBase` searches the
 * group entries for ones listing this user, which is what plain OpenLDAP needs -
 * there `memberOf` only exists if the memberof overlay is loaded.
 *
 * A failure here is logged and yields no groups rather than failing the login:
 * being unable to determine groups must not lock everyone out, and holding no
 * groups is the restrictive outcome.
 */
const resolveGroups = async (
  cfg: LdapConfig,
  userDn: string,
  username: string,
  fromAttribute: string[],
): Promise<string[]> => {
  const names = new Set(fromAttribute.map(groupName));

  if (cfg.groupSearchBase && cfg.bindDn) {
    const client = newClient(cfg);
    try {
      await client.bind(cfg.bindDn, cfg.bindPassword ?? "");
      const { searchEntries } = await client.search(cfg.groupSearchBase, {
        scope: "sub",
        // Both go into a filter, so both need filter escaping - `{dn}` for
        // groupOfNames entries, `{username}` for posixGroup's memberUid.
        filter: cfg.groupFilter
          .replaceAll("{dn}", escapeFilterValue(userDn))
          .replaceAll("{username}", escapeFilterValue(username)),
        attributes: [cfg.groupNameAttribute],
      });
      for (const entry of searchEntries) {
        for (const value of attributeValues(entry, cfg.groupNameAttribute)) {
          names.add(value);
        }
      }
    } catch (err) {
      console.error("LDAP group lookup failed:", err);
    } finally {
      await client.unbind().catch(() => {});
    }
  }

  return [...names];
};

/**
 * `memberOf` yields a full DN; the leading RDN value is the group name, which is
 * what the access rules are written against. A plain name is passed through.
 */
const groupName = (value: string) => {
  const match = /^[A-Za-z]+=([^,]+)/.exec(value.trim());
  return match ? match[1]!.replace(/\\(.)/g, "$1") : value.trim();
};

/**
 * Verifies credentials against the given directory.
 *
 * Returns the same failure code for "no such user" and "wrong password" so the
 * form cannot be used to enumerate accounts.
 */
export const authenticateWith = async (
  cfg: LdapConfig,
  username: string,
  password: string,
): Promise<MutationResult<SessionUser>> => {
  if (!cfg.url) return { ok: false, error: "disabled" satisfies AuthError };

  const login = username.trim();
  if (!login) return { ok: false, error: INVALID };

  // Critical: many directories treat a bind with a DN but an empty password as
  // an *anonymous* bind and answer with success, which would let anyone in by
  // leaving the password field blank. Reject it before we ever reach the server.
  if (!password) return { ok: false, error: INVALID };

  let dn: string;
  let displayName = login;
  let groupsFromEntry: string[] = [];

  if (cfg.bindDn && cfg.searchBase) {
    const found = await findUserDn(cfg, login);
    if (!found.ok) return found;
    dn = found.data.dn;
    displayName = found.data.displayName;
    groupsFromEntry = found.data.groups;
  } else {
    dn = fill(cfg.userDnTemplate!, login, escapeDnValue);
  }

  const client = newClient(cfg);
  try {
    await client.bind(dn, password);
    // Only after the password checked out, so an unauthenticated caller cannot
    // use the login form to probe group membership.
    const groups = await resolveGroups(cfg, dn, login, groupsFromEntry);
    return { ok: true, data: { username: login, displayName, groups } };
  } catch (err) {
    if (err instanceof InvalidCredentialsError) {
      return { ok: false, error: INVALID };
    }
    // Anything else is our problem, not the user's: unreachable server, TLS
    // failure, bad service account. Log it, but never echo it to the browser.
    console.error("LDAP authentication error:", err);
    return { ok: false, error: "unavailable" satisfies AuthError };
  } finally {
    await client.unbind().catch(() => {});
  }
};

/** Verifies credentials against the directory this deployment is configured for. */
export const authenticate = (username: string, password: string) =>
  authenticateWith(auth.ldap, username, password);
