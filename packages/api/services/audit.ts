import { sql } from "bun";
import type { PaginationParams } from "../lib/pagination";

/**
 * Reading the change log.
 *
 * Reading only - there is no write function here, and there is no code path in
 * the application that changes an entry. Entries are appended by
 * services/manage.ts in the same transaction as the change they describe, and
 * the database role that does it holds no UPDATE or DELETE on the table.
 *
 * Reading runs on the application's own connection like every other query in
 * this application; the restricted role exists for writing, not for looking.
 */

//====================================
// TYPES
//====================================

export type AuditFilter = {
  username?: string;
  action?: string;
  table_name?: string;
  row_id?: string;
  batch_id?: string;
  from?: string;
  to?: string;
};

//====================================
// QUERIES
//====================================

/**
 * The same null-tautology shape the measurement filter uses: an absent field
 * does not constrain the result, and every value stays a parameter.
 *
 * `row_id` is the exception in meaning: it selects the *operations that touched
 * that row*, not the single entries about it. That is what the "Verlauf" button
 * on a measurement asks for, and it keeps the row count of an operation honest -
 * filtering the entries directly would show "1 Zeile" for an operation that
 * removed four hundred.
 */
const filterClause = (filter: AuditFilter) => {
  const from = filter.from ? new Date(filter.from) : null;
  const to = filter.to ? new Date(filter.to) : null;
  return sql`
    WHERE (${filter.username ?? null}::text   IS NULL OR username   = ${filter.username ?? null})
      AND (${filter.action ?? null}::text     IS NULL OR action     = ${filter.action ?? null})
      AND (${filter.table_name ?? null}::text IS NULL OR table_name = ${filter.table_name ?? null})
      AND (${filter.batch_id ?? null}::text   IS NULL OR batch_id   = ${filter.batch_id ?? null}::uuid)
      AND (${filter.row_id ?? null}::text IS NULL OR batch_id IN (
            SELECT e.batch_id FROM audit_log e WHERE e.row_id = ${filter.row_id ?? null}::uuid))
      AND (${from}::timestamptz IS NULL OR occurred_at >= ${from})
      AND (${to}::timestamptz   IS NULL OR occurred_at <= ${to})
  `;
};

/**
 * Sorting for the operation list. The expressions are aggregates because the
 * list is grouped - a whitelist written here, never anything a caller supplies.
 */
const SORT_EXPRESSIONS: Record<string, string> = {
  occurred_at: "min(occurred_at)",
  username: "min(username)",
  action: "min(action)",
  table_name: "min(table_name)",
  row_count: "count(*)",
};

/** Whether an entry has been taken back, and by which entry. */
const REVERTED_BY = "(SELECT r.id FROM audit_log r WHERE r.reverts_id = audit_log.id LIMIT 1)";

/**
 * One row per operation, not per changed row.
 *
 * Deleting four hundred measurements with one click is one thing that happened,
 * and reading it as four hundred entries makes the log unusable exactly when it
 * matters. The individual entries are on the operation's own page.
 *
 * Every column except the counts is constant within a batch by construction -
 * one call writes one batch - so `min()` is an aggregate that changes nothing.
 */
const listBatches = async (
  pagination: PaginationParams,
  filter: AuditFilter = {},
  sort: { column: string; direction: "asc" | "desc" } = {
    column: "occurred_at",
    direction: "desc",
  },
) => {
  const where = filterClause(filter);
  const expression = SORT_EXPRESSIONS[sort.column] ?? SORT_EXPRESSIONS.occurred_at!;
  const order = sql.unsafe(
    `${expression} ${sort.direction === "asc" ? "ASC" : "DESC"}, batch_id`,
  );
  const rows = await sql`
    SELECT batch_id,
           min(occurred_at)  AS occurred_at,
           min(username)     AS username,
           min(display_name) AS display_name,
           min(action)       AS action,
           min(table_name)   AS table_name,
           min(reason)       AS reason,
           count(*)::int     AS row_count,
           count(*) FILTER (WHERE ${sql.unsafe(REVERTED_BY)} IS NOT NULL)::int AS reverted_count
    FROM audit_log
    ${where}
    GROUP BY batch_id
    ORDER BY ${order}
    LIMIT ${pagination.perPage} OFFSET ${pagination.offset}
  `;
  const [{ count }] = await sql`
    SELECT count(DISTINCT batch_id)::int AS count FROM audit_log ${where}
  `;
  return {
    rows: rows as unknown as Record<string, unknown>[],
    total: count as number,
  };
};

/** Every entry of one operation, each with the entry that took it back. */
const batch = async (batchId: string) => {
  const rows = await sql`
    SELECT id, occurred_at, username, display_name, action, table_name, row_id,
           batch_id, changes, reason, reverts_id,
           ${sql.unsafe(REVERTED_BY)} AS reverted_by
    FROM audit_log
    WHERE batch_id = ${batchId}::uuid
    ORDER BY occurred_at, id
  `;
  return rows as unknown as Record<string, unknown>[];
};

/** Specific entries, for showing what an undo is about to do. */
const entriesByIds = async (ids: string[]) => {
  if (ids.length === 0) return [];
  const rows = await sql`
    SELECT id, occurred_at, username, action, table_name, row_id, batch_id,
           changes, reason,
           ${sql.unsafe(REVERTED_BY)} AS reverted_by
    FROM audit_log
    WHERE id = ANY(${`{${ids.join(",")}}`}::uuid[])
    ORDER BY occurred_at, id
  `;
  return rows as unknown as Record<string, unknown>[];
};

/**
 * The driver usually hands jsonb back decoded, but an entry written as text and
 * cast would arrive as a string. Both are read the same way here so no page has
 * to care which it got.
 */
export const decodeChanges = (value: unknown): unknown => {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const count = async () => {
  const [row] = await sql`SELECT count(*)::int AS count FROM audit_log`;
  return (row as { count: number }).count;
};

/** Distinct values for the filter dropdowns, so they only offer what exists. */
const metadata = async () => {
  const [actions, tables] = await Promise.all([
    sql`SELECT DISTINCT action AS v FROM audit_log ORDER BY v`,
    sql`SELECT DISTINCT table_name AS v FROM audit_log ORDER BY v`,
  ]);
  const values = (rows: unknown) =>
    (rows as { v: string }[]).map((row) => row.v).filter((v) => v != null);
  return { actions: values(actions), tables: values(tables) };
};

//====================================
// PUBLIC API
//====================================

export const auditLog = {
  listBatches,
  batch,
  entriesByIds,
  count,
  metadata,
  filterClause,
  decodeChanges,
};
