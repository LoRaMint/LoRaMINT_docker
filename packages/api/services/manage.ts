import { SQL } from "bun";
import { manage } from "../config";
import { inverseOf } from "../lib/audit-revert";
import type { MutationResult } from "../types";

/**
 * The write side of the management pages: correcting and deleting rows, and
 * recording both in the change log.
 *
 * Everything here runs on DATABASE_URL_MANAGE, a role that may read and write
 * the data tables but only append to `audit_log` - see
 * dev_scripts/create-manage-role.sql. Reading for the pages themselves stays on
 * the application's own connection like everywhere else; only changes come
 * through here. The point is that "the pages cannot rewrite the log" is a fact
 * about the database rather than a claim about this file.
 *
 * Every change and its log entry share one transaction. There is deliberately no
 * code path that writes one without the other.
 */

//====================================
// TYPES
//====================================

export type ManagedTable = "measurements" | "log_entries";

/** What one field moved from and to. `null` is a real value here, not "absent". */
export type FieldChange = { from: string | null; to: string | null };

export type RowChange = { id: string; fields: Record<string, FieldChange> };

/**
 * Who is making the change, and why.
 *
 * The identity comes from the session, never from the submitted form. The reason
 * is required: a log entry saying that someone changed 235 into 23.5 without
 * saying why is a record that a correction happened, not a record of what it
 * was - and a corrected series nobody can account for is worth less than an
 * obviously broken one.
 *
 * The moment of the change is not in here on purpose. `audit_log.occurred_at`
 * defaults to `now()` and is never part of an INSERT, so it is the database's
 * clock at the moment of the write. There is no code path through which a caller
 * could suggest a different one.
 */
export type Actor = {
  username: string;
  displayName: string | null;
  reason: string;
};

export type SaveOutcome =
  | { kind: "saved"; updated: number; batchId: string }
  /**
   * At least one row no longer held the value the form was built from, so
   * nothing was written: someone else changed it in the meantime.
   */
  | { kind: "conflict"; ids: string[] };

export type DeleteOutcome = { deleted: number; batchId: string };

//====================================
// COLUMNS
//====================================

/**
 * The columns a management page may change, with the type each value is cast to.
 *
 * This is the boundary, not the column picker in the interface: that one lives
 * in the URL and the caller controls it. A column missing here cannot be written
 * however the request is shaped - `device_eui`, `datatype`, `time_method`,
 * `created_at` and `id` are the origin of a measurement, not a correction.
 *
 * For log entries only the message itself: the device it came from and when it
 * arrived are its origin, the same way they are for a measurement.
 */
const EDITABLE_COLUMNS: Record<ManagedTable, Record<string, string>> = {
  measurements: {
    value: "text",
    unit: "text",
    measurand: "text",
    sensor: "text",
    location: "text",
    recorded_at: "timestamptz",
  },
  log_entries: {
    message: "text",
  },
};

export const editableColumnsOf = (table: ManagedTable) =>
  Object.keys(EDITABLE_COLUMNS[table]);

//====================================
// CONNECTION
//====================================

/**
 * Created on first use, so importing this module opens no connection - the
 * feature is optional and the tests import it for the pure helpers.
 */
let client: SQL | null = null;
const writeClient = () => {
  if (!manage.databaseUrl) return null;
  if (!client) client = new SQL(manage.databaseUrl);
  return client;
};

const NOT_CONFIGURED =
  "Das Ändern von Daten ist auf diesem Server nicht eingerichtet.";

const NO_REASON = "Bitte einen Grund angeben – er gehört zum Protokolleintrag.";

/**
 * Checked here rather than only in the form, so no route can write without one
 * by forgetting to ask.
 */
const hasReason = (actor: Actor) =>
  typeof actor.reason === "string" && actor.reason.trim().length > 0;

const UUID_PATTERN =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/**
 * What to answer when the database refused an operation for a reason the checks
 * above did not anticipate.
 *
 * The message the routes show is a fixed code either way - they map every
 * failure to "failed" and never render what is returned here. That is right for
 * the person at the screen and useless for whoever has to find out why, so the
 * real reason goes to the log. Without this line an unexpected failure left no
 * trace anywhere at all: the user saw a sentence, and the server had nothing.
 */
const dbFailure = (operation: string, err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`manage: ${operation} failed:`, message);
  return { ok: false as const, error: message.split("\n")[0]! };
};

/**
 * The ids as a Postgres array literal, to be *bound as one parameter* and cast
 * with `::uuid[]`.
 *
 * Bun's driver turns a JavaScript array into a comma-joined string rather than
 * an array parameter, so `ANY($1)` with a plain array fails. The literal stays a
 * parameter value and never becomes part of the statement, so this is not string
 * building: anything that is not a uuid is rejected by the cast, not executed.
 * The check above only exists to answer with a sentence instead of a Postgres
 * error.
 */
