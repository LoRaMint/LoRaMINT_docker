import { describe, expect, test } from "bun:test";
import { connect } from "node:net";
import { maxRows, runConsoleSqlOn, runReadOnlyOn, timeoutMs } from "./query";

/**
 * Integration tests for the read-only query service against a real Postgres -
 * the read-only guarantee lives in the database, so it can only be verified
 * there. Start one with:
 *
 *     docker compose -f compose.dev.yml up -d postgres
 *
 * No schema is required: every query here uses expressions and system catalogs,
 * so the tests do not depend on migrations having run, and being read-only they
 * cannot touch existing data.
 *
 * Skipped when nothing is listening, so `bun test` works without Docker; CI
 * starts Postgres and sets DB_TESTS_REQUIRED=1 to turn a skip into a failure.
 */

// The page runs on the restricted role, so that is what has to be tested: the
// same queries against the application's own superuser connection do escape.
const DSN =
  Bun.env.DATABASE_URL_READONLY ??
  "postgres://loramint_readonly:readonly@localhost:5432/loramint";

/** The writable connection: the same console, opened by an administrator. */
const ADMIN_DSN =
  Bun.env.DATABASE_URL_ADMIN ??
  "postgres://loramint_admin_sql:adminsql@localhost:5432/loramint";

/** Runs a query the way the read-only console does. */
const runReadOnly = (text: string) => runReadOnlyOn(DSN, text);

const reachable = await new Promise<boolean>((resolve) => {
  let hostname = "localhost";
  let port = 5432;
  try {
    const url = new URL(DSN);
    hostname = url.hostname || hostname;
    port = Number(url.port) || port;
  } catch {
    // Fall back to the defaults above.
  }
  const socket = connect({ host: hostname, port });
  const done = (result: boolean) => {
    socket.destroy();
    resolve(result);
  };
  socket.setTimeout(1000);
  socket.once("connect", () => done(true));
  socket.once("timeout", () => done(false));
  socket.once("error", () => done(false));
});

if (!reachable) {
  const hint = "  Start it with: docker compose -f compose.dev.yml up -d postgres";
  if (Bun.env.DB_TESTS_REQUIRED === "1") {
    throw new Error(
      `DB_TESTS_REQUIRED is set but no database is listening for ${DSN}.\n${hint}`,
    );
  }
  console.warn(`Query integration tests skipped: no database at ${DSN}.\n${hint}`);
}

describe.skipIf(!reachable)("read-only query execution", () => {
  test("runs a SELECT and reports columns, rows and a duration", async () => {
    const result = await runReadOnly("SELECT 1 AS a, 'x' AS b");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.columns).toEqual(["a", "b"]);
    expect(result.data.rows).toEqual([{ a: 1, b: "x" }]);
    expect(result.data.truncated).toBe(false);
    expect(result.data.durationMs).toBeGreaterThanOrEqual(0);
  });

  test("refuses an empty query without going to the database", async () => {
    expect(await runReadOnly("   ")).toEqual({
      ok: false,
      error: "Keine Abfrage eingegeben.",
    });
  });

  test("reports a syntax error instead of throwing", async () => {
    const result = await runReadOnly("SELCT 1");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("syntax error");
  });

  test("caps the result at maxRows() and says so", async () => {
    const result = await runReadOnly(`SELECT generate_series(1, ${maxRows() * 10}) AS n`);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.rows).toHaveLength(maxRows());
    expect(result.data.truncated).toBe(true);
  });

  test("does not claim truncation when the query fits exactly", async () => {
    const result = await runReadOnly(`SELECT generate_series(1, ${maxRows()}) AS n`);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.rows).toHaveLength(maxRows());
    expect(result.data.truncated).toBe(false);
  });

  test("connects as the restricted role, not as the application's own user", async () => {
    const result = await runReadOnly(
      "SELECT current_user AS u, rolsuper AS super FROM pg_roles WHERE rolname = current_user",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // A superuser connection cannot be made read-only, whatever we wrap around
    // the query - see the escape tests below.
    expect(result.data.rows[0]!.super).toBe(false);
  });

  test("runs inside a read-only transaction with a statement timeout", async () => {
    // Asserting the session settings rather than waiting for a slow query to be
    // killed: it proves the same thing in milliseconds.
    const result = await runReadOnly(
      "SELECT current_setting('transaction_read_only') AS ro," +
        " current_setting('statement_timeout') AS timeout",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.rows[0]).toEqual({
      ro: "on",
      timeout: `${timeoutMs() / 1000}s`,
    });
  });
});

