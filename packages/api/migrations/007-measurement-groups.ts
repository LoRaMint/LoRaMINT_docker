import { sql } from "bun"

/**
 * Measurements belong to a group, and the database is what enforces it.
 *
 * The group hangs on the *device*, not on the measurement: when a reading
 * arrives it gets its device's group stamped onto it and keeps it. A device can
 * be reassigned later without historical data changing hands, which is the
 * property that makes swapping hardware safe.
 *
 * Two columns, not one. `group_name` says who may *change* the row;
 * `public_read` says whether everyone may *read* it. The combination is the
 * ordinary case - a class publishes its weather data but only the class may
 * correct it - and one column could not express it. `public_read` never grants
 * a write.
 *
 * Enforcement is Row Level Security rather than a WHERE clause in the
 * application. That is not a preference: the SQL console lets a signed-in user
 * write their own query, and no filter in application code survives that. RLS is
 * the only mechanism that also binds free-form SQL.
 *
 * See docs/benutzereinstellungen.md, section 6.
 */
export const up = async () => {
  //====================================
  // COLUMNS
  //====================================

  for (const table of ["measurements", "log_entries"]) {
    await sql.unsafe(`
      ALTER TABLE ${table}
        ADD COLUMN IF NOT EXISTS group_name VARCHAR(100)
          REFERENCES data_groups(name) ON DELETE RESTRICT,
        ADD COLUMN IF NOT EXISTS public_read BOOLEAN NOT NULL DEFAULT false
    `)
    // Every policy below tests these two, and the group filter has to hold on
    // tables that grow without bound.
    await sql.unsafe(
      `CREATE INDEX IF NOT EXISTS ${table}_group_idx ON ${table} (group_name)`,
    )
    await sql.unsafe(
      `CREATE INDEX IF NOT EXISTS ${table}_public_idx ON ${table} (public_read) WHERE public_read`,
    )
  }

  /**
   * Which group a device's readings belong to. No device table exists - devices
   * live in TTN - so this is a bare mapping keyed by the DevEUI that arrives
   * with every uplink.
   *
   * Many devices to one group, and a group needs no device at all.
   */
  await sql`
    CREATE TABLE IF NOT EXISTS device_groups (
      device_eui VARCHAR(16) PRIMARY KEY,
      group_name VARCHAR(100) REFERENCES data_groups(name) ON DELETE RESTRICT,
      public_read BOOLEAN NOT NULL DEFAULT false,
      assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      assigned_by VARCHAR(100)
    )
  `.simple()

  //====================================
  // THE EXISTING DATA
  //====================================

  /**
   * Everything that already exists becomes publicly readable.
   *
   * Without this the upgrade takes /plots, /export, /status and the open API
   * dark in one step: those pages are reachable without signing in, so after the
   * change they show only `public_read` rows - and every existing row would have
   * had `false`. Releasing the backlog keeps the public site exactly as it is
   * today and lets the restriction apply to what arrives from now on.
   *
   * Guarded on the column having just been added, so a rerun does not re-publish
   * something an administrator has since withdrawn.
   */
  await sql`
    UPDATE measurements SET public_read = true
    WHERE public_read = false AND group_name IS NULL
      AND NOT EXISTS (SELECT 1 FROM device_groups)
  `.simple()
  await sql`
    UPDATE log_entries SET public_read = true
    WHERE public_read = false AND group_name IS NULL
      AND NOT EXISTS (SELECT 1 FROM device_groups)
  `.simple()

  //====================================
  // THE STAMP
  //====================================

  /**
   * Fills both columns from `device_groups` on insert, whatever the inserter
   * passed.
   *
   * SECURITY DEFINER, because the ingest role must keep its shape: INSERT on two
   * tables and not one SELECT anywhere. Looking the group up in application code
   * would mean granting that role read access, and the reason it exists is that
   * the webhook is the only externally reachable write and reads nothing.
   *
   * `search_path` is pinned. Without it a SECURITY DEFINER function is a way in:
   * whoever can create a table in a schema earlier on the caller's path decides
   * what `device_groups` means.
   *
   * It overwrites rather than defaults. A default would be a suggestion, and the
   * point is that no insert path - webhook, management pages, SQL console - can
   * choose its own group.
   */
  await sql`
    CREATE OR REPLACE FUNCTION stamp_group_from_device()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = pg_catalog, public
    AS $$
    BEGIN
      SELECT d.group_name, d.public_read
        INTO NEW.group_name, NEW.public_read
        FROM device_groups d
       WHERE d.device_eui = NEW.device_eui;

      -- Unknown device: no group and no release, so the reading is visible to
      -- nobody but the data role and administrators. Failing closed is right -
      -- a sensor nobody has assigned yet is not one whose data should be public.
      IF NOT FOUND THEN
        NEW.group_name := NULL;
        NEW.public_read := false;
      END IF;

      RETURN NEW;
    END;
    $$
  `.simple()

  for (const table of ["measurements", "log_entries"]) {
    await sql.unsafe(`DROP TRIGGER IF EXISTS stamp_group ON ${table}`)
    await sql.unsafe(`
      CREATE TRIGGER stamp_group BEFORE INSERT ON ${table}
      FOR EACH ROW EXECUTE FUNCTION stamp_group_from_device()
    `)
  }

  //====================================
  // ROW LEVEL SECURITY
  //====================================

  /**
   * Two session variables decide what a connection may see:
   *
   *   loramint.groups     comma-separated data groups of the signed-in user
   *   loramint.allgroups  'on' for the data role and for administrators
   *
   * Both are set with `set_config(..., true)` inside a transaction, so they are
   * gone when it ends - see services/connections.ts.
   *
   * **Unset means public-only.** `current_setting(name, true)` returns NULL when
   * nothing was set, the comparison becomes NULL, and only `public_read` rows
   * remain. That covers anonymous visitors, every query outside a transaction,
   * and the one trick services/query.ts already warns about: a console user
   * writing `COMMIT; SELECT …` ends the transaction and drops the setting, so
   * the rest of their statement sees the public rows and nothing else.
   *
   * No FORCE: the table owner keeps bypassing RLS, which is what lets migrations
   * and a deliberate backfill work. The owner is used by migrate.ts and
   * ensure-roles.ts and by nothing that serves a request.
   */
  for (const table of ["measurements", "log_entries"]) {
    await sql.unsafe(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`)

    await sql.unsafe(`DROP POLICY IF EXISTS visible_rows ON ${table}`)
    await sql.unsafe(`
      CREATE POLICY visible_rows ON ${table} FOR SELECT USING (
        public_read
        OR current_setting('loramint.allgroups', true) = 'on'
        OR group_name = ANY (
             string_to_array(current_setting('loramint.groups', true), ',')
           )
      )
    `)

    // Changing a row needs the group itself; being allowed to read something
    // publicly never allows changing it.
    for (const [name, action] of [
      ["writable_rows", "UPDATE"],
      ["deletable_rows", "DELETE"],
    ]) {
      await sql.unsafe(`DROP POLICY IF EXISTS ${name} ON ${table}`)
      await sql.unsafe(`
        CREATE POLICY ${name} ON ${table} FOR ${action} USING (
          current_setting('loramint.allgroups', true) = 'on'
          OR group_name = ANY (
               string_to_array(current_setting('loramint.groups', true), ',')
             )
        )
      `)
    }

    // The webhook inserts without knowing anything about groups, and the trigger
    // above has already decided both columns by the time this is checked.
    await sql.unsafe(`DROP POLICY IF EXISTS insertable_rows ON ${table}`)
    await sql.unsafe(
      `CREATE POLICY insertable_rows ON ${table} FOR INSERT WITH CHECK (true)`,
    )
  }
}