const uuidArray = (ids: string[]) => `{${ids.join(",")}}`;

//====================================
// CHANGES
//====================================

class Conflict extends Error {
  constructor(readonly ids: string[]) {
    super("row changed in the meantime");
  }
}

/**
 * Applies `changes` and writes one log entry per row, in a single transaction.
 *
 * The previous value of every changed column goes into the `WHERE` clause. A row
 * that no longer matches is not an error but a lost race, and it aborts the
 * whole batch rather than saving part of it: a half-applied correction is worse
 * than none, because nothing on the page says which half.
 */
const updateRows = async (
  table: ManagedTable,
  changes: RowChange[],
  actor: Actor,
): Promise<MutationResult<SaveOutcome>> => {
  const sql = writeClient();
  if (!sql) return { ok: false, error: NOT_CONFIGURED };
  if (!hasReason(actor)) return { ok: false, error: NO_REASON };
  if (changes.length === 0) return { ok: false, error: "Keine Änderungen." };

  const casts = EDITABLE_COLUMNS[table];
  for (const change of changes) {
    for (const column of Object.keys(change.fields)) {
      // Defence in depth: the form parser already dropped anything unknown.
      // hasOwn rather than `in`, which also answers for the prototype chain and
      // would call `constructor` and `toString` editable columns.
      if (!Object.hasOwn(casts, column)) {
        return { ok: false, error: `Feld ${column} kann nicht geändert werden.` };
      }
    }
    if (Object.keys(change.fields).length === 0) {
      return { ok: false, error: "Keine Änderungen." };
    }
  }

  const batchId = crypto.randomUUID();

  try {
    const updated = await sql.begin(async (tx) => {
      await tx.unsafe(`SET LOCAL statement_timeout = ${manage.timeoutMs}`);

      const conflicts: string[] = [];
      let applied = 0;

      for (const change of changes) {
        const columns = Object.keys(change.fields);
        const values: (string | null)[] = [];

        // $1..$n the new values, then the id, then the previous values. Column
        // names and casts come from EDITABLE_COLUMNS, never from the request.
        const setClause = columns
          .map((column) => {
            values.push(change.fields[column]!.to);
            return `${column} = $${values.length}::${casts[column]}`;
          })
          .join(", ");

        values.push(change.id);
        const idPlaceholder = `$${values.length}::uuid`;

        // IS NOT DISTINCT FROM, because a previous value of NULL is a value:
        // `recorded_at = NULL` would never match.
        const guardClause = columns
          .map((column) => {
            values.push(change.fields[column]!.from);
            return `${column} IS NOT DISTINCT FROM $${values.length}::${casts[column]}`;
          })
          .join(" AND ");

        const result = (await tx.unsafe(
          `UPDATE ${table} SET ${setClause} WHERE id = ${idPlaceholder} AND ${guardClause}`,
          values,
        )) as unknown as { count?: number };

        if (typeof result?.count !== "number" || result.count === 0) {
          conflicts.push(change.id);
          continue;
        }
        applied += result.count;

        // ::text::jsonb, not ::jsonb. Against a jsonb parameter the driver
        // encodes the string a second time, and the entry ends up as a jsonb
        // *string* holding JSON rather than the object itself - readable in psql,
        // useless to query. The detour through text makes Postgres parse it.
        await tx`
          INSERT INTO audit_log (username, display_name, action, table_name, row_id, batch_id, changes, reason)
          VALUES (
            ${actor.username}, ${actor.displayName}, 'update', ${table},
            ${change.id}::uuid, ${batchId}::uuid,
            ${JSON.stringify({ fields: change.fields })}::text::jsonb, ${actor.reason}
          )
        `;
      }

      // Rolls the whole batch back, including the log entries already inserted.
      if (conflicts.length > 0) throw new Conflict(conflicts);
      return applied;
    });

    return { ok: true, data: { kind: "saved", updated: updated as number, batchId } };
  } catch (err) {
    if (err instanceof Conflict) {
      return { ok: true, data: { kind: "conflict", ids: err.ids } };
    }
    return dbFailure(`update on ${table}`, err);
  }
};

//====================================
// DELETION
//====================================

