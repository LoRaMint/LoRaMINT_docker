import { createHash, timingSafeEqual } from "node:crypto";

const requireEnv = (key: string) => {
  const value = Bun.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
};

/**
 * An optional setting's value, or null when it is unset *or* set to nothing.
 *
 * The second half matters more than it looks. Docker Compose passes a variable
 * it cannot resolve through as an empty string rather than leaving it out, so
 * `LDAP_URL=${LDAP_URL}` with nothing behind it would otherwise switch the login
 * on - `"" !== null` - and the server would then refuse to start for want of a
 * session secret. Treating empty as absent is what lets one compose file serve a
 * deployment that wants none of the optional features.
 */
const optional = (key: string) => {
  const value = Bun.env[key];
  return value !== undefined && value.trim().length > 0 ? value : null;
};

/** The same for a number, falling back on anything that is not one. */
const optionalInt = (key: string, fallback: number) => {
  const value = optional(key);
  const parsed = value === null ? Number.NaN : Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const config = {
  appKey: requireEnv("TTN_APP_KEY"),
  port: optionalInt("PORT", 8090),
  /**
   * How many reverse proxies sit in front of this server.
   *
   * Only the login throttle uses it, and only to tell one visitor from another:
   * behind Traefik every request arrives from Traefik, so without this the
   * throttle would count all visitors as one and six wrong passwords anywhere
   * would lock the whole site out. See lib/client-address.ts for how the header
   * is read.
   *
   * The default of 1 matches compose.prod.yml, which always puts Traefik in
   * front. Set it to 0 for a server reachable directly - believing
   * `X-Forwarded-For` from an unproxied client means believing whatever the
   * client felt like writing.
   */
  trustedProxies: optionalInt("TRUSTED_PROXIES", 1),
};

const appKeyHash = createHash("sha256").update(config.appKey).digest();

/**
 * Constant-time comparison of a candidate webhook key against TTN_APP_KEY.
 * Both sides are hashed to a fixed length first, so neither the result nor the
 * key length leaks through timing.
 */
export const verifyAppKey = (candidate: string | undefined): boolean => {
  if (!candidate) return false;
  return timingSafeEqual(
    createHash("sha256").update(candidate).digest(),
    appKeyHash,
  );
};

/**
 * The /sql page, which lets signed-in users run ad-hoc queries.
 *
 * Opt-in, and deliberately on a *separate* connection: the application's own
 * DATABASE_URL owns the schema and, in the default Docker setup, is a superuser.
 * Queries cannot be made read-only on such a connection - a superuser can read
 * server files with pg_read_file(), read password hashes from pg_authid and run
 * shell commands via COPY ... TO PROGRAM, none of which a READ ONLY transaction
 * stops, because none of them writes to the database. Without a restricted role
 * the page therefore does not exist at all.
 *
 * Create the role with dev_scripts/create-readonly-role.sql.
 */
const readonlyDatabaseUrl = optional("DATABASE_URL_READONLY");

/**
 * The Admin > SQL page lets administrators submit arbitrary statements, writes
 * included, so it needs a connection that may write - but still not the
 * application's own, which is a superuser in the default Docker setup and would
 * make the page equivalent to shell access on the database host. Use the role
 * from dev_scripts/create-admin-role.sql. Unset means the page does not exist.
 */
const adminDatabaseUrl = optional("DATABASE_URL_ADMIN");

export const sqlConsole = {
  enabled: readonlyDatabaseUrl !== null,
  databaseUrl: readonlyDatabaseUrl,
  adminDatabaseUrl,
  /**
   * How many rows a result may show. The cap is applied inside the database, so
   * raising it costs rendering time and page weight, not database work - roughly
   * 240 bytes and 0.1 ms of HTML per row for a typical measurement row.
   */
  maxRows: optionalInt("QUERY_MAX_ROWS", 200),
  timeoutMs: optionalInt("QUERY_TIMEOUT_MS", 5000),
};

if (adminDatabaseUrl && adminDatabaseUrl === optional("DATABASE_URL")) {
  throw new Error(
    "DATABASE_URL_ADMIN must not be the application's own DATABASE_URL: " +
      "that role owns the schema and is typically a superuser, which would let " +
      "the Admin SQL page read server files and run shell commands. " +
      "See packages/api/dev_scripts/create-admin-role.sql.",
  );
}

//====================================
// DATA MANAGEMENT
//====================================

/**
 * The connection the management pages write through.
 *
 * Reading stays on the application's own connection like everywhere else; only
 * changes and deletions go through this one. The reason is the change log: the
 * pages must be able to append to `audit_log` but never to rewrite it, and that
 * is a property of the database role, not a promise the page makes about itself.
 * On DATABASE_URL - the schema owner, a superuser in the default Docker setup -
 * no such guarantee exists.
 *
 * Optional, and its absence is not an error: without it the management pages
 * still open, but read-only, and say why. A deployment that has not set up the
 * role does not hand out write access by accident.
 *
 * Create the role with scripts/ensure-roles.ts (run from the entrypoint) or by
 * hand with dev_scripts/create-manage-role.sql.
 */
const manageDatabaseUrl = optional("DATABASE_URL_MANAGE");

export const manage = {
  /** True when changes and deletions are possible at all. */
  writable: manageDatabaseUrl !== null,
  databaseUrl: manageDatabaseUrl,
  /**
   * Ceiling for a single delete. A deletion that runs for minutes holds locks on
   * the table the webhook is inserting into, so beyond this the page asks for a
   * narrower filter instead.
   */
  maxDeleteRows: optionalInt("MANAGE_MAX_DELETE", 10000),
  /** Longer than the SQL console's: a bulk delete legitimately takes a while. */
  timeoutMs: optionalInt("MANAGE_TIMEOUT_MS", 30000),
};

if (manageDatabaseUrl && manageDatabaseUrl === optional("DATABASE_URL")) {
  throw new Error(
    "DATABASE_URL_MANAGE must not be the application's own DATABASE_URL: " +
      "that role owns the schema and may rewrite audit_log, which would make " +
      "the change log worthless as a record. " +
      "See packages/api/dev_scripts/create-manage-role.sql.",
  );
}

//====================================
// DEVICE MANAGEMENT (TTN)
//====================================

/**
 * The key the device pages talk to The Things Stack with.
 *
 * Not to be confused with TTN_APP_KEY above, however similar the names look.
 * That one is a word the webhook sends us and we compare; this one is a key that
 * may *change* the application in TTN - register devices, set their root keys,
 * read them back. Swapping the two would put the webhook secret into the TTN
 * console and a management credential into every environment file, so the check
 * below refuses to start rather than let that pass unnoticed.
 *
 * Opt-in like every other optional feature: without both the key and the
 * application id the device page stays the announcement it is today, and no
 * request ever leaves this server for TTN.
 *
 * The key needs these rights on the application (TTN console > API keys):
 * read and write end devices, and read and write their keys - the last one
 * because an OTAA device is registered with its AppKey and because the detail
 * page can show it again to administrators.
 */
const ttnApiKey = optional("TTN_API_KEY");
const ttnApplicationId = optional("TTN_APPLICATION_ID");

export const ttn = {
  enabled: ttnApiKey !== null && ttnApplicationId !== null,
  apiKey: ttnApiKey,
  applicationId: ttnApplicationId,
  /** The cluster the application lives in, without a trailing slash. */
  url: (optional("TTN_URL") ?? "https://eu1.cloud.thethings.network").replace(
    /\/+$/,
    "",
  ),
  timeoutMs: optionalInt("TTN_TIMEOUT_MS", 5000),
  /**
   * What every device registered from here gets. These are properties of the
   * deployment, not of the individual device: one school, one region, one kind
   * of module, so the form states them rather than asking. The defaults are what
   * the devices registered by hand so far already use.
   */
  frequencyPlan: optional("TTN_FREQUENCY_PLAN") ?? "EU_863_870_TTN",
  lorawanVersion: optional("TTN_LORAWAN_VERSION") ?? "MAC_V1_0_3",
  /**
   * `PHY_V1_0_3_REV_A`, not `RP001_V1_0_3_REV_A`. The Things Stack accepts the
   * second as an alias but stores and returns the first, so using the alias here
   * made the registration form and the device page name the same setting
   * differently - measured against the real thing, not assumed. The console
   * spells it out as "RP001 Regional Parameters 1.0.3 revision A".
   */
  regionalParameters: optional("TTN_REGIONAL_PARAMETERS") ?? "PHY_V1_0_3_REV_A",
};

if (ttnApiKey && ttnApiKey === config.appKey) {
  throw new Error(
    "TTN_API_KEY must not be the same value as TTN_APP_KEY: the first is a " +
      "credential that may register devices and read their root keys, the " +
      "second is only the shared word the TTN webhook sends with an uplink. " +
      "Setting them to one value means whoever can read the webhook " +
      "configuration in TTN can also administer the application.",
  );
}

export const legal = {
  impressum: optional("LEGAL_IMPRESSUM"),
  datenschutz: optional("LEGAL_DATENSCHUTZ"),
};

//====================================
// AUTHENTICATION (LDAP)
//====================================

/**
 * LDAP login, configured entirely through environment variables. The whole
 * feature is opt-in: without `LDAP_URL` there is no login route and no login
 * button, so a deployment that does not set it keeps working exactly as before.
 *
 * Two bind strategies are supported, picked by which variables are present:
 *
 *   direct bind    LDAP_USER_DN_TEMPLATE, e.g.
 *                  "uid={username},ou=people,dc=example,dc=org"
 *                  The user's DN is built from the template and bound with the
 *                  submitted password. No service account needed, but requires
 *                  the DN to be derivable from the login name.
 *
 *   search + bind  LDAP_BIND_DN + LDAP_BIND_PASSWORD (a service account),
 *                  LDAP_SEARCH_BASE and LDAP_SEARCH_FILTER, e.g.
 *                  "(&(uid={username})(memberOf=cn=loramint,ou=groups,dc=example,dc=org))"
 *                  The service account looks the user up, then the found DN is
 *                  bound with the submitted password. Use this to allow login by
 *                  mail address or to restrict access to a group - the filter is
 *                  the place to express that.
 *
 * `{username}` is the only placeholder, and it is escaped before substitution
 * (RFC 4514 for DNs, RFC 4515 for filters) - see services/ldap.ts.
 */
const ldapUrl = optional("LDAP_URL");

export const auth = {
  enabled: ldapUrl !== null,
  ldap: {
    url: ldapUrl,
    userDnTemplate: optional("LDAP_USER_DN_TEMPLATE"),
    bindDn: optional("LDAP_BIND_DN"),
    bindPassword: optional("LDAP_BIND_PASSWORD"),
    searchBase: optional("LDAP_SEARCH_BASE"),
    searchFilter: optional("LDAP_SEARCH_FILTER") ?? "(uid={username})",
    // Attribute used as the display name in the header; falls back to the login name.
    displayNameAttribute: optional("LDAP_DISPLAY_NAME_ATTRIBUTE") ?? "cn",
    // Group membership, used to decide what a user may do. Two ways to get it,
    // both optional - without either, users simply hold no groups:
    //   groupAttribute    an attribute on the user entry, e.g. memberOf (which
    //                     Active Directory provides, but OpenLDAP only with the
    //                     memberof overlay loaded).
    //   groupSearchBase   search the group entries instead, with groupFilter -
    //                     works with plain groupOfNames and needs no overlay.
    groupAttribute: optional("LDAP_GROUP_ATTRIBUTE"),
    groupSearchBase: optional("LDAP_GROUP_SEARCH_BASE"),
    groupFilter: optional("LDAP_GROUP_FILTER") ?? "(member={dn})",
    groupNameAttribute: optional("LDAP_GROUP_NAME_ATTRIBUTE") ?? "cn",
    // Only ever set this to false against a test directory.
    rejectUnauthorized: Bun.env.LDAP_TLS_REJECT_UNAUTHORIZED !== "false",
    timeoutMs: optionalInt("LDAP_TIMEOUT_MS", 5000),
  },
  // The directory's own user administration, linked from the login form as
  // "Passwort ändern in der Nutzerverwaltung". Passwords belong to the directory
  // and not to this application, so this points at whatever owns them - lldap's
  // interface, a school portal. Unset, the form says to ask the administration.
  passwordResetUrl: optional("LDAP_PASSWORD_RESET_URL"),
  /**
   * Directory groups that grant privileges in the application. See lib/roles.ts
   * for what each one unlocks.
   *
   * The defaults are not symmetric, on purpose. An unset LDAP_DATA_GROUP means
   * "no restriction configured", so every signed-in user keeps the read-only
   * query page. Unset LDAP_MANAGEMENT_GROUP and LDAP_ADMIN_GROUP mean nobody
   * holds those roles: a deployment that has not configured them must never hand
   * out editing rights or write access to the database by accident.
   */
  dataGroup: optional("LDAP_DATA_GROUP"),
  managementGroup: optional("LDAP_MANAGEMENT_GROUP"),
  adminGroup: optional("LDAP_ADMIN_GROUP"),
  session: {
    // Signing key for the session cookie. Required once the login is enabled;
    // rotating it invalidates all existing sessions.
    secret: optional("SESSION_SECRET"),
    ttlHours: optionalInt("SESSION_TTL_HOURS", 8),
    // The Secure flag would make the cookie unusable over plain http, so it is
    // only dropped in development.
    secureCookie: Bun.env.NODE_ENV === "production",
  },
};

/**
 * Fails fast on a login that is switched on but cannot work, instead of letting
 * every sign-in attempt error at runtime.
 */
if (auth.enabled) {
  if (!auth.session.secret) {
    throw new Error("LDAP_URL is set, so SESSION_SECRET is required");
  }
  if (auth.session.secret.length < 32) {
    throw new Error("SESSION_SECRET must be at least 32 characters");
  }
  const directBind = auth.ldap.userDnTemplate !== null;
  const searchBind =
    auth.ldap.bindDn !== null && auth.ldap.searchBase !== null;
  if (!directBind && !searchBind) {
    throw new Error(
      "LDAP_URL is set, so either LDAP_USER_DN_TEMPLATE (direct bind) or " +
        "LDAP_BIND_DN + LDAP_SEARCH_BASE (search and bind) is required",
    );
  }
}
