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
 *   Additive. Roles are created when missing and granted what they need. Nothing
 *   is revoked - the guarantees this setup makes rest on privileges never having
 *   been granted, not on a script taking them away again.
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
    grants: [
      { privileges: "SELECT, INSERT, UPDATE, DELETE", on: "measurements" },
      { privileges: "SELECT, INSERT, UPDATE, DELETE", on: "log_entries" },
      { privileges: "SELECT, INSERT", on: "audit_log" },
      // Same shape as audit_log and for the same reason: the device pages append
      // to their log and must not be able to tidy it up afterwards.
      { privileges: "SELECT, INSERT", on: "device_log" },
      // Settings are meant to change, unlike the two logs above - so this one
      // gets UPDATE and DELETE as well. The record of a change still lands in
      // audit_log, which this role can only append to.
      { privileges: "SELECT, INSERT, UPDATE, DELETE", on: "settings" },
    ],
    // Deliberately empty: a table added by a later migration grants this role
    // nothing until someone adds a line above. A default privilege here would
    // silently hand out UPDATE and DELETE on the next log-like table.
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