/**
 * Removes the given rows and records each one, in a single transaction.
 *
 * Deleting by id rather than by filter is what makes this safe to confirm: an id
 * set can only shrink between the preview and the confirmation, never grow, so a
 * measurement that arrived in the meantime cannot be caught by a deletion that
 * never showed it. Rows already gone are simply not deleted twice, which is why
 * the caller reports the returned count rather than the requested one.
 *
 * The log entry keeps the whole row - after a deletion there is nothing left to
 * look at - and it is built inside the database with `to_jsonb`, so a bulk
 * delete does not travel through this process row by row.
 *
 * `batchId` may be supplied by the caller, which is how a deletion that runs in
 * blocks stays one operation: forty requests removing ten thousand rows each are
 * one thing somebody did, and the change log has to be able to show it - and
 * undo it - as one. Left out, each call is its own batch.
 */
const deleteRows = async (
  table: ManagedTable,
  ids: string[],
  actor: Actor,
  continuing?: string,
): Promise<MutationResult<DeleteOutcome>> => {
  const sql = writeClient();
  if (!sql) return { ok: false, error: NOT_CONFIGURED };
  if (!hasReason(actor)) return { ok: false, error: NO_REASON };
  if (ids.length === 0) return { ok: false, error: "Nichts ausgewählt." };
  if (ids.length > manage.maxDeleteRows) {
    return {
      ok: false,
      error:
        `Es lassen sich höchstens ${manage.maxDeleteRows} Zeilen auf einmal ` +
        `löschen. Bitte den Filter enger fassen.`,
    };
  }
  if (!ids.every((id) => UUID_PATTERN.test(id))) {
    return { ok: false, error: "Ungültige Auswahl." };
  }

  // A caller-supplied batch has to look like one, or a crafted field could tie
  // this deletion onto an unrelated operation in the log.
  if (continuing !== undefined && !UUID_PATTERN.test(continuing)) {
    return { ok: false, error: "Ungültiger Vorgang." };
  }
  const batchId = continuing ?? crypto.randomUUID();
  const idList = uuidArray(ids);

  try {
    const deleted = await sql.begin(async (tx) => {
      await tx.unsafe(`SET LOCAL statement_timeout = ${manage.timeoutMs}`);

      await tx.unsafe(
        `INSERT INTO audit_log (username, display_name, action, table_name, row_id, batch_id, changes, reason)
         SELECT $1, $2, 'delete', $3, t.id, $4::uuid,
                jsonb_build_object('before', to_jsonb(t)), $5
           FROM ${table} t
          WHERE t.id = ANY($6::uuid[])`,
        [actor.username, actor.displayName, table, batchId, actor.reason, idList],
      );

      const result = (await tx.unsafe(
        `DELETE FROM ${table} WHERE id = ANY($1::uuid[])`,
        [idList],
      )) as unknown as { count?: number };

      return typeof result?.count === "number" ? result.count : 0;
    });

    return { ok: true, data: { deleted: deleted as number, batchId } };
  } catch (err) {
    return dbFailure(`delete on ${table}`, err);
  }
};

//====================================
// UNDOING
//====================================

export type RevertOutcome =
  | { kind: "reverted"; count: number; batchId: string }
  | { kind: "conflict"; ids: string[] };

/**
 * Takes back what the given log entries recorded - and records the taking-back.
 *
 * Nothing is removed or rewritten. The original entry stays exactly as it was,
 * the opposite operation runs, and that operation is logged as a new entry
 * pointing at the one it undid. A correction, its undo, and the undo of that
 * undo are three rows and one readable chain; that is the whole reason the log
 * exists.
 *
 * Newest first, so an undo of an undo unwinds from the end of the chain rather
 * than fighting it. A row that no longer holds what the entry left behind is a
 * lost race and aborts everything: half an undo is the worst possible state,
 * because nothing on the page would say which half.
 */
