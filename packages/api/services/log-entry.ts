import type { SQL } from "bun";
import { ingesting, reading, readingAs } from "./connections";
import { currentScope } from "../lib/request-context";
import type { PaginationParams } from "../lib/pagination";
import type { LogEntry, LogStatus, MutationResult, TtnDecodedPayload, ValidatedLogEntry } from "../types";

//====================================
// CONSTANTS
//====================================

const HEX_PATTERN = /^[0-9A-Fa-f]{16}$/;

//====================================
// VALIDATION
//====================================

const validate = (payload: TtnDecodedPayload, deviceEui: string): MutationResult<ValidatedLogEntry> => {
  if (!HEX_PATTERN.test(deviceEui)) return { ok: false, error: "device_eui must be exactly 16 hex characters" };

  if (typeof payload.message !== "string" || payload.message.trim().length === 0)
    return { ok: false, error: "message must be a non-empty string" };

  if (payload.message.length > 200) return { ok: false, error: "message must be at most 200 characters" };

  return {
    ok: true,
    data: { deviceEui, message: payload.message },
  };
};

//====================================
// STORAGE
//====================================

const store = async (data: ValidatedLogEntry): Promise<MutationResult<LogEntry>> => {
  // Id and arrival time are made here rather than read back: `RETURNING` needs
  // SELECT on the columns it returns, and granting that would let the webhook's
  // role read every message ever stored. See services/measurement.ts for the
  // measurement that established this.
  const id = crypto.randomUUID();
  const createdAt = new Date();

  await ingesting()`
    INSERT INTO log_entries (id, device_eui, message, created_at)
    VALUES (${id}::uuid, ${data.deviceEui}, ${data.message}, ${createdAt})
  `;

  return {
    ok: true,
    data: { id, deviceEui: data.deviceEui, message: data.message, createdAt },
  };
};

//====================================
// QUERIES
//====================================

const mapRow = (row: Record<string, unknown>): LogEntry => ({
  id: row.id as string,
  deviceEui: row.device_eui as string,
  message: row.message as string,
  createdAt: row.created_at as Date,
});

const list = async (pagination: PaginationParams) => {
  const rows = await q((tx) => tx`
    SELECT id, device_eui, message, created_at
    FROM log_entries
    ORDER BY created_at DESC
    LIMIT ${pagination.perPage} OFFSET ${pagination.offset}
  `);
  const [{ count }] = await q((tx) => tx`SELECT count(*)::int AS count FROM log_entries`);
  return { items: rows.map(mapRow), total: count as number };
};

/**
 * Status board data: the latest log entry per device_eui, plus how many log
 * entries that device has sent, ordered by most recent activity first.
 */
const status = async (): Promise<LogStatus[]> => {
  const rows = await q((tx) => tx`
    SELECT device_eui, message, last_seen, n
    FROM (
      SELECT device_eui, message, created_at AS last_seen,
             count(*) OVER (PARTITION BY device_eui) AS n,
             row_number() OVER (
               PARTITION BY device_eui
               ORDER BY created_at DESC
             ) AS rn
      FROM log_entries
    ) t
    WHERE rn = 1
    ORDER BY last_seen DESC
  `);
  return (rows as Record<string, unknown>[]).map((r) => ({
    deviceEui: r.device_eui as string,
    message: r.message as string,
    lastSeen: r.last_seen as Date,
    count: Number(r.n),
  }));
};

//====================================
// MANAGEMENT
//====================================

/** Optional filters for the management table; an absent field does not narrow. */
export type LogEntryFilter = {
  device_eui?: string;
  /** Free text, matched anywhere in the message. */
  q?: string;
  from?: string;
  to?: string;
};

/**
 * Builds a `WHERE` fragment matching the filter, in the same null-tautology form
 * as `measurements.filterClause`: every value stays a parameter, only the shape
 * of the fragment is assembled here.
 *
 * The text search wraps the term in `%…%`. That means a `%` or `_` typed into
 * the box acts as a wildcard rather than as itself - harmless, occasionally
 * surprising, and not worth an escaping scheme for a search box over 200-character
 * device messages.
 */

/**
 * Every read of this table, scoped to what the caller may see.
 *
 * The row-level policies in migration 007 read two session settings, and
 * `set_config(..., true)` only lasts for a transaction - so a bare query has no
 * scope and sees the public rows alone. That is the safety net rather than a
 * nuisance: a path somebody forgets to wrap shows public data, never somebody
 * else's. The public pages and the open API are deliberately left unwrapped for
 * exactly that reason.
 */
const q = <T>(run: (tx: SQL) => Promise<T>): Promise<T> =>
  readingAs(currentScope(), run);

const filterClause = (filter: LogEntryFilter) => {
  const from = filter.from ? new Date(filter.from) : null;
  const to = filter.to ? new Date(filter.to) : null;
  const pattern = filter.q ? `%${filter.q}%` : null;
  return reading()`
    WHERE (${filter.device_eui ?? null}::text IS NULL OR device_eui = ${filter.device_eui ?? null})
      AND (${pattern}::text IS NULL OR message ILIKE ${pattern})
      AND (${from}::timestamptz IS NULL OR created_at >= ${from})
      AND (${to}::timestamptz   IS NULL OR created_at <= ${to})
  `;
};

