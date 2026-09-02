import Layout from "../../components/layout/Layout";
import { TrashIcon } from "../../components/icons";
import PageHeading from "../../components/PageHeading";
import Notice from "../../components/Notice";
import ModeSwitch from "../../components/manage/ModeSwitch";
import FilterBar from "../../components/manage/FilterBar";
import DataTable from "../../components/manage/DataTable";
import { columnsByKey, type FilterOption, type ResourceSpec } from "../../components/manage/spec";
import { PAGES } from "../../../lib";
import {
  buildQuery,
  columnSummary,
  filterChips,
  modeLink,
  pageLink,
  pageWindow,
  sortLink,
  type Params,
  type SortDirection,
} from "../../../lib/manage-view";

/**
 * The one page behind every managed dataset: searching, changing and deleting,
 * on a single sub-page whose whole state lives in the address.
 *
 * The table is the form. Its action saves; the delete buttons carry a
 * `formaction` and go elsewhere - one form, two destinations, no JavaScript.
 * Nothing here decides what a caller may do: the route checks the role, and
 * services/manage.ts decides which fields exist at all.
 */

//====================================
// MESSAGES
//====================================

/**
 * Feedback travels as a code in the query string and is turned into a fixed
 * sentence here, exactly like the error codes on /login. Nothing the caller
 * supplies is ever rendered.
 */
const MESSAGES: Record<string, { text: string; tone: "success" | "error" }> = {
  saved: { text: "Änderungen gespeichert.", tone: "success" },
  deleted: { text: "Zeilen gelöscht.", tone: "success" },
  nochange: { text: "Es gab nichts zu speichern.", tone: "success" },
  conflict: {
    text:
      "Mindestens eine Zeile wurde inzwischen von jemand anderem geändert. " +
      "Es wurde nichts gespeichert – bitte die aktuellen Werte prüfen.",
    tone: "error",
  },
  noselection: { text: "Es war nichts ausgewählt.", tone: "error" },
  // A deletion by filter runs in blocks and no longer hits this. It remains for
  // a selection, which the server refuses to take in one piece.
  toomany: {
    text:
      "Das sind zu viele Zeilen für einen Durchgang. Bitte weniger auswählen " +
      "oder über den Filter löschen, der in Blöcken arbeitet.",
    tone: "error",
  },
  nowrite: {
    text:
      "Auf diesem Server ist keine Verbindung zum Ändern von Daten eingerichtet.",
    tone: "error",
  },
  failed: {
    text: "Die Datenbank hat den Vorgang abgelehnt. Es wurde nichts geändert.",
    tone: "error",
  },
  badrequest: { text: "Die Anfrage war nicht eindeutig.", tone: "error" },
  noreason: {
    text:
      "Ohne Grund geht es nicht: er steht später im Protokoll und ist das " +
      "Einzige, was eine Korrektur dort erklärt. Es wurde nichts geändert.",
    tone: "error",
  },
};

//====================================
// PAGE
//====================================

