import { sql } from "bun"

/**
 * Creates and updates the restricted database roles the application connects
 * through, so a deployment does not need a psql session on the server.
 *
 * Run from the entrypoint *after* the migrations: the per-table grants below
 * need the tables to exist. dev_scripts/create-*-role.sql do the same thing by
 * hand and carry the reasoning behind each grant; this script is the convenient
 * path, not a replacement for reading them.
 *
 * Three properties worth knowing:
 *
 *   Additive. Roles are created when missing and granted what they need. Nothing
 *   is revoked - the guarantees this setup makes rest on privileges never having
 *   been granted, not on a script taking them away again.
 *
 *   The DSN is the source of truth. Role name and password are read from
 *   DATABASE_URL_READONLY / _ADMIN / _MANAGE, so a role cannot end up with a
 *   different password than the connection string the application uses. An
 *   existing role's password is set to match on every run.
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
  /** Variable holding the DSN this role is reached through. */
  envVar: string
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
    envVar: "DATABASE_URL_READONLY",
    purpose: "read-only SQL console",
    // The role itself is read-only, which is what survives a query that ends the
    // transaction with COMMIT and carries on.
    settings: [
      { name: "default_transaction_read_only", value: "on" },
      { name: "statement_timeout", value: "10s" },
    ],
    grants: [{ privileges: "SELECT", on: "ALL TABLES IN SCHEMA public" }],
    defaults: [{ privileges: "SELECT", on: "TABLES" }],
  },
  {
    envVar: "DATABASE_URL_ADMIN",
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
    envVar: "DATABASE_URL_MANAGE",
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
    ],
    // Deliberately empty: a table added by a later migration grants this role
    // nothing until someone adds a line above. A default privilege here would
    // silently hand out UPDATE and DELETE on the next log-like table.
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

const ensure = async (spec: RoleSpec, databaseName: string, appRole: string | null) => {
  const dsn = Bun.env[spec.envVar]
  if (!dsn) {
    console.log(`  ${spec.envVar} not set - skipping the ${spec.purpose} role.`)
    return
  }

  const credentials = credentialsFrom(dsn)
  if (!credentials) {
    throw new Error(
      `${spec.envVar} must be a connection string carrying a user name and a ` +
        `password, so the role can be created from it.`,
    )
  }
  const { username, password } = credentials

  // The same check config.ts makes about the DSN, one level down: this script
  // runs as the schema owner, and must never reconfigure the role it is using.
  if (appRole && username === appRole) {
    throw new Error(
      `${spec.envVar} uses the application's own database role (${username}). ` +
        `That role owns the schema and is typically a superuser; the point of ` +
        `a separate role is that it is not. See dev_scripts/create-*-role.sql.`,
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
const appRole = credentialsFrom(Bun.env.DATABASE_URL ?? "")?.username ?? null

for (const spec of SPECS) {
  await ensure(spec, databaseName, appRole)
}

console.log("Database roles ready.")
process.exit(0)