/**
 * What the management table may sort by. A whitelist of expressions written
 * here, because an identifier cannot be parameterised - a caller only ever
 * matches a key, never contributes text to the statement.
 */
const SORT_EXPRESSIONS: Record<string, string> = {
  created_at: "created_at",
  device_eui: "device_eui",
};

/**
 * Rows for the management table, with the database's own column names - the
 * table builds its form fields from these, and they have to be the names the
 * update statement uses.
 */
const listRows = async (
  pagination: PaginationParams,
  filter: LogEntryFilter = {},
  sort: { column: string; direction: "asc" | "desc" } = {
    column: "created_at",
    direction: "desc",
  },
) => {
  const where = filterClause(filter);
  const expression = SORT_EXPRESSIONS[sort.column] ?? SORT_EXPRESSIONS.created_at!;
  // Appending id keeps the order total: entries sharing a timestamp would
  // otherwise be free to swap places between two pages and hide one of themselves.
  const order = reading().unsafe(
    `${expression} ${sort.direction === "asc" ? "ASC" : "DESC"}, id`,
  );
  const rows = await q((tx) => tx`
    SELECT id, device_eui, message, created_at
    FROM log_entries
    ${where}
    ORDER BY ${order}
    LIMIT ${pagination.perPage} OFFSET ${pagination.offset}
  `);
  const [{ count }] = await q((tx) => tx`SELECT count(*)::int AS count FROM log_entries ${where}`);
  return {
    rows: rows as unknown as Record<string, unknown>[],
    total: count as number,
  };
};

/**
 * The ids matching a filter, bounded by the moment a deletion was previewed, so
 * an entry that arrived since cannot be caught by a deletion that never showed it.
 */
const idsMatching = async (
  filter: LogEntryFilter,
  limit: number,
  createdBefore: Date | null = null,
) => {
  const rows = await q((tx) => tx`
    SELECT id FROM log_entries
    ${filterClause(filter)}
      AND (${createdBefore}::timestamptz IS NULL
           OR created_at < ${createdBefore}::timestamptz + interval '1 millisecond')
    ORDER BY created_at
    LIMIT ${limit}
  `);
  return (rows as unknown as { id: string }[]).map((row) => row.id);
};

/** The current state of specific rows, for previewing and for validation. */
const byIds = async (ids: string[]) => {
  if (ids.length === 0) return [];
  const rows = await q((tx) => tx`
    SELECT id, device_eui, message, created_at
    FROM log_entries WHERE id = ANY(${`{${ids.join(",")}}`}::uuid[])
    ORDER BY created_at DESC, id
  `);
  return rows as unknown as Record<string, unknown>[];
};

/** Distinct devices that have sent something, for the filter dropdown. */
const metadata = async () => {
  const rows = await q((tx) => tx`SELECT DISTINCT device_eui AS v FROM log_entries ORDER BY v`);
  return {
    devices: (rows as unknown as { v: string }[])
      .map((row) => row.v)
      .filter((value) => value != null),
  };
};

/**
 * Whether a corrected message may be stored - the same rule an incoming message
 * has to satisfy, so a correction cannot produce a row the webhook could never
 * have written. Returns a German sentence naming the problem, or null.
 */
const validateField = (column: string, value: string | null): string | null => {
  if (column !== "message") return null;
  if (value === null) return "Die Meldung darf nicht leer sein.";
  if (value.length > 200) return "Die Meldung darf höchstens 200 Zeichen haben.";
  return null;
};

//====================================
// PUBLIC API
//====================================

/** Validate + store a log entry in one call. */
const ingest = async (payload: TtnDecodedPayload, deviceEui: string): Promise<MutationResult<LogEntry>> => {
  const validated = validate(payload, deviceEui);
  if (!validated.ok) return validated;
  return store(validated.data);
};

/**
 * How many entries match, for the management overview and the result line.
 *
 * `createdBefore` bounds the count like `idsMatching` bounds the ids: a deletion
 * running in blocks asks after every block how much is left, and that has to be
 * the set that was previewed rather than one that has grown since.
 */
const count = async (
  filter: LogEntryFilter = {},
  createdBefore: Date | null = null,
) => {
  const [row] = await q((tx) => tx`
    SELECT count(*)::int AS count FROM log_entries
    ${filterClause(filter)}
      AND (${createdBefore}::timestamptz IS NULL
           OR created_at < ${createdBefore}::timestamptz + interval '1 millisecond')
  `);
  return (row as { count: number }).count;
};

export const logEntries = {
  validate,
  store,
  ingest,
  list,
  status,
  count,
  filterClause,
  listRows,
  idsMatching,
  byIds,
  metadata,
  validateField,
};
