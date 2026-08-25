import { sql } from "bun"
import { DB_ROLES, ownerRole, rolePassword, type DbRole } from "../lib/db-roles"

/**
 * Creates and updates the restricted database roles the application connects
 * through, so a deployment does not need a psql session on the server.
 *
 * Run from the entrypoint *after* the migrations: the per-table grants below
 * need the tables to exist. dev_scripts/ROLLEN.md carries the reasoning behind
 * each grant, and says what this script deliberately does not do.
 *
 * Three properties worth knowing:
 *
 *   Additive, with one documented exception. Roles are created when missing and
 *   granted what they need; the guarantees rest on privileges never having been
 *   granted rather than on a script taking them away. The exception is
 *   `revokes`, and it exists because one guarantee arrived *after* the privilege
 *   it depends on: earlier versions gave `loramint_manage` UPDATE on the whole
 *   measurements table, and the column-level grant that replaces it cannot
 *   narrow what is already there. Withdrawing it is the only way an existing
 *   deployment gets the property a fresh one has.
 *
 *   DATABASE_URL is the source of truth. Names are constants and passwords are
 *   derived from the owner's (lib/db-roles.ts), so a role cannot end up with a
 *   password the application does not expect - both sides compute the same value
 *   and nothing has to be configured. Every run sets them again, so rotating the
 *   owner's password rotates all of them.
 *
 *   Unset means untouched. A missing variable is not an error: that role is
 *   skipped, and the feature using it does not exist.
 *
 * Identifiers and the password are quoted by Postgres itself through format(),
 * never by string concatenation here.
 */

//====================================
// TYPES
//====================================

type RoleSpec = {
  /** The role's name. Derived, not configured - see lib/db-roles.ts. */
  role: DbRole
  /** What the role is for, used in the log output. */
  purpose: string
  /** `ALTER ROLE ... SET name = value`, reapplied on every run. */
  settings: { name: string; value: string }[]
  /**
   * Run before the grants, and only where a narrower right has to replace a
   * broader one that an earlier version handed out. See the note above - this is
   * the one place this script takes something away.
   */
  revokes?: { privileges: string; on: string }[]
  /** Targets are literals from this file, never anything a caller supplies. */
  grants: { privileges: string; on: string }[]
  /** `ALTER DEFAULT PRIVILEGES`, so a later migration is covered without a rerun. */
  defaults: { privileges: string; on: string }[]
}

//====================================
// SPECIFICATIONS
//====================================

