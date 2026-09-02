import Layout from "../../components/layout/Layout";
import TableFrame from "../../components/TableFrame";
import LocalTime from "../../components/LocalTime";
import PageHeading from "../../components/PageHeading";
import Notice from "../../components/Notice";
import Field from "../../components/Field";
import type { DataGroup } from "../../../services/data-groups";
import SectionHeading from "../../components/SectionHeading";
import { PAGES } from "../../../lib";

/**
 * Declaring which directory groups count as data groups.
 *
 * The page manages *names*, never people. Who is in a group is the directory's
 * answer and stays there - there is no control here that could add somebody to
 * one, and that is the guarantee, not an omission. See services/data-groups.ts.
 *
 * Nothing is restricted by these yet. The page exists so the declaration can be
 * made and checked before measurements start carrying a group, rather than both
 * arriving at once.
 */
export default function DataGroupsPage(props: {
  groups: DataGroup[];
  /** The signed-in user's own directory groups, to suggest from. */
  ownGroups: string[];
  saved?: string;
  error?: string;
}) {
  const declared = new Set(props.groups.map((group) => group.name));
  const suggestions = props.ownGroups.filter((group) => !declared.has(group));

  return (
    <Layout>
      <PageHeading title={PAGES.groups.label} />

      {props.saved && <Notice tone="success">{props.saved}</Notice>}
      {props.error && <Notice tone="error">{props.error}</Notice>}

      <div class="max-w-3xl text-sm text-base-content/70 mb-6 space-y-2">
        <p>
          Hier wird festgelegt, <strong>welche</strong> Verzeichnisgruppen als
          Datengruppen gelten – eine echte Teilmenge dessen, was im Verzeichnis
          steht. Wer in einer Gruppe ist, entscheidet weiterhin allein das
          Verzeichnis; diese Seite kann niemanden in eine Gruppe aufnehmen.
        </p>
        <p>
          Die drei Rollengruppen gehören nicht hierher. Sie regeln,{" "}
          <em>was</em> jemand tun darf; eine Datengruppe regelt, <em>welche</em>{" "}
          Daten gemeint sind. Der Eintrag einer Rollengruppe wird abgewiesen.
        </p>
        <p class="text-base-content/50">
          Noch ohne Wirkung: Messwerte tragen bisher keine Gruppe.
        </p>
      </div>

      <TableFrame class="mb-8">
          <thead>
            <tr>
              <th>Verzeichnisgruppe</th>
              <th>Bezeichnung</th>
              <th>Notiz</th>
              <th>Angelegt</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {props.groups.length === 0 ? (
              <tr>
                <td colspan={5} class="text-base-content/60">
                  Noch keine Datengruppe erklärt.
                </td>
              </tr>
            ) : (
              props.groups.map((group) => (
                <tr>
                  <td>
                    <code>{group.name}</code>
                  </td>
                  {/* Editable in place: a label typed once is the thing most
                      likely to want correcting, and taking the group away and
                      re-declaring it would be a strange way to fix a typo. */}
                  <td colspan={2}>
                    <form
                      method="post"
                      action="/management/groups/describe"
                      class="flex flex-wrap items-center gap-2"
                    >
                      <input type="hidden" name="name" value={group.name} />
                      <input
                        name="label"
                        value={group.label ?? ""}
                        placeholder="Bezeichnung"
                        class="input input-sm w-40"
                      />
                      <input
                        name="note"
                        value={group.note ?? ""}
                        placeholder="Notiz"
                        class="input input-sm w-64"
                      />
                      <button type="submit" class="btn btn-ghost btn-xs">
                        Übernehmen
                      </button>
                    </form>
                  </td>
                  <td class="whitespace-nowrap text-base-content/60">
                    <LocalTime at={group.createdAt} />
                    {group.createdBy && <> von {group.createdBy}</>}
                  </td>
                  <td>
                    <form method="post" action="/management/groups/withdraw">
                      <input type="hidden" name="name" value={group.name} />
                      <button type="submit" class="btn btn-ghost btn-xs">
                        Entfernen
                      </button>
                    </form>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </TableFrame>

      <SectionHeading>
        Gruppe erklären
      </SectionHeading>

      <form method="post" action="/management/groups" class="max-w-3xl space-y-3">
        <Field label="Name im Verzeichnis" required class="max-w-md">
          <input
            name="name"
            required
            list="own-groups"
            placeholder="klasse-8b"
            class="input w-full font-mono"
          />
          {/* The signer's own groups as suggestions: the name has to match the
              directory exactly, and typing it from memory is how it ends up not
              matching anything and quietly granting nobody anything. */}
          <datalist id="own-groups">
            {suggestions.map((group) => (
              <option value={group} />
            ))}
          </datalist>
          {suggestions.length > 0 && (
            <p class="text-sm text-base-content/60 mt-1">
              Deine eigenen Gruppen stehen als Vorschlag im Feld.
            </p>
          )}
        </Field>

        <Field label="Bezeichnung (optional)" class="max-w-md">
          <input
            name="label"
            placeholder="Klasse 8b"
            class="input w-full"
          />
        </Field>

        <Field label="Notiz (optional)" class="max-w-md">
          <textarea
            name="note"
            rows={2}
            class="textarea w-full"
          />
        </Field>

        <button type="submit" class="btn btn-primary">
          Erklären
        </button>
      </form>
    </Layout>
  );
}
