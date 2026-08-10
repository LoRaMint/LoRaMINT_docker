import { createHash, timingSafeEqual } from "node:crypto";
import { CATALOG } from "./lib/config-catalog";
import { storedSetting } from "./lib/settings-store";
import { DB_ROLES, roleDsn } from "./lib/db-roles";

/**
 * The connection every restricted role is reached through, worked out from
 * DATABASE_URL rather than configured separately.
 *
 * One environment variable per role made the group that *cannot* move into the
 * database grow with every role added - and that is the group somebody has to
 * type by hand. See lib/db-roles.ts for how the passwords are derived and why
 * nothing has to be stored.
 */
const ownerDsn = () => Bun.env.DATABASE_URL ?? "";

/**
 * Settings that live in the database rather than in the environment.
 *
 * The catalogue already says which those are, so the two cannot drift: a setting
 * marked `movable` there is read from the table here, and its environment
 * variable is ignored. See docs/konfiguration-verwalten.md for where the line
 * runs - in short, everything needed *before* the application can reach the
 * table stays outside it, and so does everything the security model rests on.
 *
 * Values of this kind are read lazily, through getters on the exported objects.
 * They have to be: this module is evaluated while the process starts, and the
 * table is not read until a moment later.
 */
const MOVABLE = new Set(
  CATALOG.filter((setting) => setting.tier === "movable").map((s) => s.key),
);

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
  // A movable setting comes from the table and from nowhere else. The
  // environment is not consulted as a fallback on purpose: two places for one
  // value is how a compose file and the actual behaviour drift apart, which is
  // exactly the class of confusion this whole change exists to end.
  if (MOVABLE.has(key)) return storedSetting(key);
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
 * The role is created by scripts/ensure-roles.ts and reached through a
 * connection derived from DATABASE_URL - see lib/db-roles.ts.
 */

export const sqlConsole = {
  /**
   * Whether the page exists at all. It used to be decided by whether a
   * connection string had been configured; now the role always exists, so this
   * is a setting of its own - switchable where one goes looking for it rather
   * than by leaving a variable out.
   */
  get enabled() {
    return optional("SQL_CONSOLE_ENABLED") !== "false";
  },
  get databaseUrl() {
    return roleDsn(ownerDsn(), DB_ROLES.readonly);
  },
  get adminDatabaseUrl() {
    return roleDsn(ownerDsn(), DB_ROLES.admin);
  },
  /**
   * How many rows a result may show. The cap is applied inside the database, so
   * raising it costs rendering time and page weight, not database work - roughly
   * 240 bytes and 0.1 ms of HTML per row for a typical measurement row.
   */
  // Getters: these live in the settings table, which is read after this module
  // is evaluated. Reading them on use is also what makes a change take effect
  // without a restart.
  get maxRows() {
    return optionalInt("QUERY_MAX_ROWS", 200);
  },
  get timeoutMs() {
    return optionalInt("QUERY_TIMEOUT_MS", 5000);
  },
};

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
 * Created by scripts/ensure-roles.ts and reached through a connection derived
 * from DATABASE_URL - see lib/db-roles.ts.
 */

export const manage = {
  /**
   * Whether data may be changed at all. Decided by a setting rather than by
   * whether a connection string happens to be configured: the role now always
   * exists, and a deployment that wants a read-only installation should be able
   * to say so where the other settings are.
   */
  get writable() {
    return optional("DATA_EDITING_ENABLED") !== "false";
  },
  get databaseUrl() {
    return roleDsn(ownerDsn(), DB_ROLES.manage);
  },
  /**
   * Ceiling for a single delete. A deletion that runs for minutes holds locks on
   * the table the webhook is inserting into, so beyond this the page asks for a
   * narrower filter instead.
   */
  get maxDeleteRows() {
    return optionalInt("MANAGE_MAX_DELETE", 10000);
  },
  /** Longer than the SQL console's: a bulk delete legitimately takes a while. */
  get timeoutMs() {
    return optionalInt("MANAGE_TIMEOUT_MS", 30000);
  },
};

/**
 * The connection the webhook inserts through.
 *
 * Its own role, with INSERT on the two data tables and nothing else - no SELECT,
 * no UPDATE, no DELETE. The webhook is the only route reachable from outside
 * that writes, so it gets the narrowest rights in the whole application; it
 * reads nothing, so it may read nothing.
 */
export const ingest = {
  get databaseUrl() {
    return roleDsn(ownerDsn(), DB_ROLES.ingest);
  },
};

/**
 * The connection that may move a measurement between groups, and nothing else.
 *
 * Separate from `manage` on purpose: that role is granted UPDATE column by
 * column and does not hold `group_name` or `public_read`, so the ordinary
 * correction path cannot reassign data. See services/connections.ts.
 */
