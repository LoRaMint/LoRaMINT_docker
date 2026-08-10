import { SQL } from "bun";
import { sqlConsole } from "../config";
import { setScope } from "./connections";
import { currentScope } from "../lib/request-context";
import type { MutationResult } from "../types";
import type { Role } from "../lib/roles";
import { hasMultipleStatements, singleStatement } from "../lib/sql-statements";

/**
 * Ad-hoc read-only SQL for the signed-in query page.
 *
 * Read-only is enforced by the database, never by inspecting the query text -
 * pattern matching would be guesswork, and the interesting attacks do not look
 * like writes. Three independent mechanisms, because the first two alone are
 * each escapable:
 *
 *  1. A dedicated login role (DATABASE_URL_READONLY) that may only SELECT, and
 *     that has `default_transaction_read_only = on` set on the role itself.
 *     This is the actual guarantee, and the only layer that survives a query
 *     which ends the transaction: `COMMIT; CREATE TABLE ...` is one statement
 *     in the simple query protocol, and after the COMMIT the rest would
 *     otherwise run read-write. It is also what stops a superuser-only escape
 *     that never writes at all - pg_read_file(), pg_authid, COPY TO PROGRAM.
 *  2. A `BEGIN READ ONLY` transaction around the query.
 *  3. A statement timeout and a row cap applied inside the database, so a
 *     careless `SELECT *` over a large table is never materialised here.
 *
 * The connection is separate from the application's own: DATABASE_URL owns the
 * schema and is a superuser in the default Docker setup, so no amount of
 * wrapping could make queries on it safe.
 */

/**
 * One pooled client per connection string, created on first use so importing
 * this module never opens a connection - the page may well be disabled, and the
 * tests import it just for the pure helpers.
 */
const clients = new Map<string, SQL>();
const clientFor = (databaseUrl: string) => {
  let client = clients.get(databaseUrl);
  if (!client) {
    client = new SQL(databaseUrl);
    clients.set(databaseUrl, client);
  }
  return client;
};

// Read on use, not captured here: both live in the settings table, and a value
// frozen at import would wait for a restart that nobody performs to change a row
// cap. `sqlConsole` exposes them as getters, so this stays a plain read.
export const maxRows = () => sqlConsole.maxRows;
export const timeoutMs = () => sqlConsole.timeoutMs;

export type QueryResult = {
  columns: string[];
  rows: Record<string, unknown>[];
  /** True when the query had more rows than the cap and the rest were dropped. */
  truncated: boolean;
  durationMs: number;
};

/**
 * Wraps a query so the row cap is applied by the database.
 *
 * Only single-statement SELECT/WITH queries can be wrapped as a subquery;
 * anything else (EXPLAIN, SHOW, several statements at once) runs unwrapped and
 * is capped after the fact. Those do not return large result sets in practice.
 *
 * Whether a statement is single is decided by the parser in lib/sql-statements,
 * not by looking for a semicolon. A naive search got this wrong in both
 * directions, and the expensive direction was measurable: `SELECT * FROM
 * measurements;;` - or a `;` inside a comment - dropped the database's LIMIT and
 * pulled the whole table into this process before capping it here. The caller
 * still saw 200 rows, so nothing about the answer said what it had cost: 80 MB
 * of heap for 300,000 rows, from two extra characters.
 */
export const limitQuery = (text: string, cap = sqlConsole.maxRows) => {
  // Null for anything that is not exactly one statement; otherwise the statement
  // without its terminator, which is what a subquery can actually hold.
  const body = singleStatement(text);
  if (body === null || !/^(select|with)\b/i.test(body)) {
    return { text: text.trim().replace(/;\s*$/, ""), wrapped: false };
  }
  // Newlines around the body, so a query ending in a `--` comment does not
  // swallow the closing parenthesis.
  return {
    text: `SELECT * FROM (\n${body}\n) AS _q LIMIT ${cap + 1}`,
    wrapped: true,
  };
};

/** Column order as returned by the driver, taken from the first row. */
const columnsOf = (rows: Record<string, unknown>[]) =>
  rows.length > 0 ? Object.keys(rows[0]!) : [];

/**
 * Runs arbitrary `text` against `databaseUrl`.
 *
 * Used by the read-only side of the console, and by the tests that check what
 * the database itself refuses - the guarantees here are claims about the
 * *database*, and the only way to test those is to send it the statements in
 * question. See the escape tests in query.integration.test.ts.
 */
