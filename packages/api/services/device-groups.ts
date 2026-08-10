import { reading, writing } from "./connections";

/**
 * Which group a device's readings belong to, and whether they are public.
 *
 * This is the only place either is decided. A measurement never gets its group
 * from a form: the trigger in migration 007 copies both values off this table
 * when the reading arrives, so assigning a device here is what decides
 * everything that device sends from then on - and nothing it sent before.
 *
 * That asymmetry is the point. A device can be handed to another class without
 * last term's readings changing hands.
 *
 * Keyed by DevEUI because that is the only identifier an uplink carries. There
 * is no device table; devices live in TTN, and this is a mapping beside them
 * rather than a copy of them.
 */

export type Assignment = {
  deviceEui: string;
  groupName: string | null;
  publicRead: boolean;
  assignedAt: Date;
  assignedBy: string | null;
};

const rowToAssignment = (row: any): Assignment => ({
  deviceEui: row.device_eui,
  groupName: row.group_name ?? null,
  publicRead: row.public_read === true,
  assignedAt: row.assigned_at,
  assignedBy: row.assigned_by ?? null,
});

/** The assignment of one device, or null when it has never been assigned. */
export const assignmentFor = async (
  deviceEui: string,
): Promise<Assignment | null> => {
  const rows = await reading()`
    SELECT device_eui, group_name, public_read, assigned_at, assigned_by
    FROM device_groups
    WHERE upper(device_eui) = upper(${deviceEui})
  `;
  return rows[0] ? rowToAssignment(rows[0]) : null;
};

/** Every assignment, keyed by upper-case DevEUI, for the device list. */
export const allAssignments = async (): Promise<Map<string, Assignment>> => {
  const rows = await reading()`
    SELECT device_eui, group_name, public_read, assigned_at, assigned_by
    FROM device_groups
  `;
  return new Map(
    rows.map((row: any) => [
      String(row.device_eui).toUpperCase(),
      rowToAssignment(row),
    ]),
  );
};

export type AssignOutcome = { ok: true } | { ok: false; error: string };

/**
 * Puts a device in a group, or takes it out of one.
 *
 * An empty group is allowed and means "not assigned": readings from then on
 * carry no group and are visible to the data role and administrators only. That
 * is a usable state - a sensor being tested, one whose owner has not been
 * decided - and not an error.
 *
 * Nothing is written to existing measurements. Whether last term's readings
 * follow the device is a separate decision and a separate action; doing it
 * silently here would make a reassignment quietly rewrite history.
 */
export const assignDevice = async (
  deviceEui: string,
  input: { groupName: string | null; publicRead: boolean },
  by: string,
): Promise<AssignOutcome> => {
  const eui = deviceEui.trim().toUpperCase();
  if (!/^[0-9A-F]{16}$/.test(eui)) {
    return { ok: false, error: `Keine gültige DevEUI: ${deviceEui}` };
  }

  const group = input.groupName?.trim() || null;

  try {
    await writing()`
      INSERT INTO device_groups (device_eui, group_name, public_read, assigned_by)
      VALUES (${eui}, ${group}, ${input.publicRead}, ${by})
      ON CONFLICT (device_eui) DO UPDATE
        SET group_name = EXCLUDED.group_name,
            public_read = EXCLUDED.public_read,
            assigned_at = now(),
            assigned_by = EXCLUDED.assigned_by
    `;
    return { ok: true };
  } catch (err) {
    console.error("device-groups: could not assign", eui, err);
    // The one failure worth naming: a group that is not declared. The foreign
    // key is what catches it, so the message is a guess - but it is the right
    // guess, and the alternative is "something went wrong".
    return {
      ok: false,
      error:
        `„${group}“ ist keine erklärte Datengruppe. Erst unter ` +
        "Verwaltung → Datengruppen eintragen.",
    };
  }
};