export const regroup = {
  get databaseUrl() {
    return roleDsn(ownerDsn(), DB_ROLES.regroup);
  },
};

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
export const ttn = {
  get enabled() {
    return this.apiKey !== null && this.applicationId !== null;
  },
  get apiKey() {
    return optional("TTN_API_KEY");
  },
  get applicationId() {
    return optional("TTN_APPLICATION_ID");
  },
  /** The cluster the application lives in, without a trailing slash. */
  get url() {
    return (
      optional("TTN_URL") ?? "https://eu1.cloud.thethings.network"
    ).replace(/\/+$/, "");
  },
  get timeoutMs() {
    return optionalInt("TTN_TIMEOUT_MS", 5000);
  },
  /**
   * What every device registered from here gets. These are properties of the
   * deployment, not of the individual device: one school, one region, one kind
   * of module, so the form states them rather than asking. The defaults are what
   * the devices registered by hand so far already use.
   */
  get frequencyPlan() {
    return optional("TTN_FREQUENCY_PLAN") ?? "EU_863_870_TTN";
  },
  get lorawanVersion() {
    return optional("TTN_LORAWAN_VERSION") ?? "MAC_V1_0_3";
  },
  /**
   * `PHY_V1_0_3_REV_A`, not `RP001_V1_0_3_REV_A`. The Things Stack accepts the
   * second as an alias but stores and returns the first, so using the alias here
   * made the registration form and the device page name the same setting
   * differently - measured against the real thing, not assumed. The console
   * spells it out as "RP001 Regional Parameters 1.0.3 revision A".
   */
  get regionalParameters() {
    return optional("TTN_REGIONAL_PARAMETERS") ?? "PHY_V1_0_3_REV_A";
  },
};

/**
 * TTN_API_KEY now lives in the settings table while TTN_APP_KEY stays in the
 * environment, so this can no longer be decided while the module is evaluated -
 * the table has not been read yet. It moves into `validateConfig()` below, which
 * runs once the settings are in.
 */
const checkTtnKeys = () => {
  if (ttn.apiKey === null || ttn.apiKey !== config.appKey) return;
  throw new Error(
    "TTN_API_KEY must not be the same value as TTN_APP_KEY: the first is a " +
      "credential that may register devices and read their root keys, the " +
      "second is only the shared word the TTN webhook sends with an uplink. " +
      "Setting them to one value means whoever can read the webhook " +
      "configuration in TTN can also administer the application.",
  );
};

