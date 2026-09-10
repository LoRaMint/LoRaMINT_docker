import { sql } from "bun"

/**
 * Lets the device log record a removal.
 *
 * `device_log` was created with `action IN ('create', 'rename')`, and the table
 * is created with `IF NOT EXISTS` - so widening the list in 004 alone would
 * reach a fresh database and no existing one. The constraint therefore gets
 * replaced here, dropped and recreated rather than altered, because that is the
 * only form that survives being run again.
 *
 * Removing a device is logged in every case, including a run that got through
 * two of the four servers and stopped: the entry then carries `partial` and the
 * registers that are gone. See services/device-log.ts.
 */
export const up = async () => {
  await sql`ALTER TABLE device_log DROP CONSTRAINT IF EXISTS device_log_action_check`.simple()
  await sql`
    ALTER TABLE device_log
      ADD CONSTRAINT device_log_action_check
      CHECK (action IN ('create', 'rename', 'delete'))
  `.simple()
}