const SPECS: RoleSpec[] = [
  {
    role: DB_ROLES.readonly,
    purpose: "read-only SQL console",
    // The role itself is read-only, which is what survives a query that ends the
    // transaction with COMMIT and carries on.
    //
    // 30s rather than the console's 10: every read the application makes now
    // runs through here, including the CSV export, which streams large results.
    // The console keeps its own, tighter limit - services/query.ts sets it per
    // transaction with SET LOCAL.
    settings: [
      { name: "default_transaction_read_only", value: "on" },
      { name: "statement_timeout", value: "30s" },
    ],
    grants: [{ privileges: "SELECT", on: "ALL TABLES IN SCHEMA public" }],
    defaults: [{ privileges: "SELECT", on: "TABLES" }],
  },
  {
    role: DB_ROLES.admin,
    purpose: "writable SQL console",
    settings: [{ name: "statement_timeout", value: "10s" }],
    // No CREATE on the schema: schema changes stay with the migrations.
    grants: [
      { privileges: "SELECT, INSERT, UPDATE, DELETE", on: "ALL TABLES IN SCHEMA public" },
      { privileges: "USAGE, SELECT", on: "ALL SEQUENCES IN SCHEMA public" },
    ],
    defaults: [
      { privileges: "SELECT, INSERT, UPDATE, DELETE", on: "TABLES" },
      { privileges: "USAGE, SELECT", on: "SEQUENCES" },
    ],
  },
  {
    role: DB_ROLES.manage,
    purpose: "management pages",
    // Longer than the console's: a bulk delete legitimately takes a while. The
    // application still sets its own, shorter limit per transaction.
    settings: [{ name: "statement_timeout", value: "30s" }],
    // Table by table, on purpose. audit_log gets INSERT and SELECT and nothing
    // else, so the pages that append to the change log cannot rewrite it - that
    // is the whole point of routing management writes through this role.
    // UPDATE is granted column by column, and that is the point: `group_name`
    // and `public_read` are missing from both lists. A member of one data group
    // can correct a reading of their own group but cannot move it into another
    // group or publish it - the database refuses, so no route can be written
    // that lets them. Those two columns belong to `loramint_regroup`.
    //
    // A column added to either table later is NOT covered here and has to be
    // added by hand; that is the price of the allow-list, and the right way
    // round - a new column is unwritable until somebody says otherwise.
    revokes: [
      { privileges: "UPDATE", on: "measurements" },
      { privileges: "UPDATE", on: "log_entries" },
    ],
    grants: [
      { privileges: "SELECT, INSERT, DELETE", on: "measurements" },
      { privileges: "UPDATE (device_eui, measurand, unit, datatype, sensor, location, value, time_method, recorded_at, created_at)", on: "measurements" },
      { privileges: "SELECT, INSERT, DELETE", on: "log_entries" },
      { privileges: "UPDATE (device_eui, message, created_at)", on: "log_entries" },
      { privileges: "SELECT, INSERT", on: "audit_log" },
      // Same shape as audit_log and for the same reason: the device pages append
      // to their log and must not be able to tidy it up afterwards.
      { privileges: "SELECT, INSERT", on: "device_log" },
      // Settings are meant to change, unlike the two logs above - so this one
      // gets UPDATE and DELETE as well. The record of a change still lands in
      // audit_log, which this role can only append to.
      { privileges: "SELECT, INSERT, UPDATE, DELETE", on: "settings" },
      // Written on every sign-in and whenever somebody saves a preference, so
      // this is the one table an ordinary user causes a write to. UPDATE is
      // needed for the upsert, DELETE so an account can be removed when a person
      // leaves.
      { privileges: "SELECT, INSERT, UPDATE, DELETE", on: "users" },
      // Maintained by administrators only. The privilege sits on the role
      // because that is the role every human-triggered write goes through; who
      // may reach the page is decided in lib/roles.ts, not here.
      { privileges: "SELECT, INSERT, UPDATE, DELETE", on: "data_groups" },
      // The device pages maintain which group a device's readings belong to.
      { privileges: "SELECT, INSERT, UPDATE, DELETE", on: "device_groups" },
      // The board pages curate which measurements the public /board page shows.
      { privileges: "SELECT, INSERT, UPDATE, DELETE", on: "dashboard_entries" },
      // API tokens and the permissions data groups grant them.
      { privileges: "SELECT, INSERT, UPDATE, DELETE", on: "api_tokens" },
      { privileges: "SELECT, INSERT, UPDATE, DELETE", on: "api_token_grants" },
      // Same shape as audit_log and device_log, and for the same reason: the
      // pages that append to the token history must not be able to tidy it up
      // afterwards. This grant is what makes "read-only history" true - not the
      // absence of a button.
      { privileges: "SELECT, INSERT", on: "api_token_log" },
      // Which groups a token has been made known to.
      { privileges: "SELECT, INSERT, UPDATE, DELETE", on: "api_token_announcements" },
    ],
    // Deliberately empty: a table added by a later migration grants this role
    // nothing until someone adds a line above. A default privilege here would
    // silently hand out UPDATE and DELETE on the next log-like table.
    defaults: [],
  },
  {
    role: DB_ROLES.regroup,
    purpose: "moving measurements between groups",
    settings: [{ name: "statement_timeout", value: "30s" }],
    // Exactly the two columns `loramint_manage` does not have, plus the SELECT
    // needed to show what is being moved. Nothing else on either table, and
    // nothing at all on any other - a role that can only ever answer one
    // question wrongly.
    grants: [
      { privileges: "SELECT", on: "measurements" },
      { privileges: "UPDATE (group_name, public_read)", on: "measurements" },
      { privileges: "SELECT", on: "log_entries" },
      { privileges: "UPDATE (group_name, public_read)", on: "log_entries" },
      { privileges: "SELECT", on: "data_groups" },
    ],
    defaults: [],
  },
  {
    role: DB_ROLES.ingest,
    purpose: "TTN webhook",
    settings: [{ name: "statement_timeout", value: "5s" }],
    // INSERT and nothing else - no SELECT either. The webhook is the only route
    // reachable from outside that writes, and it reads nothing, so it may read
    // nothing. A flaw there cannot be turned into a way of reading the data.
    grants: [
      { privileges: "INSERT", on: "measurements" },
      { privileges: "INSERT", on: "log_entries" },
    ],
    defaults: [],
  },
]