export const legal = {
  get impressum() {
    return optional("LEGAL_IMPRESSUM");
  },
  get datenschutz() {
    return optional("LEGAL_DATENSCHUTZ");
  },
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
export const auth = {
  // Getters throughout: the directory settings live in the settings table, and
  // that is read after this module is evaluated. `enabled` in particular is
  // asked while the routes are registered, which is why index.ts loads the
  // settings before it imports the pages.
  get enabled() {
    return this.ldap.url !== null;
  },
  ldap: {
    get url() {
      return optional("LDAP_URL");
    },
    get userDnTemplate() {
      return optional("LDAP_USER_DN_TEMPLATE");
    },
    get bindDn() {
      return optional("LDAP_BIND_DN");
    },
    get bindPassword() {
      return optional("LDAP_BIND_PASSWORD");
    },
    get searchBase() {
      return optional("LDAP_SEARCH_BASE");
    },
    get searchFilter() {
      return optional("LDAP_SEARCH_FILTER") ?? "(uid={username})";
    },
    // Attribute used as the display name in the header; falls back to the login name.
    get displayNameAttribute() {
      return optional("LDAP_DISPLAY_NAME_ATTRIBUTE") ?? "cn";
    },
    // Group membership, used to decide what a user may do. Two ways to get it,
    // both optional - without either, users simply hold no groups:
    //   groupAttribute    an attribute on the user entry, e.g. memberOf (which
    //                     Active Directory provides, but OpenLDAP only with the
    //                     memberof overlay loaded).
    //   groupSearchBase   search the group entries instead, with groupFilter -
    //                     works with plain groupOfNames and needs no overlay.
    get groupAttribute() {
      return optional("LDAP_GROUP_ATTRIBUTE");
    },
    get groupSearchBase() {
      return optional("LDAP_GROUP_SEARCH_BASE");
    },
    get groupFilter() {
      return optional("LDAP_GROUP_FILTER") ?? "(member={dn})";
    },
    get groupNameAttribute() {
      return optional("LDAP_GROUP_NAME_ATTRIBUTE") ?? "cn";
    },
    // Only ever set this to false against a test directory.
    get rejectUnauthorized() {
      return optional("LDAP_TLS_REJECT_UNAUTHORIZED") !== "false";
    },
    get timeoutMs() {
      return optionalInt("LDAP_TIMEOUT_MS", 5000);
    },
  },
  // The directory's own user administration, linked from the login form as
  // "Passwort ändern in der Nutzerverwaltung". Passwords belong to the directory
  // and not to this application, so this points at whatever owns them - lldap's
  // interface, a school portal. Unset, the form says to ask the administration.
  get passwordResetUrl() {
    return optional("LDAP_PASSWORD_RESET_URL");
  },
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
  get dataGroup() {
    return optional("LDAP_DATA_GROUP");
  },
  get managementGroup() {
    return optional("LDAP_MANAGEMENT_GROUP");
  },
  get adminGroup() {
    return optional("LDAP_ADMIN_GROUP");
  },
  session: {
    // Signing key for the session cookie. Required once the login is enabled;
    // rotating it invalidates all existing sessions.
    secret: optional("SESSION_SECRET"),
    get ttlHours() {
      return optionalInt("SESSION_TTL_HOURS", 8);
    },
    // The Secure flag would make the cookie unusable over plain http, so it is
    // only dropped in development.
    secureCookie: Bun.env.NODE_ENV === "production",
  },
};

//====================================
// THE SETUP ACCOUNT
//====================================

/**
 * A local administrator beside the directory, for getting in before there is
 * one.
 *
 * It exists so that a fresh server can be configured at all: without it there is
 * no login without LDAP, and therefore no way to reach the pages on which LDAP
 * itself will eventually be configured. It is meant for one person doing that
 * job, not as a replacement for the directory - everyone else signs in through
 * LDAP as before and gets their roles from their groups.
 *
 * It is checked *before* the directory, and a username that matches is decided
 * locally and only locally: a wrong password is refused rather than passed on.
 * That keeps the name unambiguously the setup account's, and no difference in
 * response time betrays which path answered.
 *
 * Two ways to give it a password. `ADMIN_PASSWORD_HASH` is the one to use -
 * whoever reads the environment then holds a hash and not a way in, which
 * matters because an environment is read by `docker inspect`, by the container
 * platform's interface and by anyone who is sent a copy of it. `ADMIN_PW` in the
 * clear is allowed for convenience and says so in the log on every start.
 * Generate a hash with `bun scripts/hash-password.ts`.
 */
const setupUsername = optional("ADMIN_USERNAME");
const setupPasswordHash = optional("ADMIN_PASSWORD_HASH");
const setupPassword = optional("ADMIN_PW");

export const setupAccount = {
  enabled:
    setupUsername !== null &&
    (setupPasswordHash !== null || setupPassword !== null),
  username: setupUsername,
  /** Preferred. When present, `password` is ignored. */
  passwordHash: setupPasswordHash,
  password: setupPassword,
};

if (setupUsername !== null && !setupAccount.enabled) {
  throw new Error(
    "ADMIN_USERNAME is set, so one of ADMIN_PASSWORD_HASH or ADMIN_PW is " +
      "required. Generate a hash with: bun scripts/hash-password.ts",
  );
}
if (setupAccount.enabled && setupPasswordHash === null) {
  console.warn(
    "config: ADMIN_PW holds a password in clear text. Anyone who can read this " +
      "server's environment - through `docker inspect`, the container platform " +
      "or a copy of the compose file - can sign in as an administrator. Prefer " +
      "ADMIN_PASSWORD_HASH; generate one with: bun scripts/hash-password.ts",
  );
}
if (setupAccount.enabled && setupPasswordHash !== null && setupPassword !== null) {
  console.warn(
    "config: both ADMIN_PASSWORD_HASH and ADMIN_PW are set. The hash is used " +
      "and ADMIN_PW is ignored - remove it so the clear-text password does not " +
      "linger in the environment.",
  );
}

/**
 * Fails fast on a login that is switched on but cannot work, instead of letting
 * every sign-in attempt error at runtime.
 *
 * The session checks cover the setup account too: it signs in and therefore
 * needs a cookie, whether or not a directory is configured.
 */
/**
 * The checks that used to run while this module was evaluated.
 *
 * They cannot any more: the directory settings live in the settings table, and
 * that is read a moment after this module loads. Called from index.ts once the
 * settings are in - before a single request is served, so a deployment that
 * cannot work still fails at startup rather than on every sign-in attempt.
 */
export const validateConfig = () => {
  if (auth.enabled || setupAccount.enabled) {
    if (!auth.session.secret) {
      throw new Error(
        auth.enabled
          ? "LDAP_URL is set, so SESSION_SECRET is required"
          : "ADMIN_USERNAME is set, so SESSION_SECRET is required",
      );
    }
    if (auth.session.secret.length < 32) {
      throw new Error("SESSION_SECRET must be at least 32 characters");
    }
  }

  if (auth.enabled) {
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

  checkTtnKeys();
};