describe.skipIf(!reachable)("writes are rejected by the database", () => {
  // Each of these is a case a keyword filter on the query text would plausibly
  // miss, or get wrong. None of them needs an existing table.
  const cases: [string, string][] = [
    ["DDL", "CREATE TABLE should_not_exist (id int)"],
    ["INSERT into a new table", "CREATE TABLE t AS SELECT 1"],
    ["SELECT INTO", "SELECT 1 AS x INTO should_not_exist_either"],
    [
      "data-modifying CTE",
      "WITH d AS (CREATE TEMP TABLE nope AS SELECT 1) SELECT 1",
    ],
    ["a second statement after a semicolon", "SELECT 1; CREATE TABLE sneaky (id int)"],
    ["lower case and odd spacing", "  create\n  table  bypass (id int)  "],
    ["a leading comment", "/* SELECT */ CREATE TABLE commented (id int)"],
  ];

  for (const [name, query] of cases) {
    test(name, async () => {
      const result = await runReadOnly(query);
      expect(result.ok).toBe(false);
    });
  }

  test("and nothing was actually created", async () => {
    const result = await runReadOnly(
      "SELECT count(*)::int AS n FROM pg_tables WHERE tablename IN " +
        "('should_not_exist','should_not_exist_either','t','sneaky','bypass','commented','nope')",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.rows[0]).toEqual({ n: 0 });
  });
});

/**
 * These all succeeded before the page moved to a restricted role: bun sends the
 * query over the simple protocol, so a leading COMMIT ends the transaction we
 * opened and everything after it ran read-write - and as a superuser, the
 * read-only transaction never stopped file access in the first place, because
 * reading a file is not a write.
 */
describe.skipIf(!reachable)("transaction and privilege escapes", () => {
  const escapes: [string, string][] = [
    ["ending the transaction with COMMIT", "COMMIT; CREATE TABLE escaped_commit (i int)"],
    ["ending it with ROLLBACK", "ROLLBACK; CREATE TABLE escaped_rollback (i int)"],
    ["ending it with END", "END; CREATE TABLE escaped_end (i int)"],
    ["forcing the transaction read-write", "SET TRANSACTION READ WRITE; CREATE TABLE escaped_rw (i int)"],
    [
      "turning off the read-only default",
      "SET default_transaction_read_only = off; COMMIT; CREATE TABLE escaped_default (i int)",
    ],
  ];

  for (const [name, query] of escapes) {
    test(name, async () => {
      await runReadOnly(query);
      // The statement before the write may well succeed, so the result of the
      // call says little - what matters is that no table exists afterwards.
      const check = await runReadOnly(
        "SELECT count(*)::int AS n FROM pg_tables WHERE tablename LIKE 'escaped%'",
      );
      expect(check.ok).toBe(true);
      if (!check.ok) return;
      expect(check.data.rows[0]).toEqual({ n: 0 });
    });
  }

  test("cannot read files from the database server", async () => {
    const result = await runReadOnly("SELECT pg_read_file('/etc/hostname') AS f");
    expect(result.ok).toBe(false);
  });

  test("cannot list directories on the database server", async () => {
    const result = await runReadOnly("SELECT pg_ls_dir('/') AS d");
    expect(result.ok).toBe(false);
  });

  test("cannot run shell commands via COPY TO PROGRAM", async () => {
    const result = await runReadOnly("COPY (SELECT 1) TO PROGRAM 'true'");
    expect(result.ok).toBe(false);
  });

  test("cannot read password hashes", async () => {
    const result = await runReadOnly("SELECT rolname, rolpassword FROM pg_authid");
    expect(result.ok).toBe(false);
  });
});

