import { sql } from "bun"

/**
 * The record of what the device pages did in The Things Network.
 *
 * Deliberately its own table rather than more rows in `audit_log`. That log is
 * about database rows: every entry names a `table_name` and a `row_id`, keeps a
 * snapshot, and can be taken back by writing the row again - see
 * lib/audit-revert.ts. A device registered in TTN is none of those things. It has
 * no row here, there is nothing to snapshot, and "take it back" would mean four
 * DELETEs against a foreign service that may or may not still agree. Putting it
 * into `audit_log` would either break the promise that every entry is revertible
 * or add a kind of entry that has to be excluded everywhere - both worse than a
 * second, smaller table that says exactly what it is.
 *
 * Additive like 002: a new table, nothing existing touched, so an older image
 * keeps running against this schema and simply ignores it.
 *
 * `outcome` is the honest part. Registering a device is four calls to four
 * servers and they are not one transaction, so the middle state is real: 'partial'
 * means something is left behind in TTN, and `details` names which steps. See
 * services/ttn.ts.
 *
 * On privileges: the management role is granted SELECT and INSERT and nothing
 * else, exactly like `audit_log`, so the pages that write this log cannot rewrite
 * it. See scripts/ensure-roles.ts.
 */
export const up = async () => {
  await sql`
    CREATE TABLE IF NOT EXISTS device_log (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      username VARCHAR(100) NOT NULL,
      display_name VARCHAR(200),
      action VARCHAR(10) NOT NULL CHECK (action IN ('create', 'rename')),
      device_id VARCHAR(36) NOT NULL,
      device_eui VARCHAR(16),
      outcome VARCHAR(10) NOT NULL CHECK (outcome IN ('ok', 'partial', 'failed')),
      details JSONB NOT NULL DEFAULT '{}'::jsonb,
      reason TEXT
    )
  `.simple()

  // Read newest-first, and occasionally for a single device's history.
  await sql`CREATE INDEX IF NOT EXISTS device_log_time_idx ON device_log (occurred_at DESC)`.simple()
  await sql`CREATE INDEX IF NOT EXISTS device_log_device_idx ON device_log (device_id, occurred_at DESC)`.simple()
}