const revertEntries = async (
  entryIds: string[],
  actor: Actor,
): Promise<MutationResult<RevertOutcome>> => {
  const sql = writeClient();
  if (!sql) return { ok: false, error: NOT_CONFIGURED };
  if (!hasReason(actor)) return { ok: false, error: NO_REASON };
  if (entryIds.length === 0) return { ok: false, error: "Nichts ausgewählt." };
  if (!entryIds.every((id) => UUID_PATTERN.test(id))) {
    return { ok: false, error: "Ungültige Auswahl." };
  }

  const batchId = crypto.randomUUID();

  try {
    const applied = await sql.begin(async (tx) => {
      await tx.unsafe(`SET LOCAL statement_timeout = ${manage.timeoutMs}`);

      const entries = (await tx.unsafe(
        `SELECT id, action, table_name, row_id, changes
           FROM audit_log
          WHERE id = ANY($1::uuid[])
          ORDER BY occurred_at DESC, id DESC`,
        [uuidArray(entryIds)],
      )) as unknown as Record<string, unknown>[];

      /** One log entry for the operation that just undid `revertsId`. */
      const record = async (
        table: ManagedTable,
        action: string,
        rowId: string,
        changes: unknown,
        revertsId: string,
      ) => {
        await tx`
          INSERT INTO audit_log (username, display_name, action, table_name, row_id, batch_id, changes, reason, reverts_id)
          VALUES (
            ${actor.username}, ${actor.displayName}, ${action}, ${table},
            ${rowId}::uuid, ${batchId}::uuid,
            ${JSON.stringify(changes)}::text::jsonb, ${actor.reason}, ${revertsId}::uuid
          )
        `;
      };

      const conflicts: string[] = [];
      let count = 0;

      for (const entry of entries) {
        const table = String(entry.table_name) as ManagedTable;
        // hasOwn, because `in` also answers for the prototype chain: a log entry
        // naming the table "constructor" would otherwise pass this check and
        // reach the statement below as an identifier.
        if (!Object.hasOwn(EDITABLE_COLUMNS, table)) {
          throw new Error(`Unbekannte Datenmenge ${String(entry.table_name)}.`);
        }
        const entryId = String(entry.id);
        const rowId = String(entry.row_id);
        const inverse = inverseOf({
          action: String(entry.action),
          changes:
            typeof entry.changes === "string"
              ? JSON.parse(entry.changes)
              : entry.changes,
        });
        if (!inverse) {
          throw new Error("Ein Protokolleintrag lässt sich nicht deuten.");
        }

        if (inverse.kind === "update") {
          const casts = EDITABLE_COLUMNS[table];
          const columns = Object.keys(inverse.fields);
          if (!columns.every((column) => Object.hasOwn(casts, column))) {
            throw new Error("Der Eintrag nennt ein Feld, das nicht änderbar ist.");
          }

          const values: (string | null)[] = [];
          const setClause = columns
            .map((column) => {
              values.push(inverse.fields[column]!.to);
              return `${column} = $${values.length}::${casts[column]}`;
            })
            .join(", ");
          values.push(rowId);
          const idPlaceholder = `$${values.length}::uuid`;
          // Only undo what is still there to be undone.
          const guardClause = columns
            .map((column) => {
              values.push(inverse.fields[column]!.from);
              return `${column} IS NOT DISTINCT FROM $${values.length}::${casts[column]}`;
            })
            .join(" AND ");

          const result = (await tx.unsafe(
            `UPDATE ${table} SET ${setClause} WHERE id = ${idPlaceholder} AND ${guardClause}`,
            values,
          )) as unknown as { count?: number };
          if (!result?.count) {
            conflicts.push(entryId);
            continue;
          }
          count += result.count;
          await record(table, "update", rowId, { fields: inverse.fields }, entryId);
          continue;
        }

        if (inverse.kind === "insert") {
          // The snapshot carries the id, so the row comes back as itself rather
          // than as a copy - every reference to it keeps meaning the same thing.
          // $1::text::jsonb, not $1::jsonb - against a jsonb parameter the driver
          // encodes the string a second time and the snapshot arrives as a jsonb
          // *string*, which populate_record rightly refuses as a scalar.
          const result = (await tx.unsafe(
            `INSERT INTO ${table}
             SELECT * FROM jsonb_populate_record(NULL::${table}, $1::text::jsonb)
             ON CONFLICT (id) DO NOTHING`,
            [JSON.stringify(inverse.row)],
          )) as unknown as { count?: number };
          if (!result?.count) {
            conflicts.push(entryId);
            continue;
          }
          count += result.count;
          await record(table, "insert", rowId, { after: inverse.row }, entryId);
          continue;
        }

        // delete: snapshot first, so the entry keeps the whole row.
        const [existing] = (await tx.unsafe(
          `SELECT to_jsonb(t) AS snapshot FROM ${table} t WHERE t.id = $1::uuid`,
          [rowId],
        )) as unknown as { snapshot: unknown }[];
        if (!existing) {
          conflicts.push(entryId);
          continue;
        }
        const removed = (await tx.unsafe(
          `DELETE FROM ${table} WHERE id = $1::uuid`,
          [rowId],
        )) as unknown as { count?: number };
        if (!removed?.count) {
          conflicts.push(entryId);
          continue;
        }
        count += removed.count;
        await record(table, "delete", rowId, { before: existing.snapshot }, entryId);
      }

      if (conflicts.length > 0) throw new Conflict(conflicts);
      return count;
    });

    return { ok: true, data: { kind: "reverted", count: applied as number, batchId } };
  } catch (err) {
    if (err instanceof Conflict) {
      return { ok: true, data: { kind: "conflict", ids: err.ids } };
    }
    return dbFailure("revert", err);
  }
};

//====================================
// PUBLIC API
//====================================

export const managed = {
  updateRows,
  deleteRows,
  revertEntries,
  editableColumnsOf,
  /** True when this server is set up to change data at all. */
  writable: manage.writable,
};
