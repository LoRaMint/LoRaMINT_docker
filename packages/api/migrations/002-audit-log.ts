import { sql } from "bun"

/**
 * The change log behind the management pages, plus the indexes their filters
 * need.
 *
 * Additive only: a new table and new indexes, no existing column is touched. An
 * older image therefore keeps working against this schema - it simply ignores
 * the table.
 *
 * One row per affected data row, not one per action. That is what makes a single
 * measurement's history retrievable, and a deletion reconstructible from its
 * snapshot. `batch_id` ties the rows of one action together, so "412 rows
 * deleted" reads as one event rather than 412.
 *
 * `changes` has two shapes, told apart by `action`:
 *   update  {"fields": {"value": {"from": "235", "to": "23.5"}}}
 *   delete  {"before": { ...the whole row... }}
 * A deletion keeps the entire row because there is nothing left to look at
 * afterwards; an update only keeps what moved.
 *
 * On privileges: the read-only and admin SQL roles pick this table up through
 * the ALTER DEFAULT PRIVILEGES in scripts/ensure-roles.ts, so the admin
 * role can correct an entry through the SQL console and the read-only role can
 * read it. Those defaults only apply to tables created by the role that ran
 * them - migrations and role setup both run as the owner today. If that ever
 * diverges, the read-only role silently loses SELECT here.
 *
 * The management role is granted SELECT and INSERT explicitly and nothing else,
 * so the pages that write the log cannot rewrite it. See scripts/ensure-roles.ts.
 */
export const up = async () => {
  await sql`
    CREATE TABLE IF NOT EXISTS audit_log (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      username VARCHAR(100) NOT NULL,
      display_name VARCHAR(200),
      action VARCHAR(10) NOT NULL CHECK (action IN ('update', 'delete')),
      table_name VARCHAR(40) NOT NULL,
      row_id UUID NOT NULL,
      batch_id UUID NOT NULL,
      changes JSONB NOT NULL,
      reason TEXT
    )
  `.simple()

  // The log is read newest-first, per row for a single measurement's history,
  // and per batch to show one action as one event.
  await sql`CREATE INDEX IF NOT EXISTS audit_log_time_idx ON audit_log (occurred_at DESC)`.simple()
  await sql`CREATE INDEX IF NOT EXISTS audit_log_row_idx ON audit_log (row_id)`.simple()
  await sql`CREATE INDEX IF NOT EXISTS audit_log_batch_idx ON audit_log (batch_id)`.simple()

  // measurements had no index at all. The management list filters by device and
  // sensor and orders by measurement time, and `filterClause` bounds that time
  // with COALESCE(recorded_at, created_at) - so the index has to be on the same
  // expression to be used.
  await sql`
    CREATE INDEX IF NOT EXISTS measurements_device_time_idx
      ON measurements (device_eui, (COALESCE(recorded_at, created_at)) DESC)
  `.simple()
  await sql`
    CREATE INDEX IF NOT EXISTS measurements_time_idx
      ON measurements ((COALESCE(recorded_at, created_at)) DESC)
  `.simple()
  await sql`CREATE INDEX IF NOT EXISTS measurements_sensor_idx ON measurements (sensor)`.simple()

  await sql`
    CREATE INDEX IF NOT EXISTS log_entries_device_idx
      ON log_entries (device_eui, created_at DESC)
  `.simple()
}
