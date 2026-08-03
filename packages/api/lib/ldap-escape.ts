/**
 * Escaping for the values substituted into LDAP DN templates and search filters.
 *
 * Kept separate from services/ldap.ts so it stays pure and testable: that module
 * imports the config, which requires environment variables to be present.
 */

/**
 * Escapes a value for use inside a search filter (RFC 4515).
 *
 * Without this, a login name like `*)(uid=admin` would rewrite the filter and
 * let an attacker match a different account than the one whose password they
 * know, and a bare `*` would turn the lookup into a wildcard.
 */
export const escapeFilterValue = (value: string) =>
  value.replace(/[\\*()\0]/g, (c) => {
    switch (c) {
      case "\\":
        return "\\5c";
      case "*":
        return "\\2a";
      case "(":
        return "\\28";
      case ")":
        return "\\29";
      default:
        return "\\00";
    }
  });

/**
 * Escapes a value for use inside a distinguished name (RFC 4514), so a login
 * name cannot inject extra RDNs into the DN template - `service,ou=system`
 * would otherwise resolve to a different entry entirely.
 */
export const escapeDnValue = (value: string) => {
  const escaped = value.replace(/[\\,+"<>;=\0]/g, (c) =>
    c === "\0" ? "\\00" : `\\${c}`,
  );
  // A leading '#' or a leading/trailing space has to be escaped as well.
  return escaped.replace(/^([#\s])/, "\\$1").replace(/(\s)$/, "\\$1");
};

/** Substitutes the single `{username}` placeholder, escaping with `escape`. */
export const fillUsername = (
  template: string,
  username: string,
  escape: (value: string) => string,
) => template.replaceAll("{username}", escape(username));
