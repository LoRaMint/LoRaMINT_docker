import Layout from "../../components/layout/Layout";
import PageHeading from "../../components/PageHeading";
import DataTable from "../../components/manage/DataTable";
import { columnsByKey, type ResourceSpec } from "../../components/manage/spec";
import Notice from "../../components/Notice";

/**
 * What a deletion is about to remove - as rows, not as a number.
 *
 * A count alone does not convince anyone that the filter was right; the rows do.
 * The first twenty are shown and the rest is counted, and the count is repeated
 * inside the button, so the size of the action is where the click is.
 *
 * The form carries everything needed to repeat the request, including the moment
 * the preview was taken: the confirmation deletes what was shown, not whatever
 * matches the filter by the time it is clicked.
 */
export default function ConfirmDeletePage(props: {
  spec: ResourceSpec;
  /** The first rows that would go, for looking at. */
  preview: Record<string, unknown>[];
  total: number;
  /**
   * How many rows go per block, for a deletion by filter - null for a
   * selection, which is one page and always goes in one.
   */
  blockSize?: number | null;
  /** The view this started from. */
  view: string;
  reason: string | null;
  fields: { name: string; value: string }[];
  /** Set when the result changed since the preview and nothing was deleted. */
  changedSince?: { was: number; now: number } | null;
}) {
  const rest = props.total - props.preview.length;
  const columns = columnsByKey(props.spec, props.spec.defaultColumns);
  const blocks =
    props.blockSize && props.total > props.blockSize
      ? Math.ceil(props.total / props.blockSize)
      : 0;

  return (
    <Layout>
      <PageHeading
        title={`${props.spec.title} löschen`}
        back={{ href: `${props.spec.path}${props.view}`, label: "Zurück zur Tabelle" }}
      />

      {props.changedSince && (
        <Notice tone="error">
          Die Trefferzahl hat sich seit der Vorschau geändert ({props.changedSince.was} →{" "}
          {props.changedSince.now}). Es wurde nichts gelöscht – bitte erneut prüfen.
        </Notice>
      )}

      <Notice tone="warning">
        <p>
          <strong>
            {props.total} {props.spec.title}
          </strong>{" "}
          werden endgültig gelöscht. Gelöscht ist noch nichts.
        </p>
        <p class="text-sm mt-1 text-base-content/70">
          Jede entfernte Zeile wird vollständig im Änderungsprotokoll
          festgehalten – das ist es, was das Zurücknehmen möglich macht, und es
          sind entsprechend {props.total} Protokollzeilen mit dem jeweiligen
          Vollabbild.
        </p>
        {blocks > 0 && (
          <p class="text-sm mt-1 text-base-content/70">
            Gelöscht wird in {blocks} Blöcken zu je {props.blockSize}, damit die
            Tabelle zwischendurch frei ist und ankommende Messwerte nicht warten
            müssen. Nach jedem Block ist zu sehen, wie weit es ist, und der
            Vorgang lässt sich dort anhalten.
          </p>
        )}
      </Notice>

      <DataTable
        columns={columns}
        rows={props.preview}
        editing={false}
        selectable={false}
        sortable={[]}
        activeSort=""
        activeDirection="desc"
        sortHref={() => "#"}
        emptyText="Diese Zeilen gibt es nicht mehr."
      />

      {rest > 0 && (
        <p class="text-sm text-base-content/60 mt-2">
          … und {rest} weitere.
        </p>
      )}

      {props.reason && (
        <p class="text-sm text-base-content/70 mt-4">
          Grund: <span class="italic">{props.reason}</span>
        </p>
      )}

      <form
        method="post"
        action={`${props.spec.path}/delete`}
        class="flex flex-wrap gap-3 mt-4"
      >
        {props.fields.map((field) => (
          <input type="hidden" name={field.name} value={field.value} />
        ))}
        <input type="hidden" name="confirm" value="1" />
        <button type="submit" class="btn btn-error">
          {blocks > 0
            ? `${props.total} ${props.spec.title} löschen – erster Block`
            : `${props.total} ${props.spec.title} endgültig löschen`}
        </button>
        <a href={`${props.spec.path}${props.view}`} class="btn btn-ghost">
          Abbrechen
        </a>
      </form>
    </Layout>
  );
}
