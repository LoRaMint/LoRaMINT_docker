import type { SessionUser } from "./session";

/**
 * What a signed-in user is allowed to do, derived from their directory groups.
 *
 * Three levels, each one containing the one below it:
 *
 *   data        LDAP_DATA_GROUP        read-only: "Daten > SQL".
 *   management  LDAP_MANAGEMENT_GROUP  the above, plus the "Verwaltung"
 *                                      section - editing measurements and
 *                                      devices.
 *   admin       LDAP_ADMIN_GROUP       the above, plus the SQL page on a
 *                                      connection that may write.
 *
 * Because it is a ladder, a person needs exactly one group: putting someone in
 * the admin group is enough, they do not also have to be in the other two. That
 * is the whole point of the ordering - a permission model where you can forget
 * to grant a lower level is one that will be got wrong eventually.
 */
export type Role = "data" | "management" | "admin";

/** The levels, weakest first. A role includes every role before it. */
const LADDER = ["data", "management", "admin"] as const;

export type RoleConfig = {
  /** Group granting the data level, or null when no restriction is configured. */
  dataGroup: string | null;
  /** Group granting the management level. Null means nobody reaches it. */
  managementGroup: string | null;
  /** Group granting the admin level. Null means nobody reaches it. */
  adminGroup: string | null;
};

const inGroup = (user: SessionUser, group: string | null) =>
  group !== null && user.groups.includes(group);

/**
 * How far up the ladder `user` gets: the index of their highest level, or -1
 * when they hold none.
 */
const levelOf = (user: SessionUser | null, config: RoleConfig): number => {
  if (!user) return -1;
  // The local setup account authenticated against the environment and holds no
  // directory groups, so none of the checks below could ever grant it anything.
  // It is the way in before a directory is configured - and that is only useful
  // at the top of the ladder, where the configuration pages are.
  if (user.setup) return LADDER.indexOf("admin");
  if (inGroup(user, config.adminGroup)) return LADDER.indexOf("admin");
  if (inGroup(user, config.managementGroup)) return LADDER.indexOf("management");
  // No group configured: every signed-in user may read, which is what a
  // deployment that never set this up expects. The two levels above always need
  // their group - configured-but-held-by-nobody would otherwise be
  // indistinguishable from unconfigured.
  if (config.dataGroup === null || inGroup(user, config.dataGroup)) {
    return LADDER.indexOf("data");
  }
  return -1;
};

/** Whether `user` reaches at least `role`. */
export const hasRole = (
  user: SessionUser | null,
  role: Role,
  config: RoleConfig,
): boolean => levelOf(user, config) >= LADDER.indexOf(role);

/** Every level `user` reaches, weakest first. */
export const rolesOf = (user: SessionUser | null, config: RoleConfig): Role[] =>
  LADDER.slice(0, levelOf(user, config) + 1) as Role[];
