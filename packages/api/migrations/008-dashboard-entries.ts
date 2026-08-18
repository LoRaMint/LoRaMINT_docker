import { sql } from "bun"

/**
 * The public /board page shows a curated subset of measurements as gauges. A
 * dashboard entry names which (device_eui, sensor, measurand) triple to show
 * and how to scale its gauge - it holds no measurement data itself, only a
 * pointer plus display settings.
 *
 * Not group-scoped, unlike measurements/log_entries in 007: this table is
 * curated by the board role (see lib/roles.ts), not read through the
 * group-aware connection, and /board itself only ever reads through the plain
 * public connection - a public row's own RLS policy already decides whether
 * its value is visible there. No RLS needed on this table.
 *
 * `device_eui` is a bare column, not a foreign key into a device table -
 * consistent with `device_groups` in 006: devices live in TTN, not here.
 */
export const up = async () => {
  await sql`
    CREATE TABLE IF NOT EXISTS dashboard_entries (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      device_eui VARCHAR(16) NOT NULL,
      sensor TEXT NOT NULL,
      measurand TEXT NOT NULL,
      range_mode TEXT NOT NULL CHECK (range_mode IN ('fixed', 'dynamic')),
      min_value DOUBLE PRECISION,
      max_value DOUBLE PRECISION,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      created_by VARCHAR(100),
      -- A fixed entry names both bounds; a dynamic one names neither and gets
      -- them from the measurement history instead (see services/dashboard.ts).
      -- Enforced here too, not just in application code, because the SQL
      -- console can write this table directly.
      CONSTRAINT dashboard_entries_range_check CHECK (
        (range_mode = 'dynamic' AND min_value IS NULL AND max_value IS NULL)
        OR (range_mode = 'fixed' AND min_value IS NOT NULL AND max_value IS NOT NULL
            AND min_value < max_value)
      )
    )
  `.simple()

  // The board view looks up the latest value and, for dynamic entries, the
  // historical min/max, for every entry's (device_eui, sensor, measurand) -
  // the same triple on both sides of the join.
  await sql`
    CREATE INDEX IF NOT EXISTS dashboard_entries_lookup_idx
      ON dashboard_entries (device_eui, sensor, measurand)
  `.simple()
}
