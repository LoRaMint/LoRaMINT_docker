import { sql } from "bun"

/**
 * The settings that used to live in the environment.
 *
 * Only the movable ones - `lib/config-catalog.ts` marks which those are with
 * `tier`. Everything needed before the application can reach this table stays in
 * the environment, and so does everything the security model rests on: the
 * connection strings, SESSION_SECRET and the setup account. See
 * docs/konfiguration-verwalten.md for where the line runs and why.
 *
 * Settings changes are deliberately *not* written to `audit_log`. That log is
 * about the data this application holds - every entry names a table and a row
 * and can be written back - and a timeout is none of those things. Entries about
 * configuration would bury the question the change log exists to answer: who
 * corrected this measurement, and why.
 *
 * `note` is what somebody wrote down about the setting - why it stands where it
 * stands. It belongs on the row rather than in a log of changes: an explanation
 * typed once while saving is buried in a list a week later, while a note sits
 * next to the value it explains and can be corrected when the reasoning changes.
 * There is deliberately no history; `updated_by` and `updated_at` say who last
 * touched the row and when, which is what one actually asks.
 *
 * `value` is text and never null. Every setting arrives from a form as text and
 * config.ts parses it exactly as it parses an environment variable, so a number
 * that is stored wrong fails the same way it would there. An absent setting is
 * an absent *row*, not an empty string - the same rule config.ts already applies
 * to the environment.
 *
 * Additive: a new table, nothing existing touched.
 */
export const up = async () => {
  await sql`
    CREATE TABLE IF NOT EXISTS settings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      key VARCHAR(64) NOT NULL UNIQUE,
      value TEXT NOT NULL,
      note TEXT,
      updated_by VARCHAR(100),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `.simple()

  // Added after the table first shipped, so both a fresh database and one that
  // already has it end up the same. Migrations here run on every start and must
  // stay idempotent.
  await sql`ALTER TABLE settings ADD COLUMN IF NOT EXISTS note TEXT`.simple()
  await sql`ALTER TABLE settings ADD COLUMN IF NOT EXISTS updated_by VARCHAR(100)`.simple()

  // Read as a whole on every start, and by key when one is written.
  await sql`CREATE INDEX IF NOT EXISTS settings_key_idx ON settings (key)`.simple()
}