describe.skipIf(!reachable)("SQL console, writable", () => {
  const run = (text: string) => runConsoleSqlOn(ADMIN_DSN, text, { writable: true });

  test("returns a table for a query", async () => {
    const result = await run("SELECT 1 AS a");
    expect(result.ok).toBe(true);
    if (!result.ok || result.data.kind !== "rows") throw new Error("expected rows");
    expect(result.data.rows).toEqual([{ a: 1 }]);
  });

  test("returns a confirmation for a statement that changes data", async () => {
    // Touches no row, so it is safe to run against the live table while still
    // exercising the write path.
    const result = await run("UPDATE measurements SET value = value WHERE false");
    expect(result.ok).toBe(true);
    if (!result.ok || result.data.kind !== "command") {
      throw new Error("expected a command confirmation");
    }
    expect(result.data.command).toBe("UPDATE");
    expect(result.data.affected).toBe(0);
  });

  test("actually writes, and reports how many rows it touched", async () => {
    const marker = `admin-sql-test-${Date.now()}`;
    const inserted = await run(
      `INSERT INTO log_entries (device_eui, message) VALUES ('0000000000000000', '${marker}')`,
    );
    expect(inserted.ok).toBe(true);
    if (!inserted.ok || inserted.data.kind !== "command") {
      throw new Error("expected a command confirmation");
    }
    expect(inserted.data.command).toBe("INSERT");
    expect(inserted.data.affected).toBe(1);

    // Confirmed straight away: the confirmation step has its own tests below.
    const deleted = await runConsoleSqlOn(
      ADMIN_DSN,
      `DELETE FROM log_entries WHERE message = '${marker}'`,
      { writable: true, confirmed: true },
    );
    expect(deleted.ok).toBe(true);
    if (!deleted.ok || deleted.data.kind !== "command") {
      throw new Error("expected a command confirmation");
    }
    expect(deleted.data.affected).toBe(1);
  });

  test("refuses an empty statement", async () => {
    expect(await run("  ")).toEqual({
      ok: false,
      error: "Keine Anweisung eingegeben.",
    });
  });

  test("reports a syntax error instead of throwing", async () => {
    const result = await run("SELCT 1");
    expect(result.ok).toBe(false);
  });

  test("caps a query that returns too many rows", async () => {
    const result = await run(`SELECT generate_series(1, ${maxRows() * 10}) AS n`);
    expect(result.ok).toBe(true);
    if (!result.ok || result.data.kind !== "rows") throw new Error("expected rows");
    expect(result.data.rows).toHaveLength(maxRows());
    expect(result.data.truncated).toBe(true);
  });

  test("connects as a role without superuser rights", async () => {
    const result = await run(
      "SELECT rolsuper AS super FROM pg_roles WHERE rolname = current_user",
    );
    expect(result.ok).toBe(true);
    if (!result.ok || result.data.kind !== "rows") throw new Error("expected rows");
    expect(result.data.rows[0]!.super).toBe(false);
  });

  test("cannot change the schema", async () => {
    // Writing data is the point; restructuring it is not - that stays with the
    // migrations, where it is reviewable.
    for (const ddl of [
      "CREATE TABLE admin_pwned (i int)",
      "DROP TABLE measurements",
      "ALTER TABLE measurements ADD COLUMN x int",
    ]) {
      expect((await run(ddl)).ok).toBe(false);
    }
    const check = await run(
      "SELECT count(*)::int AS n FROM pg_tables WHERE tablename = 'admin_pwned'",
    );
    if (!check.ok || check.data.kind !== "rows") throw new Error("expected rows");
    expect(check.data.rows[0]).toEqual({ n: 0 });
  });

  test("cannot read server files, password hashes or run programs", async () => {
    for (const escape of [
      "SELECT pg_read_file('/etc/hostname')",
      "SELECT pg_ls_dir('/')",
      "SELECT rolname, rolpassword FROM pg_authid",
      "COPY (SELECT 1) TO PROGRAM 'true'",
      "CREATE ROLE hacker SUPERUSER LOGIN",
    ]) {
      expect((await run(escape)).ok).toBe(false);
    }
  });

  test("a failing statement leaves nothing half applied", async () => {
    const marker = `admin-tx-test-${Date.now()}`;
    // Second statement fails, so the transaction rolls back and the insert from
    // the first must be gone too.
    await run(
      `INSERT INTO log_entries (device_eui, message) VALUES ('0000000000000000', '${marker}'); SELCT 1`,
    );
    const check = await run(
      `SELECT count(*)::int AS n FROM log_entries WHERE message = '${marker}'`,
    );
    if (!check.ok || check.data.kind !== "rows") throw new Error("expected rows");
    expect(check.data.rows[0]).toEqual({ n: 0 });
  });
});

/**
 * Deleting is the one thing that asks first. The count it reports is exact
 * because the deletion really runs and is then rolled back - an EXPLAIN estimate
 * would be a guess, and a guess is not what you want to read before saying yes.
 */