export const runReadOnlyOn = (
  databaseUrl: string,
  text: string,
): Promise<MutationResult<QueryResult>> => {
  if (!text.trim()) {
    return Promise.resolve({ ok: false, error: "Keine Abfrage eingegeben." });
  }
  const limited = limitQuery(text);
  return executeOn(databaseUrl, limited.text, [], limited.wrapped);
};

/**
 * Runs one ready-to-execute statement and shapes the result, inside a read-only
 * transaction with the timeout and row cap applied.
 *
 * `text` is final - callers apply the row cap themselves, because only they know
 * whether the statement can be wrapped in a subquery.
 */
const executeOn = async (
  databaseUrl: string,
  text: string,
  values: (string | number | null)[],
  wrapped: boolean,
): Promise<MutationResult<QueryResult>> => {
  const started = Bun.nanoseconds();

  try {
    const rows = (await clientFor(databaseUrl).begin("read only", async (tx) => {
      // SET LOCAL: reverted when the transaction ends, so it cannot leak into
      // another request sharing the connection pool.
      await tx.unsafe(`SET LOCAL statement_timeout = ${sqlConsole.timeoutMs}`);
      // The same transaction tells the row-level policies who is asking. Without
      // it the console would answer every question about measurements with the
      // public rows - and with it, a query written by hand is bound by exactly
      // the same rule as a page. This is the only way to limit free-form SQL;
      // no filter in application code survives a query the user wrote.
      await setScope(tx as never, currentScope());
      return await tx.unsafe(text, values);
    })) as unknown as Record<string, unknown>[];

    const all = Array.isArray(rows) ? rows : [];
    const truncated = all.length > sqlConsole.maxRows;
    const kept = truncated ? all.slice(0, sqlConsole.maxRows) : all;

    return {
      ok: true,
      data: {
        columns: columnsOf(kept),
        rows: kept,
        // An unwrapped query was capped here rather than in the database, but
        // the user still needs to know the output is incomplete.
        truncated: truncated || (!wrapped && all.length === sqlConsole.maxRows),
        durationMs: Math.round((Bun.nanoseconds() - started) / 1e6),
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message.split("\n")[0]! };
  }
};

//====================================
// SQL CONSOLE
//====================================

/**
 * The answer to an administrator's statement: a table when it returned rows, a
 * confirmation when it only reported what it did.
 */
export type ConsoleResult =
  | ({ kind: "rows" } & QueryResult)
  | { kind: "command"; command: string; affected: number; durationMs: number }
  /**
   * A deletion that has been tried and rolled back: `affected` is the exact
   * number of rows it would remove, and the statement is waiting for the user to
   * say yes.
   */
  | { kind: "confirm"; affected: number; durationMs: number };

/**
 * Runs an arbitrary statement typed into the SQL console.
 *
 * One code path, two capability levels, decided by which connection is handed
 * in - the difference between the two roles is what the *database* permits, not
 * what this function checks:
 *
 *   read-only  DATABASE_URL_READONLY, a role that may only SELECT and carries
 *              `default_transaction_read_only = on`. Also wrapped in a READ ONLY
 *              transaction.
 *   writable   DATABASE_URL_ADMIN, a role that may also change data in the
 *              application's tables - but is no superuser and cannot touch the
 *              schema, so the console does not become shell access on the
 *              database host.
 *
 * Neither is the application's own connection, which owns the schema and is a
 * superuser in the default Docker setup.
 *
 * The statement runs inside a transaction, so a failing one leaves nothing half
 * applied, and under a statement timeout, so it cannot hold locks indefinitely.
 */
class NeedsConfirmation extends Error {
  constructor(readonly affected: number) {
    super("needs confirmation");
  }
}

export const runConsoleSqlOn = async (
  databaseUrl: string,
  text: string,
  options: { writable: boolean; confirmed?: boolean } = { writable: false },
): Promise<MutationResult<ConsoleResult>> => {
  const { writable, confirmed = false } = options;
  if (!text.trim()) return { ok: false, error: "Keine Anweisung eingegeben." };

  // Refused for both levels, for two independent reasons.
  //
  // Where something can be deleted: Postgres reports just the last command of a
  // multi-statement request, so `DELETE FROM t; SELECT 1` would arrive tagged
  // SELECT and walk past the confirmation below.
  //
  // Everywhere: several statements cannot be wrapped in a subquery, so they are
  // the one way to make the row cap above stop applying inside the database.
  // This used to be checked only for the writable console, on the reasoning that
  // a reader has nothing to delete - and that saving was the hole, because it
  // let any signed-in user pull a whole table into this process.
  if (hasMultipleStatements(text)) {
    return {
      ok: false,
      error:
        "Bitte nur eine Anweisung auf einmal – mehrere auf einmal lassen sich " +
        "vor dem Ausführen nicht verlässlich beurteilen.",
    };
  }

  // Only a plain SELECT can be wrapped for the row cap; a writing statement is
  // sent as typed, and reports how many rows it touched instead.
  const limited = limitQuery(text);
  const started = Bun.nanoseconds();

  try {
    // `command` and `count` are properties on the array the driver returns, and
    // they do not survive being handed back out of begin() - so read them inside
    // the callback and pass on a plain object.
    type Executed = { rows: Record<string, unknown>[]; command: string; count: number };
    const client = clientFor(databaseUrl);
    const run = async (tx: {
      unsafe: (q: string) => Promise<unknown>;
    }): Promise<Executed> => {
      await tx.unsafe(`SET LOCAL statement_timeout = ${sqlConsole.timeoutMs}`);
      // The same transaction tells the row-level policies who is asking. Without
      // it the console would answer every question about measurements with the
      // public rows - and with it, a query written by hand is bound by exactly
      // the same rule as a page. This is the only way to limit free-form SQL;
      // no filter in application code survives a query the user wrote.
      await setScope(tx as never, currentScope());
      const raw = (await tx.unsafe(limited.text)) as unknown as Record<
        string,
        unknown
      >[] & { command?: string; count?: number };
      const command = typeof raw?.command === "string" ? raw.command : "";
      const count = typeof raw?.count === "number" ? raw.count : 0;

      // Ask before removing anything. Throwing rolls the transaction back, so
      // the rows are still there - and the count is the real one, because the
      // deletion actually ran. An estimate from EXPLAIN would not be.
      if (command === "DELETE" && count > 0 && !confirmed) {
        throw new NeedsConfirmation(count);
      }

      return { rows: Array.isArray(raw) ? [...raw] : [], command, count };
    };

    // A read-only console gets the transaction to match; a writable one must be
    // able to commit.
    const result: Executed = writable
      ? ((await client.begin(run as never)) as unknown as Executed)
      : ((await client.begin("read only", run as never)) as unknown as Executed);

    const durationMs = Math.round((Bun.nanoseconds() - started) / 1e6);
    const { rows, command } = result;

    // A statement that returns no rows is reported as what it did, not as an
    // empty table - "UPDATE, 3 Zeilen" is the answer to `UPDATE`.
    if (rows.length === 0 && command && command !== "SELECT") {
      return {
        ok: true,
        data: {
          kind: "command",
          command,
          affected: result.count,
          durationMs,
        },
      };
    }

    const truncated = rows.length > sqlConsole.maxRows;
    const kept = truncated ? rows.slice(0, sqlConsole.maxRows) : rows;
    return {
      ok: true,
      data: {
        kind: "rows",
        columns: columnsOf(kept),
        rows: kept,
        truncated: truncated || (!limited.wrapped && rows.length === sqlConsole.maxRows),
        durationMs,
      },
    };
  } catch (err) {
    if (err instanceof NeedsConfirmation) {
      return {
        ok: true,
        data: {
          kind: "confirm",
          affected: err.affected,
          durationMs: Math.round((Bun.nanoseconds() - started) / 1e6),
        },
      };
    }
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message.split("\n")[0]! };
  }
};

/** Runs a console statement against the connection configured for that level. */
export const runConsoleSql = (
  text: string,
  writable: boolean,
  confirmed = false,
): Promise<MutationResult<ConsoleResult>> => {
  const databaseUrl = writable
    ? sqlConsole.adminDatabaseUrl
    : sqlConsole.databaseUrl;
  if (!databaseUrl) {
    return Promise.resolve({
      ok: false,
      error: "Die SQL-Konsole ist auf diesem Server nicht aktiviert.",
    });
  }
  return runConsoleSqlOn(databaseUrl, text, { writable, confirmed });
};
