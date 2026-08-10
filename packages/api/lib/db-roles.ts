import { createHmac } from "node:crypto";

/**
 * The restricted database roles, and how their connections are worked out.
 *
 * There used to be one environment variable per role. That made the group of
 * settings which *cannot* move into the database grow every time a role was
 * added - and it is the one group a deployment has to type by hand. So the roles
 * are derived instead: same host, same database, different user, and a password
 * computed from the owner's.
 *
 *     password(role) = hex(HMAC-SHA256(owner password, "loramint:" + role))
 *
 * `scripts/ensure-roles.ts` and the application compute it independently and
 * arrive at the same value, so nothing has to be stored or passed anywhere. No
 * extra secret exists - not in the environment, not in the database. The owner's
 * password is the only one, and it was already required.
 *
 * Rotating it rotates all of them: the entrypoint runs ensure-roles before the
 * server, and that resets every role's password on each run.
 *
 * Kept free of the config import so it stays pure and testable - config.ts reads
 * *this*, not the other way round.
 */

export const DB_ROLES = {
  /** Reads for the whole application, and the SQL page for everyone but admins. */
  readonly: "loramint_readonly",
  /**
   * Every change made by a person on the management pages - values only.
   *
   * Deliberately without `group_name` and `public_read`; those are granted
   * column by column to `regroup` below. Correcting a reading and moving it to
   * another group are different operations, and only one of them can hand data
   * to somebody who did not have it.
   */
  manage: "loramint_manage",
  /**
   * Moving a measurement between groups, and releasing it for everyone.
   *
   * Its own role rather than two more columns on `manage`, so a member of one
   * data group cannot pull somebody else's readings into their own group even if
   * a route were ever to let them try. The database refuses it, not the form.
   */
  regroup: "loramint_regroup",
  /** The SQL page for administrators. */
  admin: "loramint_admin_sql",
  /** The webhook, and nothing else. */
  ingest: "loramint_ingest",
} as const;

export type DbRole = (typeof DB_ROLES)[keyof typeof DB_ROLES];

/**
 * The password a role gets, derived from the owner's.
 *
 * The role name goes into the message rather than the key, so two roles of the
 * same deployment cannot end up with the same password, and the prefix keeps the
 * derivation from colliding with any other use of that secret.
 */
export const rolePassword = (ownerPassword: string, role: DbRole): string => {
  if (ownerPassword.length === 0) {
    throw new Error(
      "The password in DATABASE_URL is empty, so the restricted database roles " +
        "cannot be derived from it - they would all share a password anybody " +
        "could compute. Give the owner role a password.",
    );
  }
  return createHmac("sha256", ownerPassword)
    .update(`loramint:${role}`)
    .digest("hex")
    .slice(0, 32);
};

/**
 * The connection string for `role`, built from the owner's.
 *
 * Everything but user and password is taken over unchanged - host, port,
 * database, and any query parameters such as `sslmode`. A deployment configures
 * those once and they hold for every role.
 */
export const roleDsn = (ownerDsn: string, role: DbRole): string => {
  let url: URL;
  try {
    url = new URL(ownerDsn);
  } catch {
    throw new Error(
      `DATABASE_URL is not a connection string this server can read, so the ` +
        `${role} role cannot be derived from it.`,
    );
  }

  const ownerPassword = decodeURIComponent(url.password);
  url.username = encodeURIComponent(role);
  url.password = encodeURIComponent(rolePassword(ownerPassword, role));
  return url.toString();
};

/** The owner's own role name, for the checks that must refuse to touch it. */
export const ownerRole = (ownerDsn: string): string | null => {
  try {
    return decodeURIComponent(new URL(ownerDsn).username) || null;
  } catch {
    return null;
  }
};
