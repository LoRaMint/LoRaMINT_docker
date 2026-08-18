import type { SessionUser } from "./session";

/**
 * What a signed-in user is allowed to do.
 *
 * **This used to be a ladder** - `data` ⊂ `management` ⊂ `admin`, so being in the
 * admin group was enough to get everything below it. It is not one any more. The
 * four groups now name four separate areas of responsibility that do not
 * contain one another:
 *
 *   data        LDAP_DATA_GROUP        measurements of *every* group: read,
 *                                      correct, and move between groups.
 *   management  LDAP_MANAGEMENT_GROUP  devices: register, rename, and decide
 *                                      which group a device's readings belong
 *                                      to. No measurement editing.
 *   admin       LDAP_ADMIN_GROUP       everything, including configuration, the
 *                                      declaration of data groups and the
 *                                      writable SQL console.
 *   board       LDAP_BOARD_GROUP       curates the public /board page: which
 *                                      measurements appear there and with what
 *                                      display range. Nothing else.
 *
 * Someone who only manages devices no longer edits measurements, and someone who
 * only edits measurements does not touch devices. Whoever needs both is put in
 * both groups.
 *
 * **There is a fourth source of rights, and it is not on this list.** Membership
 * of a *data group* - see services/data-groups.ts - carries read and write on
 * that group's measurements, on its own, without any of the three roles. That is
 * deliberately not modelled as a role: a role says what kind of thing you may
 * do, a data group says which rows it applies to. `dataScope` below is where the
 * two meet.
 *
 * `admin` remains the one containing role, because "admin may do everything" is
 * the property that keeps a locked-out deployment recoverable.
 */
export type Role = "data" | "management" | "admin" | "board";

const ROLES: readonly Role[] = ["data", "management", "admin", "board"] as const;

export type RoleConfig = {
  /** Group granting the data role, or null when no restriction is configured. */
  dataGroup: string | null;
  /** Group granting the management role. Null means nobody reaches it. */
  managementGroup: string | null;
  /** Group granting the admin role. Null means nobody reaches it. */
  adminGroup: string | null;
  /** Group granting the board role. Null means nobody reaches it. */
  boardGroup: string | null;
};

const groupFor = (role: Role, config: RoleConfig): string | null => {
  switch (role) {
    case "data":
      return config.dataGroup;
    case "management":
      return config.managementGroup;
    case "admin":
      return config.adminGroup;
    case "board":
      return config.boardGroup;
  }
};

const inGroup = (user: SessionUser, group: string | null) =>
  group !== null && user.groups.includes(group);

/**
 * Whether `user` holds `role`.
 *
 * No ordering: holding `management` says nothing about `data`. The two
 * exceptions are stated where they are decided, not hidden in a comparison.
 */
export const hasRole = (
  user: SessionUser | null,
  role: Role,
  config: RoleConfig,
): boolean => {
  if (!user) return false;

  // The local setup account authenticated against the environment and holds no
  // directory groups at all, so nothing below could ever grant it anything. It
  // exists to configure a server that has no directory yet - which is only
  // useful if it can reach everything.
  if (user.setup) return true;

  // Admin contains the others. Not a ladder: the two below do not contain each
  // other, and this is the single line that makes an exception.
  if (inGroup(user, config.adminGroup)) return true;

  // An unconfigured data group means every signed-in user may read, which is
  // what a deployment that never set this up expects. The other two always need
  // their group - configured-but-held-by-nobody must not be indistinguishable
  // from unconfigured, or editing rights get granted by accident.
  if (role === "data" && config.dataGroup === null) return true;

  return inGroup(user, groupFor(role, config));
};

/** Every role `user` holds, for display. */
export const rolesOf = (user: SessionUser | null, config: RoleConfig): Role[] =>
  ROLES.filter((role) => hasRole(user, role, config));

/**
 * Which measurements this user may see and change.
 *
 * `"all"` for the data role and for administrators; otherwise the data groups
 * they are in, which may be none. This is what `services/connections.ts` turns
 * into the session variables the row-level policies read, and what the route
 * guards use to decide whether the management pages are worth showing at all.
 *
 * An empty array is a real answer and means "nothing beyond what is public" -
 * not an error, and not a reason to fall back to showing everything.
 */
export const dataScope = (
  user: SessionUser | null,
  config: RoleConfig,
  declaredGroups: readonly string[],
): "all" | string[] => {
  if (!user) return [];
  if (hasRole(user, "data", config)) return "all";

  const declared = new Set(declaredGroups);
  return user.groups.filter((group) => declared.has(group));
};

/** Whether this user reaches the measurement pages at all. */
export const canReachData = (
  user: SessionUser | null,
  config: RoleConfig,
  declaredGroups: readonly string[],
): boolean => {
  const scope = dataScope(user, config, declaredGroups);
  return scope === "all" || scope.length > 0;
};
