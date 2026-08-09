import Layout from "../../components/layout/Layout";
import TableFrame from "../../components/TableFrame";
import PageHeading from "../../components/PageHeading";
import type { ColumnSpec, ResourceSpec } from "../../components/manage/spec";
import type { RowChange } from "../../../services/manage";
import Notice from "../../components/Notice";
import { Muted } from "../../components/Row";

/**
 * What "Auswahl speichern" is about to do, listed cell by cell.
 *
 * Only the cells that moved appear here. For one correction that is one line and
 * one click; for twenty it is the only place the twenty are visible at once.
 * Saving a single row through its own button skips this page, because a click on
 * that row's button is already unambiguous about which row it means.
 *
 * The same page carries a refusal: when a value cannot be stored, the changes are
 * shown with the problem beside them and there is no button to go on.
 */

const labelOf = (columns: ColumnSpec[], key: string) =>
  columns.find((column) => column.key === key)?.label ?? key;

export default function ConfirmSavePage(props: {
  spec: ResourceSpec;
  changes: RowChange[];
  /** Problems keyed by `<id>.<column>`; when non-empty nothing may be saved. */
  problems: Record<string, string>;
  /** The view this started from, handed back so the answer returns to it. */
  view: string;
  reason: string | null;
  /** Everything needed to repeat the request, as it was submitted. */
  fields: { name: string; value: string }[];
}) {
  const total = props.changes.reduce(
    (sum, change) => sum + Object.keys(change.fields).length,
    0,
  );
  const blocked = Object.keys(props.problems).length > 0;

  return (
    <Layout>
      <PageHeading
        title={`${props.spec.title}: Änderungen prüfen`}
        back={{ href: `${props.spec.path}${props.view}`, label: "Zurück zur Tabelle" }}
      />

      {blocked ? (
        <Notice tone="error">
          So lässt sich das nicht speichern. Es wurde nichts geändert – bitte die
          markierten Felder korrigieren.
        </Notice>
      ) : (
        <Notice tone="warning">
          <strong>
            {total} Feld{total === 1 ? "" : "er"}
          </strong>{" "}
          in {props.changes.length} Zeile{props.changes.length === 1 ? "" : "n"} wird
          geändert. Gespeichert ist noch nichts.
        </Notice>
      )}

      <TableFrame class="mb-4">
          <thead>
            <tr>
              <th>Zeile</th>
              <th>Feld</th>
              <th>vorher</th>
              <th>nachher</th>
            </tr>
          </thead>
          <tbody>
            {props.changes.flatMap((change) =>
              Object.entries(change.fields).map(([column, field]) => {
                const problem = props.problems[`${change.id}.${column}`];
                return (
                  <tr class={problem ? "bg-error/10" : undefined}>
                    <td class="font-mono text-xs">{change.id.slice(0, 8)}…</td>
                    <td>{labelOf(props.spec.columns, column)}</td>
                    <td class="font-mono text-sm">
                      {field.from === null ? (
                        <Muted>leer</Muted>
                      ) : (
                        field.from
                      )}
                    </td>
                    <td class="font-mono text-sm">
                      {field.to === null ? (
                        <Muted>leer</Muted>
                      ) : (
                        field.to
                      )}
                      {problem && (
                        <span class="block text-error text-xs mt-1">{problem}</span>
                      )}
                    </td>
                  </tr>
                );
              }),
            )}
          </tbody>
        </TableFrame>

      {props.reason && (
        <p class="text-sm text-base-content/70 mb-4">
          Grund: <span class="italic">{props.reason}</span>
        </p>
      )}

      <form method="post" action={`${props.spec.path}/save`} class="flex flex-wrap gap-3">
        {props.fields.map((field) => (
          <input type="hidden" name={field.name} value={field.value} />
        ))}
        <input type="hidden" name="confirm" value="1" />
        {!blocked && (
          <button type="submit" name="saveSelected" value="1" class="btn btn-primary">
            {total} Änderung{total === 1 ? "" : "en"} speichern
          </button>
        )}
        <a href={`${props.spec.path}${props.view}`} class="btn btn-ghost">
          Abbrechen
        </a>
      </form>
    </Layout>
  );
}