export default function ResourcePage(props: {
  spec: ResourceSpec;
  rows: Record<string, unknown>[];
  total: number;
  page: number;
  perPage: number;
  /** The query parameters as they came in, already validated. */
  params: Params;
  visibleColumns: string[];
  sort: string;
  direction: SortDirection;
  editing: boolean;
  /** False when this server has no management connection configured. */
  writable: boolean;
  /** Options for the select filters, taken from the data. */
  options: Record<string, FilterOption[]>;
  /** A code from MESSAGES; never text the caller supplied. */
  message?: string | null;
}) {
  const spec = props.spec;
  const totalPages = Math.max(1, Math.ceil(props.total / props.perPage));
  const columns = columnsByKey(spec, props.visibleColumns);
  const editing = props.editing && props.writable && spec.capabilities.edit;

  const chips = [
    ...filterChips(props.params, spec.filters),
    ...(props.visibleColumns.join(",") !== spec.defaultColumns.join(",")
      ? [
          {
            key: "cols",
            label: "Spalten",
            value: columnSummary(
              props.visibleColumns,
              spec.columns.map((column) => column.key),
            ),
            queryWithout: buildQuery(props.params, { cols: null, page: null }),
          },
        ]
      : []),
  ];

  return (
    <Layout>
      <PageHeading
        title={spec.title}
        intro={spec.intro}
        back={PAGES.data}
      />

      {props.message && MESSAGES[props.message] && (
        <Notice tone={MESSAGES[props.message]!.tone}>
          {MESSAGES[props.message]!.text}
        </Notice>
      )}

      {spec.capabilities.edit && (
        <ModeSwitch
          editing={editing}
          available={props.writable}
          readHref={`${spec.path}${modeLink(props.params, false)}`}
          editHref={`${spec.path}${modeLink(props.params, true)}`}
        />
      )}

      <FilterBar
        action={spec.path}
        filters={spec.filters}
        options={props.options}
        values={props.params as Record<string, string | undefined>}
        columns={spec.columns}
        visibleColumns={props.visibleColumns}
        hidden={{
          edit: props.params.edit ?? undefined,
          sort: props.params.sort ?? undefined,
          dir: props.params.dir ?? undefined,
        }}
        chips={chips}
        resetHref={spec.path}
      />

      <p class="text-sm text-base-content/70 mb-2">
        {props.total} Treffer
        {totalPages > 1 && ` – Seite ${props.page} von ${totalPages}`}
      </p>

      <form method="post" action={`${spec.path}/save`} data-manage-form>
        {/* The view this was started from, so saving and cancelling return to
            exactly it. Re-parsed on the server rather than followed as a URL. */}
        <input type="hidden" name="view" value={buildQuery(props.params)} />

        {editing && (
          <div class="flex flex-wrap items-end gap-3 mb-3">
            <label class="block grow max-w-xl">
              <span class="block text-sm mb-1 text-base-content/80">
                Grund der Änderung <span class="text-error">*</span>
              </span>
              {/* `required` is the courtesy - the browser says so before the
                  round trip. The rule itself is enforced in the route and again
                  in services/manage.ts, which refuses to write without one. */}
              <input
                type="text"
                name="reason"
                required
                class="input input-sm w-full"
                placeholder="z. B. Skalenfaktor im Sketch falsch"
              />
            </label>
            <span class="text-sm text-base-content/70 pb-2">
              Pflichtfeld. Gilt für alles, was in diesem Zug gespeichert oder
              gelöscht wird, und steht später im Protokoll.
            </span>
          </div>
        )}

        <DataTable
          columns={columns}
          rows={props.rows}
          editing={editing}
          selectable={editing && spec.capabilities.select}
          rowActions={(row) => {
            const id = String(row.id ?? "");
            return (
              <>
                {editing && (
                  <button
                    type="submit"
                    name="saveRow"
                    value={id}
                    class="btn btn-xs btn-primary mr-1"
                  >
                    Speichern
                  </button>
                )}
                <a
                  href={`/management/data/audit?row_id=${encodeURIComponent(id)}`}
                  class="btn btn-xs btn-ghost"
                >
                  Verlauf
                </a>
              </>
            );
          }}
          sortable={spec.sortable}
          activeSort={props.sort}
          activeDirection={props.direction}
          sortHref={(column) =>
            `${spec.path}${sortLink(props.params, column, props.sort, props.direction)}`
          }
          emptyText={`Keine ${spec.title} für diesen Filter.`}
        />

        {editing && (
          <div class="flex flex-wrap items-center gap-3 mt-3">
            <span class="text-sm text-base-content/70" data-selected-count>
              Nichts ausgewählt
            </span>
            <button type="submit" name="saveSelected" value="1" class="btn btn-sm btn-primary">
              Auswahl speichern
            </button>
            <span class="grow" />
            {spec.capabilities.remove && (
              <>
                {/* Outline: this sits in a toolbar next to other actions, not
                    on a page whose only purpose is this one - red stays a signal
                    here rather than becoming a button colour. */}
                <button
                  type="submit"
                  name="deleteSelected"
                  value="1"
                  formaction={`${spec.path}/delete`}
                  class="btn btn-sm btn-outline btn-error gap-1.5"
                >
                  <TrashIcon class="h-3.5 w-3.5" />
                  Auswahl löschen
                </button>
                {/* Separate from the selection on purpose: a faulty series has
                    hundreds of rows and nobody ticks those page by page - but the
                    large action must never grow out of the small one by accident. */}
                <button
                  type="submit"
                  name="deleteAll"
                  value="1"
                  formaction={`${spec.path}/delete`}
                  class="btn btn-sm btn-error btn-outline"
                >
                  Alle {props.total} Treffer löschen
                </button>
              </>
            )}
          </div>
        )}
      </form>

      {totalPages > 1 && (
        <nav class="join mt-4" aria-label="Seiten">
          {/* Disabled rather than hidden at the ends: the row keeps its shape,
              so the numbers do not jump sideways when paging. */}
          <a
            href={`${spec.path}${pageLink(props.params, props.page - 1)}`}
            class={`btn btn-sm join-item ${props.page === 1 ? "btn-disabled" : ""}`}
            aria-disabled={props.page === 1 ? "true" : undefined}
          >
            Zurück
          </a>
          {pageWindow(props.page, totalPages).map((page) =>
            page === props.page ? (
              // The page one is standing on is a marker, not a link - clicking
              // it would only reload what is already there.
              <span
                class="btn btn-sm join-item btn-primary pointer-events-none"
                aria-current="page"
              >
                {page}
              </span>
            ) : (
              <a
                href={`${spec.path}${pageLink(props.params, page)}`}
                class="btn btn-sm join-item"
                aria-label={`Seite ${page}`}
              >
                {page}
              </a>
            ),
          )}
          <a
            href={`${spec.path}${pageLink(props.params, props.page + 1)}`}
            class={`btn btn-sm join-item ${props.page === totalPages ? "btn-disabled" : ""}`}
            aria-disabled={props.page === totalPages ? "true" : undefined}
          >
            Weiter
          </a>
        </nav>
      )}

      {/* Outside the table form on purpose - a form cannot be nested in a form.
          Closing needs no JavaScript: a submit button inside a <dialog> with
          `method="dialog"` closes it, and so does Escape.

          Styled directly rather than with daisyUI's .modal classes, for two
          reasons that both come from the same place. Tailwind's preflight sets
          `margin: 0` on everything, which takes away the `margin: auto` a
          browser uses to centre a modal dialog - so it has to be centred here.
          And daisyUI's .modal sets `::backdrop { display: none }` because it
          draws its own overlay, which would leave a plain dialog with no dimmed
          background at all. */}
      {editing && (
        <dialog
          id="reason-required"
          role="alertdialog"
          aria-labelledby="reason-required-title"
          class="fixed inset-0 m-auto h-fit w-11/12 max-w-md rounded-box border-2 border-error bg-base-200 p-6 text-base-content shadow-raised backdrop:bg-base-content/50"
        >
          <h3 id="reason-required-title" class="text-lg font-bold text-error mb-2">
            Grund fehlt
          </h3>
          <p class="mb-3">
            Bitte trage oben einen Grund ein, bevor du speicherst oder löschst. Er
            steht später im Änderungsprotokoll und ist das Einzige, was eine
            Korrektur dort erklärt.
          </p>
          <p class="text-sm text-base-content/70 mb-5">
            Deine Eingaben in der Tabelle bleiben erhalten.
          </p>
          {/* Primary, not error: the red frame is the message, but this button
              only closes the dialog and puts the cursor in the field. Red here
              would read as "this does something drastic". */}
          <form method="dialog" class="text-right">
            <button class="btn btn-primary">Grund eintragen</button>
          </form>
        </dialog>
      )}

      <script type="module" src="/public/manage.js" />
    </Layout>
  );
}
