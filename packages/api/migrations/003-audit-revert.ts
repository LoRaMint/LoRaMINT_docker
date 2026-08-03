import { sql } from "bun"

/**
 * Makes a logged change undoable - by *appending*, never by rewriting.
 *
 * Two things are needed for that. An entry has to be able to name the entry it
 * undoes (`reverts_id`), which is what turns the log into a chain rather than a
 * pile: from any row one can read both what it changed and whether something
 * later took that back. And restoring a deleted row is itself a kind of change
 * the log did not know yet, so `insert` joins the actions.
 *
 * Additive and repeatable, like every migration here. The check constraint is
 * dropped and recreated rather than altered, because that is the only form that
 * survives being run again on a database that already has it.
 */
export const up = async () => {
  await sql`
    ALTER TABLE audit_log
      ADD COLUMN IF NOT EXISTS reverts_id UUID REFERENCES audit_log(id)
  `.simple()

  await sql`ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_action_check`.simple()
  await sql`
    ALTER TABLE audit_log
      ADD CONSTRAINT audit_log_action_check
      CHECK (action IN ('update', 'delete', 'insert'))
  `.simple()

  // Read in both directions: "was this taken back?" and "what did this undo?"
  await sql`CREATE INDEX IF NOT EXISTS audit_log_reverts_idx ON audit_log (reverts_id)`.simple()
}
