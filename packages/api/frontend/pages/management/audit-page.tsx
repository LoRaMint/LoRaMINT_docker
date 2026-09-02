import Layout from "../../components/layout/Layout";
import PageHeading from "../../components/PageHeading";
import FilterBar from "../../components/manage/FilterBar";
import DataTable from "../../components/manage/DataTable";
import type { ColumnSpec, FilterOption, FilterSpec } from "../../components/manage/spec";
import {
  buildQuery,
  filterChips,
  pageLink,
  pageWindow,
  sortLink,
  type Params,
  type SortDirection,
} from "../../../lib/manage-view";
import { actionLabel, revertState, tableLabel } from "./audit-labels";
import Notice from "../../components/Notice";
import { PAGES } from "../../../lib";

/**
 * The change log, read as *operations* rather than as entries.
 *
 * Deleting four hundred measurements with one click is one thing that happened.
 * Listing it as four hundred rows would bury exactly the moment someone needs to
 * find, so each row here is one operation and the individual changes live on its
 * own page.
 *
 * Read-only for everyone who may see it. Administrators additionally get the
 * button that takes an operation back - which is itself a change, and appears in
 * this list a moment later as an operation of its own.
 */

export const AUDIT_PATH = "/management/data/audit";
const PATH = AUDIT_PATH;

const COLUMNS: ColumnSpec[] = [
  { key: "occurred_at", label: "Zeitpunkt", kind: "datetime" },
  { key: "who", label: "Benutzer" },
  { key: "what", label: "Aktion" },
  { key: "where", label: "Datenmenge" },
  { key: "row_count", label: "Zeilen" },
  { key: "reason", label: "Grund" },
  { key: "state", label: "Zustand" },
  { key: "batch_id", label: "Vorgang", secondary: true },
];

const FILTERS: FilterSpec[] = [
  { key: "username", label: "Benutzer", kind: "text", placeholder: "Anmeldename" },
  { key: "action", label: "Aktion", kind: "select" },
  { key: "table_name", label: "Datenmenge", kind: "select" },
  { key: "from", label: "von", kind: "date" },
  { key: "to", label: "bis", kind: "date" },
];

const SORTABLE = ["occurred_at", "username", "action", "table_name", "row_count"];

/** What the route needs to read the address before it can render this page. */
export const AUDIT_VIEW = {
  columns: COLUMNS.map((column) => column.key),
  defaultColumns: COLUMNS.filter((column) => !column.secondary).map((column) => column.key),
  sortable: SORTABLE,
  defaultSort: "occurred_at",
  filterKeys: [...FILTERS.map((filter) => filter.key), "row_id"],
};

const MESSAGES: Record<string, { text: string; tone: "success" | "error" }> = {
  reverted: {
    text:
      "Zurückgenommen. Der ursprüngliche Eintrag bleibt bestehen – die Rücknahme " +
      "steht als eigener Vorgang darüber.",
    tone: "success",
  },
  conflict: {
    text:
      "Mindestens eine betroffene Zeile sieht heute anders aus, als dieser Vorgang " +
      "sie hinterlassen hat. Es wurde nichts geändert.",
    tone: "error",
  },
  noreason: {
    text: "Ohne Grund geht es nicht – auch eine Rücknahme kommt ins Protokoll.",
    tone: "error",
  },
  nothing: { text: "Dieser Vorgang ist bereits vollständig zurückgenommen.", tone: "error" },
  failed: {
    text: "Die Datenbank hat den Vorgang abgelehnt. Es wurde nichts geändert.",
    tone: "error",
  },
  nowrite: {
    text: "Auf diesem Server ist keine Verbindung zum Ändern von Daten eingerichtet.",
    tone: "error",
  },
};