//====================================
// EXECUTION HELPERS
//====================================

/**
 * Runs `template` after letting Postgres substitute `args` into it - %I quotes
 * an identifier, %L a literal. Building the statement in the database is what
 * keeps a role name or password out of the parser here.
 */
const execFormat = async (template: string, args: string[]) => {
  // The casts are not decoration: format() takes "any", so an untyped parameter
  // leaves the server unable to infer a type. A template referencing only %I
  // passes a null second argument, which format() ignores.
  const [row] = (await sql`
    SELECT format(${template}::text, ${args[0] ?? null}::text, ${args[1] ?? null}::text) AS stmt
  `) as { stmt: string }[]
  await sql.unsafe(row!.stmt)
}

const roleExists = async (name: string) => {
  const rows = await sql`SELECT 1 FROM pg_roles WHERE rolname = ${name}`
  return (rows as unknown[]).length > 0
}

/** Role name and password as configured in the DSN, or null if it is unusable. */
const credentialsFrom = (dsn: string) => {
  let url: URL
  try {
    url = new URL(dsn)
  } catch {
    return null
  }
  const username = decodeURIComponent(url.username)
  const password = decodeURIComponent(url.password)
  if (!username || !password) return null
  return { username, password }
}

//====================================
// SETUP
//====================================

const ensure = async (
  spec: RoleSpec,
  databaseName: string,
  ownerPassword: string,
  appRole: string | null,
) => {
  const username = spec.role
  const password = rolePassword(ownerPassword, spec.role)

  // This script runs as the schema owner and must never reconfigure the role it
  // is using. The names are constants now, so this can only fire if somebody
  // named the owner after one of them.
  if (appRole && username === appRole) {
    throw new Error(
      `DATABASE_URL uses the role ${username}, which is one of the restricted ` +
        `roles this script manages. The owner needs a name of its own.`,
    )
  }

  if (await roleExists(username)) {
    await execFormat("ALTER ROLE %I PASSWORD %L", [username, password])
    console.log(`  ${username}: exists, password and grants refreshed (${spec.purpose}).`)
  } else {
    await execFormat("CREATE ROLE %I LOGIN PASSWORD %L", [username, password])
    console.log(`  ${username}: created (${spec.purpose}).`)
  }

  for (const setting of spec.settings) {
    await execFormat(`ALTER ROLE %I SET ${setting.name} = %L`, [username, setting.value])
  }

  await execFormat("GRANT CONNECT ON DATABASE %I TO %I", [databaseName, username])
  await execFormat("GRANT USAGE ON SCHEMA public TO %I", [username])

  for (const revoke of spec.revokes ?? []) {
    await execFormat(`REVOKE ${revoke.privileges} ON ${revoke.on} FROM %I`, [username])
  }
  for (const grant of spec.grants) {
    await execFormat(`GRANT ${grant.privileges} ON ${grant.on} TO %I`, [username])
  }
  for (const granted of spec.defaults) {
    await execFormat(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ${granted.privileges} ON ${granted.on} TO %I`,
      [username],
    )
  }
}

console.log("Ensuring database roles...")

const [current] = (await sql`SELECT current_database()`) as {
  current_database: string
}[]
const databaseName = current!.current_database

// Every restricted role's password is derived from this one - see
// lib/db-roles.ts. Without it there is nothing to derive from, and rolePassword
// refuses rather than giving every deployment the same four passwords.
const owner = credentialsFrom(Bun.env.DATABASE_URL ?? "")
if (!owner) {
  throw new Error(
    "DATABASE_URL must carry a user name and a password: the restricted roles " +
      "are derived from it.",
  )
}

for (const spec of SPECS) {
  await ensure(spec, databaseName, owner.password, owner.username)
}

console.log("Database roles ready.")
process.exit(0)