describe.skipIf(!reachable)("SQL console: confirmation before deleting", () => {
  const run = (text: string, confirmed = false) =>
    runConsoleSqlOn(ADMIN_DSN, text, { writable: true, confirmed });

  /** Two throwaway log rows to delete, and the marker that finds them. */
  const seed = async () => {
    const marker = `confirm-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await run(
      `INSERT INTO log_entries (device_eui, message) VALUES ` +
        `('0000000000000000', '${marker}'), ('0000000000000000', '${marker}')`,
    );
    return marker;
  };

  const countLeft = async (marker: string) => {
    const result = await run(
      `SELECT count(*)::int AS n FROM log_entries WHERE message = '${marker}'`,
    );
    if (!result.ok || result.data.kind !== "rows") throw new Error("expected rows");
    return result.data.rows[0]!.n as number;
  };

  test("asks before deleting, and deletes nothing yet", async () => {
    const marker = await seed();
    const result = await run(`DELETE FROM log_entries WHERE message = '${marker}'`);

    expect(result.ok).toBe(true);
    if (!result.ok || result.data.kind !== "confirm") {
      throw new Error("expected a confirmation");
    }
    expect(result.data.affected).toBe(2);
    // The decisive assertion: the rows are still there.
    expect(await countLeft(marker)).toBe(2);

    await run(`DELETE FROM log_entries WHERE message = '${marker}'`, true);
  });

  test("deletes once confirmed", async () => {
    const marker = await seed();
    const result = await run(`DELETE FROM log_entries WHERE message = '${marker}'`, true);

    expect(result.ok).toBe(true);
    if (!result.ok || result.data.kind !== "command") {
      throw new Error("expected a command confirmation");
    }
    expect(result.data.command).toBe("DELETE");
    expect(result.data.affected).toBe(2);
    expect(await countLeft(marker)).toBe(0);
  });

  test("a DELETE that matches nothing needs no confirmation", async () => {
    const result = await run(
      "DELETE FROM log_entries WHERE message = 'nothing-matches-this'",
    );
    expect(result.ok).toBe(true);
    if (!result.ok || result.data.kind !== "command") {
      throw new Error("expected a command confirmation");
    }
    expect(result.data.affected).toBe(0);
  });

  test("UPDATE and INSERT are not held up", async () => {
    // Only deletions ask; the warning on the page says so.
    const updated = await run("UPDATE measurements SET value = value WHERE false");
    expect(updated.ok).toBe(true);
    if (!updated.ok) return;
    expect(updated.data.kind).toBe("command");
  });

  test("a deletion cannot slip past the confirmation behind a second statement", async () => {
    // Postgres would report this as SELECT, so the console refuses the shape
    // rather than trusting the command tag.
    const marker = await seed();
    const result = await run(
      `DELETE FROM log_entries WHERE message = '${marker}'; SELECT 1`,
    );
    expect(result.ok).toBe(false);
    expect(await countLeft(marker)).toBe(2);

    await run(`DELETE FROM log_entries WHERE message = '${marker}'`, true);
  });

  test("a semicolon inside a string is not a second statement", async () => {
    // The false positive a naive check would produce, on a statement that is
    // perfectly ordinary.
    const result = await run("DELETE FROM log_entries WHERE message = 'a;b'");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.kind).toBe("command");
  });
});

/**
 * The read-only side of the same console. It differs from the writable one only
 * in which database role it connects as - so the check that matters is that the
 * database refuses the writes, not that the page declines to send them.
 */
describe.skipIf(!reachable)("SQL console, read-only", () => {
  const run = (text: string) => runConsoleSqlOn(DSN, text, { writable: false });

  test("runs a query and returns rows", async () => {
    const result = await run("SELECT 1 AS a");
    expect(result.ok).toBe(true);
    if (!result.ok || result.data.kind !== "rows") throw new Error("expected rows");
    expect(result.data.rows).toEqual([{ a: 1 }]);
  });

  test("refuses every kind of write, at the database", async () => {
    for (const statement of [
      "INSERT INTO log_entries (device_eui, message) VALUES ('0000000000000000','x')",
      "UPDATE measurements SET value = value",
      "DELETE FROM log_entries WHERE true",
      "CREATE TABLE readonly_pwned (i int)",
    ]) {
      expect((await run(statement)).ok).toBe(false);
    }
  });

  test("never reaches the confirmation step, because it cannot delete anyway", async () => {
    const result = await run("DELETE FROM log_entries WHERE true");
    expect(result.ok).toBe(false);
  });

  test("caps the result like the writable console", async () => {
    const result = await run(`SELECT generate_series(1, ${maxRows() * 10}) AS n`);
    expect(result.ok).toBe(true);
    if (!result.ok || result.data.kind !== "rows") throw new Error("expected rows");
    expect(result.data.rows).toHaveLength(maxRows());
  });

  test("connects as the read-only role", async () => {
    const result = await run("SELECT current_user AS u");
    expect(result.ok).toBe(true);
    if (!result.ok || result.data.kind !== "rows") throw new Error("expected rows");
    expect(result.data.rows[0]!.u).toBe("loramint_readonly");
  });
});