export default function AuditPage(props: {
  /** One row per operation, already aggregated by the service. */
  batches: Record<string, unknown>[];
  total: number;
  page: number;
  perPage: number;
  params: Params;
  visibleColumns: string[];
  sort: string;
  direction: SortDirection;
  options: Record<string, FilterOption[]>;
  /** True for the admin role: the only one who may take something back. */
  canRevert: boolean;
  message?: string | null;
}) {
  const totalPages = Math.max(1, Math.ceil(props.total / props.perPage));
  const columns = COLUMNS.filter((column) => props.visibleColumns.includes(column.key));

  // The computed columns are put on the row here rather than in the query: they
  // are how the operation reads, not what the database holds.
  const rows = props.batches.map((batch) => {
    const rowCount = Number(batch.row_count ?? 0);
    const reverted = Number(batch.reverted_count ?? 0);
    return {
      ...batch,
      who: batch.display_name ?? batch.username,
      what: actionLabel(batch.action),
      where: tableLabel(batch.table_name),
      state: revertState(rowCount, reverted).label,
      _open: reverted < rowCount,
    };
  });

  const chips = filterChips(props.params, [
    ...FILTERS,
    { key: "row_id", label: "Datenzeile" },
  ]);

  return (
    <Layout>
      <PageHeading
        title="Änderungsprotokoll"
        intro="Jede Änderung über die Verwaltung steht hier – und bleibt hier. Etwas zurückzunehmen löscht nichts, sondern kommt als weiterer Vorgang dazu."
        back={PAGES.data}
      />

      {props.message && MESSAGES[props.message] && (
        <Notice tone={MESSAGES[props.message]!.tone}>
          {MESSAGES[props.message]!.text}
        </Notice>
      )}

      <FilterBar
        action={PATH}
        filters={FILTERS}
        options={props.options}
        values={props.params as Record<string, string | undefined>}
        columns={COLUMNS}
        visibleColumns={props.visibleColumns}
        hidden={{
          sort: props.params.sort ?? undefined,
          dir: props.params.dir ?? undefined,
          row_id: props.params.row_id ?? undefined,
        }}
        chips={chips}
        resetHref={PATH}
      />

      <p class="text-sm text-base-content/70 mb-2">
        {props.total} Vorgänge
        {totalPages > 1 && ` – Seite ${props.page} von ${totalPages}`}
      </p>

      {/* The form only exists to carry the undo button; the table itself is
          read-only for everyone. */}
      <form method="post" action={`${PATH}/revert`}>
        <input type="hidden" name="view" value={buildQuery(props.params)} />
        <DataTable
          columns={columns}
          rows={rows}
          editing={false}
          selectable={false}
          rowActions={(row) => {
            const batchId = String(row.batch_id ?? "");
            return (
              <>
                <a
                  href={`${PATH}/${encodeURIComponent(batchId)}`}
                  class="btn btn-xs btn-ghost mr-1"
                >
                  Öffnen
                </a>
                {props.canRevert && row._open === true && (
                  <button
                    type="submit"
                    name="batch"
                    value={batchId}
                    class="btn btn-xs btn-outline btn-error"
                  >
                    Rückgängig
                  </button>
                )}
              </>
            );
          }}
          sortable={SORTABLE}
          activeSort={props.sort}
          activeDirection={props.direction}
          sortHref={(column) =>
            `${PATH}${sortLink(props.params, column, props.sort, props.direction)}`
          }
          emptyText="Keine Vorgänge für diesen Filter."
        />
      </form>

      {totalPages > 1 && (
        <nav class="join mt-4" aria-label="Seiten">
          <a
            href={`${PATH}${pageLink(props.params, props.page - 1)}`}
            class={`btn btn-sm join-item ${props.page === 1 ? "btn-disabled" : ""}`}
          >
            Zurück
          </a>
          {pageWindow(props.page, totalPages).map((page) =>
            page === props.page ? (
              <span class="btn btn-sm join-item btn-primary pointer-events-none" aria-current="page">
                {page}
              </span>
            ) : (
              <a href={`${PATH}${pageLink(props.params, page)}`} class="btn btn-sm join-item">
                {page}
              </a>
            ),
          )}
          <a
            href={`${PATH}${pageLink(props.params, props.page + 1)}`}
            class={`btn btn-sm join-item ${props.page === totalPages ? "btn-disabled" : ""}`}
          >
            Weiter
          </a>
        </nav>
      )}
    </Layout>
  );
}
