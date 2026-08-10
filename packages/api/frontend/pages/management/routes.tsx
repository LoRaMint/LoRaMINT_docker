import type { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import { ssr } from "../../../config/ssr";
import { auth, manage } from "../../../config";
import { auditLog, logEntries, managed, measurements } from "../../../services";
import type { AuditFilter } from "../../../services/audit";
import type { LogEntryFilter } from "../../../services/log-entry";
import type { ManagedTable } from "../../../services/manage";
import {
  buildQuery,
  changedFields,
  currentScope,
  currentUser,
  hasRole,
  isConfirmed,
  parseAction,
  parseColumns,
  parseDirection,
  parseEditMode,
  parsePage,
  parseReason,
  parseRows,
  parseSelection,
  parseSort,
  type Params,
} from "../../../lib";
import type { PaginationParams } from "../../../lib/pagination";
import type { Datatype, MeasurementFilter } from "../../../types";
import type { ResourceSpec } from "../../components/manage/spec";
import ResourcePage from "./resource-page";
import ConfirmSavePage from "./confirm-save-page";
import ConfirmDeletePage from "./confirm-delete-page";
import ContinueDeletePage from "./continue-delete-page";
import AuditPage, { AUDIT_PATH, AUDIT_VIEW } from "./audit-page";
import AuditBatchPage from "./audit-batch-page";
import ConfirmRevertPage from "./confirm-revert-page";
import { resources } from "./resources";

/**
 * The three routes behind a managed dataset: the table, saving, deleting.
 *
 * Written once and registered per dataset, for the same reason the page itself
 * is one component - the interesting parts are identical, and a second copy is
 * a second place for the rules to drift apart. What differs between datasets is
 * small enough to fit in the backend below: which filter the address carries,
 * which service answers, and what makes a value acceptable.
 */

//====================================
// TYPES
//====================================

export type ResourceBackend<F> = {
  spec: ResourceSpec;
  /** The table `services/manage.ts` writes to. */
  table: ManagedTable;
  pageTitle: string;
  /** Reads the filter out of the query, field by field. */
  filterFrom: (query: Record<string, string>) => F;
  listRows: (
    pagination: PaginationParams,
    filter: F,
    sort: { column: string; direction: "asc" | "desc" },
  ) => Promise<{ rows: Record<string, unknown>[]; total: number }>;
  idsMatching: (filter: F, limit: number, before: Date | null) => Promise<string[]>;
  /** How many rows match, bounded the same way `idsMatching` is. */
  countMatching: (filter: F, before: Date | null) => Promise<number>;
  byIds: (ids: string[]) => Promise<Record<string, unknown>[]>;
  /** Options for the select filters, keyed by filter key. */
  options: (filter: F) => Promise<Record<string, string[]>>;
  /**
   * Takes the *stored* row, not just the value: a measurement is checked against
   * its own datatype, a log message against its length. Returns a sentence
   * naming the problem, or null.
   */
  validateField: (
    row: Record<string, unknown>,
    column: string,
    value: string | null,
  ) => string | null;
};

//====================================
// HELPERS
//====================================

/**
 * Rows per page. Small enough that "select the visible page" stays a decision
 * whose extent one can see.
 */
const PER_PAGE = 25;

/**
 * The view an action was started from, rebuilt from the hidden field it carried.
 *
 * Deliberately re-derived through the same parsers the page uses rather than
 * followed as a URL: what comes back is a set of known parameters with known
 * values, so it can only lead to a filtered view of this very page.
 */
const viewFrom = (raw: unknown, spec: ResourceSpec) => {
  const search = new URLSearchParams(
    typeof raw === "string" ? raw.replace(/^\?/, "") : "",
  );
  const query = Object.fromEntries(search.entries());
  const params: Params = {};

  for (const filter of spec.filters) {
    if (query[filter.key]) params[filter.key] = query[filter.key]!;
  }
  const columns = parseColumns(
    search.getAll("cols"),
    spec.columns.map((column) => column.key),
    spec.defaultColumns,
  );
  if (columns.join(",") !== spec.defaultColumns.join(",")) {
    params.cols = columns.join(",");
  }
  if (query.sort) params.sort = parseSort(query.sort, spec.sortable, spec.defaultSort);
  if (query.dir) params.dir = parseDirection(query.dir);
  const page = parsePage(query.page);
  if (page > 1) params.page = String(page);
  if (parseEditMode(query.edit)) params.edit = "1";

  return { params, query };
};

/** Submitted key/value pairs again, as hidden fields for the second submit. */
const repeatFields = (
  body: Record<string, unknown>,
  keep: (key: string) => boolean,
) => {
  const fields: { name: string; value: string }[] = [];
  for (const [name, raw] of Object.entries(body)) {
    if (name === "confirm" || !keep(name)) continue;
    for (const value of Array.isArray(raw) ? raw : [raw]) {
      if (typeof value === "string") fields.push({ name, value });
    }
  }
  return fields;
};

//====================================
// REGISTRATION
//====================================

export const registerResourceRoutes = <F,>(
  pages: Hono,
  backend: ResourceBackend<F>,
  guards: { requireRole: MiddlewareHandler; sameOrigin: MiddlewareHandler },
) => {
  const spec = backend.spec;

  /**
   * The table. The whole view state travels in the address, so this only has to
   * read it back and hand it on.
   */
  pages.get(
    spec.path,
    guards.requireRole,
    ...ssr(async (c) => {
      c.get("page").title = backend.pageTitle;
      const query = c.req.query();

      const visibleColumns = parseColumns(
        c.req.queries("cols"),
        spec.columns.map((column) => column.key),
        spec.defaultColumns,
      );
      const sort = parseSort(query.sort, spec.sortable, spec.defaultSort);
      const direction = parseDirection(query.dir);
      const page = parsePage(query.page);
      const filter = backend.filterFrom(query);

      const pagination = {
        page,
        perPage: PER_PAGE,
        offset: (page - 1) * PER_PAGE,
      };
      const [{ rows, total }, options] = await Promise.all([
        backend.listRows(pagination, filter, { column: sort, direction }),
        backend.options(filter),
      ]);

      return (
        <ResourcePage
          spec={spec}
          rows={rows}
          total={total}
          page={page}
          perPage={PER_PAGE}
          params={query}
          visibleColumns={visibleColumns}
          sort={sort}
          direction={direction}
          editing={parseEditMode(query.edit)}
          writable={manage.writable}
          options={options}
          message={query.msg ?? null}
        />
      );
    }),
  );

  /**
   * Saving: one row through its own button, or the ticked ones together.
   *
   * The single row is written straight away - a click on that row's button says
   * unambiguously which row it means. A selection goes through a confirmation
   * first, because nobody keeps twenty changed cells in their head. A value that
   * cannot be stored stops the whole batch: half a correction is worse than
   * none, because nothing on the page would say which half.
   */
  pages.post(
    `${spec.path}/save`,
    guards.requireRole,
    guards.sameOrigin,
    ...ssr(async (c) => {
      const body = await c.req.parseBody({ all: true });
      const view = viewFrom(body.view, spec);
      const back = (msg: string) =>
        c.redirect(`${spec.path}${buildQuery(view.params, { msg })}`, 303);

      if (!manage.writable) return back("nowrite");

      const action = parseAction(body);
      if (!action.ok) return back("badrequest");
      if (action.data.kind !== "saveRow" && action.data.kind !== "saveSelected") {
        return back("badrequest");
      }

      const wanted =
        action.data.kind === "saveRow"
          ? new Set([action.data.id])
          : new Set(parseSelection(body));

      const changes = parseRows(body, managed.editableColumnsOf(backend.table))
        .filter((row) => wanted.has(row.id))
        .map((row) => ({ id: row.id, fields: changedFields(row) }))
        .filter((change) => Object.keys(change.fields).length > 0);

      if (changes.length === 0) return back("nochange");

      // Checked against the stored row, never against what the form claimed it
      // to be.
      const current = await backend.byIds(changes.map((change) => change.id));
      const problems: Record<string, string> = {};
      for (const change of changes) {
        const row = current.find((candidate) => candidate.id === change.id);
        if (!row) {
          problems[`${change.id}.`] = "Diese Zeile gibt es nicht mehr.";
          continue;
        }
        for (const [column, field] of Object.entries(change.fields)) {
          const problem = backend.validateField(row, column, field.to);
          if (problem) problems[`${change.id}.${column}`] = problem;
        }
      }

      // Required, and checked before anything is written: the reason is what
      // makes the log entry mean something later. services/manage.ts refuses
      // without one as well, so no route can skip it by forgetting to ask.
      const reason = parseReason(body);
      if (!reason) return back("noreason");

      const blocked = Object.keys(problems).length > 0;
      const needsConfirmation =
        action.data.kind === "saveSelected" && !isConfirmed(body);

      if (blocked || needsConfirmation) {
        c.get("page").title = "Änderungen prüfen";
        const ids = new Set(changes.map((change) => change.id));
        return (
          <ConfirmSavePage
            spec={spec}
            changes={changes}
            problems={problems}
            view={buildQuery(view.params)}
            reason={reason}
            fields={[
              { name: "view", value: buildQuery(view.params) },
              { name: "saveSelected", value: "1" },
              { name: "reason", value: reason },
              ...repeatFields(body, (key) => {
                const parts = key.split(".");
                return parts[0] === "m" && ids.has(parts[1] ?? "");
              }),
              ...[...ids].map((id) => ({ name: "sel", value: id })),
            ]}
          />
        );
      }

      const user = currentUser()!;
      const result = await managed.updateRows(backend.table, changes, {
        username: user.username,
        displayName: user.displayName ?? null,
        scope: currentScope(),
        reason,
      });
      if (!result.ok) return back("failed");
      return back(result.data.kind === "conflict" ? "conflict" : "saved");
    }),
  );

  /**
   * Deleting: the ticked rows, or everything the filter matched.
   *
   * Always two steps, and the first shows the rows themselves - a count alone
   * does not convince anyone that the filter was right. The whole-result variant
   * carries the moment of the preview, so a row that arrived in the meantime
   * cannot be caught by a deletion that never showed it, and it counts again
   * before committing.
   */
  pages.post(
    `${spec.path}/delete`,
    guards.requireRole,
    guards.sameOrigin,
    ...ssr(async (c) => {
      const body = await c.req.parseBody({ all: true });
      const view = viewFrom(body.view, spec);
      const back = (msg: string) =>
        c.redirect(`${spec.path}${buildQuery(view.params, { msg })}`, 303);

      if (!manage.writable) return back("nowrite");

      const action = parseAction(body);
      if (!action.ok) return back("badrequest");
      if (action.data.kind !== "deleteSelected" && action.data.kind !== "deleteAll") {
        return back("badrequest");
      }

      const reason = parseReason(body);
      if (!reason) return back("noreason");

      const byFilter = action.data.kind === "deleteAll";

      // Frozen at the first step and carried along, so the second step resolves
      // the same set rather than whatever matches by then.
      const submittedPreviewAt =
        typeof body.previewAt === "string" ? Date.parse(body.previewAt) : Number.NaN;
      const previewAt = Number.isNaN(submittedPreviewAt)
        ? new Date()
        : new Date(submittedPreviewAt);

      const filter = backend.filterFrom(view.query);

      // How much is still there. For a deletion by filter this is the whole
      // matching set, however large - the block size below is about how much
      // goes at once, not about how much may go at all.
      const remaining = byFilter
        ? await backend.countMatching(filter, previewAt)
        : parseSelection(body).length;

      if (remaining === 0) return back("noselection");

      // Rows already removed by earlier blocks of this same deletion. Only a
      // continuation carries it; the first request starts at zero.
      const done =
        typeof body.done === "string" && /^\d+$/.test(body.done)
          ? Number(body.done)
          : 0;
      // What the user was shown at the very start, so a set that changed under
      // them is still noticed after the tenth block rather than only the first.
      const expected =
        typeof body.expected === "string" ? Number(body.expected) : Number.NaN;
      const countChanged =
        byFilter && Number.isFinite(expected) && expected - done !== remaining;

      if (!isConfirmed(body) || countChanged) {
        c.get("page").title = "Löschen bestätigen";
        const previewIds = byFilter
          ? await backend.idsMatching(filter, 20, previewAt)
          : parseSelection(body);
        // Awaited before the JSX: Solid compiles props into getters, and a
        // getter cannot be async.
        const preview = await backend.byIds(previewIds.slice(0, 20));
        return (
          <ConfirmDeletePage
            spec={spec}
            preview={preview}
            total={remaining}
            blockSize={byFilter ? manage.maxDeleteRows : null}
            view={buildQuery(view.params)}
            reason={reason}
            changedSince={
              countChanged ? { was: expected - done, now: remaining } : null
            }
            fields={[
              { name: "view", value: buildQuery(view.params) },
              { name: action.data.kind, value: "1" },
              { name: "reason", value: reason },
              ...(byFilter
                ? [
                    { name: "previewAt", value: previewAt.toISOString() },
                    { name: "expected", value: String(remaining) },
                  ]
                : previewIds.map((id) => ({ name: "sel", value: id }))),
            ]}
          />
        );
      }

      // One block. By filter that is the next `maxDeleteRows` of the previewed
      // set - `idsMatching` orders by created_at and the bound above keeps the
      // set from growing, so removing a block makes the next call return the
      // next one. A selection is a single page and never reaches the limit.
      const ids = byFilter
        ? await backend.idsMatching(filter, manage.maxDeleteRows, previewAt)
        : parseSelection(body);
      if (ids.length === 0) return back("noselection");
      if (ids.length > manage.maxDeleteRows) return back("toomany");

      const user = currentUser()!;
      const result = await managed.deleteRows(
        backend.table,
        ids,
        {
          username: user.username,
          displayName: user.displayName ?? null,
          scope: currentScope(),
          reason,
        },
        // Every block of one deletion joins the batch the first block opened, so
        // the log shows one operation and can take it back as one.
        asUuid(typeof body.batch === "string" ? body.batch : undefined),
      );
      if (!result.ok) return back("failed");

      const removed = done + result.data.deleted;
      const left = byFilter ? remaining - result.data.deleted : 0;
      if (left <= 0) return back("deleted");

      c.get("page").title = "Löschen läuft";
      return (
        <ContinueDeletePage
          spec={spec}
          done={removed}
          left={left}
          blockSize={manage.maxDeleteRows}
          view={buildQuery(view.params)}
          reason={reason}
          fields={[
            { name: "view", value: buildQuery(view.params) },
            { name: action.data.kind, value: "1" },
            { name: "reason", value: reason },
            { name: "previewAt", value: previewAt.toISOString() },
            // The original total, unchanged from block to block - only `done`
            // grows, and the guard above compares `expected - done` against what
            // the table still holds.
            { name: "expected", value: String(expected) },
            { name: "done", value: String(removed) },
            { name: "batch", value: result.data.batchId },
            { name: "confirm", value: "1" },
          ]}
        />
      );
    }),
  );
};

//====================================
// THE CHANGE LOG
//====================================

const UUID_PATTERN =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const asUuid = (raw: string | undefined) =>
  raw && UUID_PATTERN.test(raw) ? raw : undefined;

/** The log's own view state, rebuilt from a submitted query string. */
const auditViewFrom = (raw: unknown) => {
  const search = new URLSearchParams(
    typeof raw === "string" ? raw.replace(/^\?/, "") : "",
  );
  const query = Object.fromEntries(search.entries());
  const params: Params = {};
  for (const key of AUDIT_VIEW.filterKeys) {
    if (query[key]) params[key] = query[key]!;
  }
  if (query.sort) {
    params.sort = parseSort(query.sort, AUDIT_VIEW.sortable, AUDIT_VIEW.defaultSort);
  }
  if (query.dir) params.dir = parseDirection(query.dir);
  const page = parsePage(query.page);
  if (page > 1) params.page = String(page);
  return params;
};

const auditFilterFrom = (query: Record<string, string>): AuditFilter => ({
  username: query.username || undefined,
  action: query.action || undefined,
  table_name: query.table_name || undefined,
  row_id: asUuid(query.row_id),
  from: asDate(query.from),
  to: asDate(query.to),
});

/**
 * The change log: two read-only views for the management role, and one writing
 * route for administrators.
 *
 * Registered on its own rather than through the resource factory above: it has
 * no edit mode, no selection column and no delete bar, and its rows are
 * operations rather than table rows. Same building blocks, different page.
 */
export const registerAuditRoutes = (
  pages: Hono,
  guards: {
    requireRead: MiddlewareHandler;
    requireAdmin: MiddlewareHandler;
    sameOrigin: MiddlewareHandler;
  },
) => {
  /** Only administrators may take something back; everyone else just reads. */
  const mayRevert = () => hasRole(currentUser(), "admin", auth);

  pages.get(
    AUDIT_PATH,
    guards.requireRead,
    ...ssr(async (c) => {
      c.get("page").title = "Änderungsprotokoll";
      const query = c.req.query();

      const visibleColumns = parseColumns(
        c.req.queries("cols"),
        AUDIT_VIEW.columns,
        AUDIT_VIEW.defaultColumns,
      );
      const sort = parseSort(query.sort, AUDIT_VIEW.sortable, AUDIT_VIEW.defaultSort);
      const direction = parseDirection(query.dir);
      const page = parsePage(query.page);
      const pagination = { page, perPage: PER_PAGE, offset: (page - 1) * PER_PAGE };

      const [{ rows, total }, meta] = await Promise.all([
        auditLog.listBatches(pagination, auditFilterFrom(query), {
          column: sort,
          direction,
        }),
        auditLog.metadata(),
      ]);

      return (
        <AuditPage
          batches={rows}
          total={total}
          page={page}
          perPage={PER_PAGE}
          params={query}
          visibleColumns={visibleColumns}
          sort={sort}
          direction={direction}
          options={{ action: meta.actions, table_name: meta.tables }}
          canRevert={mayRevert()}
          message={query.msg ?? null}
        />
      );
    }),
  );

  pages.get(
    `${AUDIT_PATH}/:batchId`,
    guards.requireRead,
    ...ssr(async (c) => {
      c.get("page").title = "Vorgang";
      const batchId = asUuid(c.req.param("batchId"));
      const entries = batchId ? await auditLog.batch(batchId) : [];
      return (
        <AuditBatchPage
          entries={entries.map((entry) => ({
            ...entry,
            changes: auditLog.decodeChanges(entry.changes),
          }))}
          canRevert={mayRevert()}
          view={buildQuery(auditViewFrom(c.req.query("view")))}
          message={c.req.query("msg") ?? null}
        />
      );
    }),
  );

  /**
   * Taking an operation, or single changes within one, back.
   *
   * Two steps like every other writing path, and the confirmation says out loud
   * what will *not* happen: nothing leaves the log. Administrators only - the
   * button is hidden for everyone else, and this check is why that is merely
   * cosmetic.
   */
  pages.post(
    `${AUDIT_PATH}/revert`,
    guards.requireAdmin,
    guards.sameOrigin,
    ...ssr(async (c) => {
      const body = await c.req.parseBody({ all: true });
      const params = auditViewFrom(body.view);
      const view = buildQuery(params);
      const back = (msg: string) =>
        c.redirect(`${AUDIT_PATH}${buildQuery(params, { msg })}`, 303);

      if (!manage.writable) return back("nowrite");

      const batchId = typeof body.batch === "string" ? asUuid(body.batch) : undefined;
      const submitted = (Array.isArray(body.entry) ? body.entry : [body.entry])
        .filter((value): value is string => typeof value === "string")
        .map((value) => asUuid(value))
        .filter((value): value is string => value !== undefined);

      // A whole operation means every one of its changes that is still standing;
      // the ones already taken back are left alone rather than undone twice.
      const entries = batchId
        ? (await auditLog.batch(batchId)).filter((entry) => entry.reverted_by === null)
        : await auditLog.entriesByIds(submitted);

      if (entries.length === 0) return back("nothing");

      if (!isConfirmed(body)) {
        c.get("page").title = "Rücknahme bestätigen";
        return (
          <ConfirmRevertPage
            entries={entries}
            view={view}
            fields={[
              { name: "view", value: view },
              ...(batchId
                ? [{ name: "batch", value: batchId }]
                : entries.map((entry) => ({ name: "entry", value: String(entry.id) }))),
            ]}
          />
        );
      }

      const reason = parseReason(body);
      if (!reason) return back("noreason");

      const user = currentUser()!;
      const result = await managed.revertEntries(
        entries.map((entry) => String(entry.id)),
        {
          username: user.username,
          displayName: user.displayName ?? null,
          scope: currentScope(),
          reason,
        },
      );
      if (!result.ok) return back("failed");
      return back(result.data.kind === "conflict" ? "conflict" : "reverted");
    }),
  );
};

//====================================
// THE DATASETS
//====================================

/** A date only counts as a filter when it is one; an unparsable one is no filter. */
const asDate = (raw: string | undefined) =>
  raw && !Number.isNaN(Date.parse(raw)) ? raw : undefined;

/**
 * Read field by field rather than through a schema, so one malformed value does
 * not silently discard the rest of the filter - which would show far more rows
 * than were asked for, right next to a delete button. Every value stays a
 * parameter in the service's `filterClause`, so this is not where injection is
 * kept out; it is where the address is kept sensible.
 */
const measurementFilterFrom = (query: Record<string, string>): MeasurementFilter => ({
  device_eui: /^[0-9A-Fa-f]{16}$/.test(query.device_eui ?? "")
    ? query.device_eui
    : undefined,
  measurand: query.measurand || undefined,
  sensor: query.sensor || undefined,
  location: query.location || undefined,
  from: asDate(query.from),
  to: asDate(query.to),
});

const logEntryFilterFrom = (query: Record<string, string>): LogEntryFilter => ({
  device_eui: /^[0-9A-Fa-f]{16}$/.test(query.device_eui ?? "")
    ? query.device_eui
    : undefined,
  q: query.q || undefined,
  from: asDate(query.from),
  to: asDate(query.to),
});

export const measurementBackend: ResourceBackend<MeasurementFilter> = {
  spec: resources.measurements,
  table: "measurements",
  pageTitle: "Messwerte verwalten",
  filterFrom: measurementFilterFrom,
  listRows: measurements.listRows,
  idsMatching: measurements.idsMatching,
  countMatching: measurements.count,
  byIds: measurements.byIds,
  options: async (filter) => {
    // Narrowed by the selected device, so the other dropdowns only offer what
    // that device has actually sent.
    const meta = await measurements.metadata({ device_eui: filter.device_eui });
    return {
      device_eui: meta.devices,
      sensor: meta.sensors,
      measurand: meta.measurands,
      location: meta.locations,
    };
  },
  validateField: (row, column, value) =>
    measurements.validateField(row.datatype as Datatype, column, value),
};

export const logEntryBackend: ResourceBackend<LogEntryFilter> = {
  spec: resources.logEntries,
  table: "log_entries",
  pageTitle: "Logeinträge verwalten",
  filterFrom: logEntryFilterFrom,
  listRows: logEntries.listRows,
  idsMatching: logEntries.idsMatching,
  countMatching: logEntries.count,
  byIds: logEntries.byIds,
  options: async () => ({ device_eui: (await logEntries.metadata()).devices }),
  validateField: (_row, column, value) => logEntries.validateField(column, value),
};
