import { reading, writing } from "./connections";
import type { RoleConfig } from "../lib/roles";
import type { SessionUser } from "../lib/session";


/**
 * Which directory groups count as *data* groups.
 *
 * The distinction this module exists to keep is between two questions that both
 * happen to be answered by LDAP groups:
 *
 *   **What may this person do?**   The three role groups, lib/roles.ts.
 *   **Which data is this about?**  The groups declared here.
 *
 * Both will be required together once measurements carry a group: changing one
 * will need the `management` role *and* membership of that measurement's group.
 * Conflating the two axes would turn a data scope into a privilege, which is why
 * `declare` refuses a role group outright rather than trusting nobody to enter
 * one.
 *
 * **Membership is not stored here and cannot be.** The table holds names, never
 * people. Who is in a group is the directory's answer, arrives in the session at
 * sign-in, and is intersected with these names by `dataGroupsOf`. So there is no
 * second place to maintain, nothing that can drift out of step, and no path by
 * which this application could grant somebody a membership - the strongest form
 * of that guarantee, which is that the code to do it does not exist.
 *
 * Both failure modes are quiet and safe. A name here that matches no directory
 * group never intersects with anybody; a directory group missing from here
 * grants nothing.
 *
 * Nothing is restricted yet - see docs/benutzereinstellungen.md, section 6.
 */

//====================================
// TYPES
//====================================

/** Succeeded, or failed with something worth showing the person who tried. */
export type GroupResult = { ok: true } | { ok: false; error: string };

export type DataGroup = {
  name: string;
  label: string | null;
  note: string | null;
  createdAt: Date;
  createdBy: string | null;
};

//====================================
// READING
//====================================

export const listDataGroups = async (): Promise<DataGroup[]> => {
  const rows = await reading()`
    SELECT name, label, note, created_at, created_by
    FROM data_groups
    ORDER BY COALESCE(label, name)
  `;
  return rows.map((row: any) => ({
    name: row.name,
    label: row.label ?? null,
    note: row.note ?? null,
    createdAt: row.created_at,
    createdBy: row.created_by ?? null,
  }));
};

/**
 * The data groups this user is in: their directory groups, narrowed to the
 * declared ones.
 *
 * Takes the declared list as an argument rather than querying for it, so a
 * caller that needs this per row does one query and not one per call - and so
 * the function itself stays pure and testable.
 */
export const dataGroupsOf = (
  user: SessionUser | null,
  declared: readonly string[],
): string[] => {
  if (!user) return [];
  // The setup account holds no directory groups at all. It is deliberately not
  // given every data group here: it exists to configure a server that has no
  // directory yet, and reading everybody's measurements is not part of that. Its
  // admin level lets it *declare* groups; it is in none of them.
  const known = new Set(declared);
  return user.groups.filter((group) => known.has(group));
};

//====================================
// WRITING
//====================================

/**
 * Whether this name is one of the three role groups.
 *
 * Exported and pure so the rule can be tested without a database - the refusal
 * below is the one thing in this module that must not be got wrong, and a test
 * for it should not depend on a connection being up.
 *
 * An unconfigured role group is null and matches nothing; without the filter, a
 * deployment with no LDAP_ADMIN_GROUP would compare against null and could match
 * in a way nobody intended.
 */
export const isRoleGroup = (name: string, config: RoleConfig): boolean =>
  [config.dataGroup, config.managementGroup, config.adminGroup]
    .filter((group): group is string => group !== null)
    .includes(name);

/**
 * Declares a directory group to be a data group.
 *
 * Refuses the role groups. Somebody entering `loramint-admins` here would not be
 * making a typo they notice: it would quietly make "may administer" mean "may
 * see this data", and the two are supposed to be independent so that either can
 * be granted without the other.
 */
export const declareDataGroup = async (
  input: { name: string; label?: string; note?: string },
  by: string,
  config: RoleConfig,
): Promise<GroupResult> => {
  const name = input.name.trim();
  if (name.length === 0) {
    return { ok: false, error: "Der Gruppenname darf nicht leer sein." };
  }
  if (name.length > 100) {
    return { ok: false, error: "Der Gruppenname ist zu lang (höchstens 100 Zeichen)." };
  }

  if (isRoleGroup(name, config)) {
    return {
      ok: false,
      error:
        `„${name}“ ist eine Rollengruppe und regelt, was jemand tun darf – ` +
        "nicht, welche Daten gemeint sind. Die beiden Achsen müssen getrennt " +
        "bleiben; wähle eine eigene Gruppe für die Daten.",
    };
  }

  const label = input.label?.trim() || null;
  const note = input.note?.trim() || null;

  try {
    const rows = await writing()`
      INSERT INTO data_groups (name, label, note, created_by)
      VALUES (${name}, ${label}, ${note}, ${by})
      ON CONFLICT (name) DO NOTHING
      RETURNING name
    `;
    if (rows.length === 0) {
      return { ok: false, error: `„${name}“ ist bereits als Datengruppe eingetragen.` };
    }
    return { ok: true };
  } catch (err) {
    console.error("data-groups: could not declare", name, err);
    return { ok: false, error: "Die Gruppe konnte nicht angelegt werden." };
  }
};

/** Updates the label and the note. The name is the key and does not change. */
export const describeDataGroup = async (
  name: string,
  input: { label?: string; note?: string },
): Promise<GroupResult> => {
  try {
    await writing()`
      UPDATE data_groups
      SET label = ${input.label?.trim() || null},
          note = ${input.note?.trim() || null}
      WHERE name = ${name}
    `;
    return { ok: true };
  } catch (err) {
    console.error("data-groups: could not describe", name, err);
    return { ok: false, error: "Die Beschreibung konnte nicht gespeichert werden." };
  }
};

/**
 * Stops a group counting as a data group.
 *
 * Nobody's directory membership changes - this only withdraws the declaration.
 * Once measurements carry a group this will need to refuse while rows still
 * point at it, or those rows would become unreachable; the foreign key will say
 * so, and the error is passed on rather than swallowed.
 */
export const withdrawDataGroup = async (name: string): Promise<GroupResult> => {
  try {
    await writing()`DELETE FROM data_groups WHERE name = ${name}`;
    return { ok: true };
  } catch (err) {
    console.error("data-groups: could not withdraw", name, err);
    return {
      ok: false,
      error:
        "Die Gruppe konnte nicht entfernt werden – vermutlich sind ihr noch " +
        "Daten zugeordnet.",
    };
  }
};
