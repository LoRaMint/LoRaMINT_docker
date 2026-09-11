import { sql } from "bun"

/**
 * What TTN knows about a device, copied out so a page can show it without asking:
 * the name, and whether TTN still knows the device at all.
 *
 * Not a device table, and the distinction matters: this holds a label and
 * nothing else. TTN stays the place a device is registered, renamed and removed,
 * and every row here arrives from there (services/device-names.ts) - at startup
 * and whenever the device pages talk to TTN anyway.
 *
 * It exists because the pages that need the name cannot ask TTN. /status,
 * /plots, /export and /board are public and server-rendered, /status even
 * reloads itself every thirty seconds: a TTN request per render would put an
 * external dependency, its latency and its rate limit on the quietest path in
 * the application. A label is also the one thing about a device that is safe to
 * keep a copy of - it is not a key, and nothing is decided by it.
 *
 * Keyed by the upper-case DevEUI, like `device_groups` in 007: that is how TTN
 * writes them, how the EUI arrives with an uplink, and what the joins in
 * services/measurement.ts compare against.
 *
 * **`registered` is why this table holds rows with no name.** The status page
 * labels a device aktiv, stumm or verwaist, and the last of those means "data
 * arrives under an EUI TTN does not know" - a question about presence, not about
 * names. A full sync therefore sets the flag false for every row it did not see
 * in the list, rather than deleting it: the name stays, because the measurements
 * outlive the registration and a last known name is worth most on exactly those
 * rows. The flag is as fresh as the last sync, and no fresher - see
 * services/device-names.ts.
 *
 * No RLS. Both values are shown beside an EUI that is already public on those
 * pages, so there is nothing here that the row it labels does not decide for
 * itself.
 */
export const up = async () => {
  await sql`
    CREATE TABLE IF NOT EXISTS device_names (
      device_eui VARCHAR(16) PRIMARY KEY,
      -- Nullable: a device TTN has not been given a name for is still a device
      -- TTN knows, and that is what the flag below has to be able to say.
      name TEXT,
      registered BOOLEAN NOT NULL DEFAULT true,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `.simple()

  // The table shipped in this same (unreleased) migration with a narrower shape
  // for one afternoon, so the two statements below bring such a database along -
  // `CREATE TABLE IF NOT EXISTS` alone would leave it as it was. Harmless on a
  // fresh one, which is the rule every migration here follows.
  await sql`ALTER TABLE device_names ALTER COLUMN name DROP NOT NULL`.simple()
  await sql`
    ALTER TABLE device_names
      ADD COLUMN IF NOT EXISTS registered BOOLEAN NOT NULL DEFAULT true
  `.simple()
}
