import { reading, writing } from "./connections";
import { normaliseEui } from "../lib/ttn-ids";
import type { TtnDevice } from "./ttn";

/**
 * What TTN knows about a device, copied out so a page can show it without asking:
 * the name, and whether the device is still registered there.
 *
 * TTN is the source: nothing here invents or edits a name. This is a read-through
 * copy with a short job - turn a DevEUI into something a person recognises, and
 * answer whether TTN still knows it - and it exists because the pages that need
 * both cannot make a network request: /status, /plots, /export and /board are
 * public and server-rendered, and /status reloads itself every thirty seconds.
 *
 * **Nothing is ever deleted; presence is a flag.** A device that TTN no longer
 * knows keeps its row and its last known name, and gets `registered = false` -
 * which is what lets the status page call it „verwaist" while still naming it.
 * Its measurements keep arriving under the same EUI and keep being shown, and an
 * EUI is bound to the hardware, so re-registering the same device turns the flag
 * back on. Removing a row is a job for the SQL console and nothing else.
 *
 * **The flag is as fresh as the last full sync**, which is the price of not
 * asking TTN per request: a device removed through the TTN console counts as
 * registered until the next restart or the next look at the device overview. The
 * overview itself never reads this copy - it asks TTN - so the page somebody
 * opens to act on a device is always current.
 *
 * Every write normalises through `normaliseEui` and skips what it rejects rather
 * than upper-casing blindly: the key has to be an EUI for the joins to find it,
 * and a malformed one would be a row nothing ever matches.
 */

/** Every known name, keyed by upper-case DevEUI. For the pages that show one. */
export const all = async (): Promise<Map<string, string>> => {
  const rows = await reading()`
    SELECT device_eui, name FROM device_names WHERE name IS NOT NULL
  `;
  return new Map(
    rows.map((row: any) => [String(row.device_eui).toUpperCase(), String(row.name)]),
  );
};

/**
 * The EUIs TTN knew of at the last sync, upper case.
 *
 * An empty set means this server has never managed to ask - no TTN key, or a
 * list that never arrived - and the pages read it that way: they then show no
 * state at all rather than declaring every device verwaist on the strength of
 * knowing nothing. A TTN application that genuinely holds no devices is
 * indistinguishable from that, and gets the same cautious treatment.
 */
export const registeredEuis = async (): Promise<Set<string>> => {
  const rows = await reading()`
    SELECT device_eui FROM device_names WHERE registered
  `;
  return new Set(rows.map((row: any) => String(row.device_eui).toUpperCase()));
};

/**
 * The upsert both writers share, on whatever handle the caller brought - the
 * single-device one writes directly, the sync writes inside its transaction.
 *
 * `COALESCE` keeps a name TTN no longer carries: the flag is about presence, the
 * name about recognition, and losing the label on every page because somebody
 * cleared a field in the console would be the wrong trade.
 */
const upsert = (sql: any, eui: string, name: string | null) => sql`
  INSERT INTO device_names (device_eui, name, registered)
  VALUES (${eui}, ${name}, true)
  ON CONFLICT (device_eui) DO UPDATE
    SET name = COALESCE(EXCLUDED.name, device_names.name),
        registered = true,
        updated_at = now()
`;

const cleanName = (name: string | null) =>
  name && name.trim().length > 0 ? name.trim() : null;

/**
 * One device, after it was registered or renamed in TTN.
 *
 * Sets `registered`, because this is only ever called about a device TTN has
 * just confirmed. A name is optional for the same reason the column is: the
 * device counts either way.
 */
export const rememberName = async (
  devEui: string,
  name: string | null,
): Promise<void> => {
  const eui = normaliseEui(devEui);
  if (!eui) return;
  await upsert(writing(), eui, cleanName(name));
};

/**
 * Brings the copy in line with a whole TTN device list.
 *
 * Two halves, and the second is the reason this is not just a loop of
 * `rememberName`: everything the list did *not* contain loses its flag. That is
 * what turns a device somebody removed in the TTN console into a „verwaist" row
 * on the status page instead of a silently wrong name.
 *
 * The name is kept when TTN has none (`COALESCE` above), so a device that was
 * given a name and later had it cleared does not lose the label on every page at
 * once - the flag is about presence, the name about recognition, and they are
 * maintained apart.
 *
 * Only ever called with a *complete* list. `listDevices()` pages through and
 * refuses to return a partial one for exactly this reason - half a list here
 * would declare the other half verwaist.
 */
export const syncFrom = async (devices: readonly TtnDevice[]): Promise<void> => {
  // Every row loses the flag, and the list hands it straight back - rather than
  // comparing against a list of EUIs, which would be one array parameter and a
  // clause that grows with the application. In one transaction, because the half
  // second in between is a state where every device looks verwaist, and no page
  // may ever read that.
  await writing().begin(async (tx: any) => {
    await tx`UPDATE device_names SET registered = false WHERE registered`;
    for (const device of devices) {
      const eui = device.devEui ? normaliseEui(device.devEui) : null;
      if (!eui) continue;
      await upsert(tx, eui, cleanName(device.name));
    }
  });
};
