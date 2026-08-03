import { describe, expect, test } from "bun:test";
import { limitQuery, MAX_ROWS } from "./query";
import { countStatements } from "../lib/sql-statements";

/** What the wrapper produces for a body it accepted. */
const capped = (body: string, maxRows = MAX_ROWS) =>
  `SELECT * FROM (\n${body}\n) AS _q LIMIT ${maxRows + 1}`;

describe("limitQuery", () => {
  test("wraps a plain SELECT and fetches one row past the cap", () => {
    // One extra row is what makes "there is more" distinguishable from
    // "there are exactly MAX_ROWS".
    expect(limitQuery("SELECT 1")).toEqual({
      text: capped("SELECT 1"),
      wrapped: true,
    });
  });

  test("wraps a CTE, which is still a single read", () => {
    expect(limitQuery("WITH x AS (SELECT 1) SELECT * FROM x").wrapped).toBe(true);
  });

  test("strips a trailing semicolon so the subquery stays valid", () => {
    expect(limitQuery("SELECT 1;").text).toBe(capped("SELECT 1"));
  });

  test("leaves a query with several statements unwrapped", () => {
    // Wrapping this would be a syntax error; it is capped after the fact
    // instead. Read-only is enforced by the database either way.
    const result = limitQuery("SELECT 1; SELECT 2");
    expect(result).toEqual({ text: "SELECT 1; SELECT 2", wrapped: false });
  });

  test("leaves statements that cannot be subqueries unwrapped", () => {
    for (const q of ["EXPLAIN SELECT 1", "SHOW statement_timeout", "TABLE pg_tables"]) {
      expect(limitQuery(q).wrapped).toBe(false);
    }
  });

  test("respects a custom cap", () => {
    expect(limitQuery("SELECT 1", 5).text).toBe(capped("SELECT 1", 5));
  });

  test("keeps the user's own LIMIT, which the wrapper cannot widen", () => {
    const { text } = limitQuery("SELECT 1 LIMIT 3");
    expect(text).toBe(capped("SELECT 1 LIMIT 3"));
  });
});

/**
 * The cap has to survive a semicolon that separates nothing. It did not: any
 * signed-in user could drop the database's LIMIT with two extra characters and
 * make the server pull a whole table into memory to show the same 200 rows.
 */
describe("limitQuery cannot be talked out of the cap", () => {
  const wrapped = (query: string) => limitQuery(query).wrapped;

  test("a doubled trailing semicolon still caps", () => {
    expect(wrapped("SELECT * FROM measurements;;")).toBe(true);
    expect(wrapped("SELECT * FROM measurements; ;  ")).toBe(true);
  });

  test("a semicolon inside a comment still caps", () => {
    expect(wrapped("SELECT * FROM measurements /*;*/")).toBe(true);
    expect(wrapped("SELECT * FROM measurements -- ;\n")).toBe(true);
  });

  test("a semicolon inside a string literal still caps", () => {
    expect(wrapped("SELECT * FROM log_entries WHERE message = 'a;b'")).toBe(true);
  });

  test("a semicolon inside a quoted identifier still caps", () => {
    expect(wrapped('SELECT "od;d" FROM measurements')).toBe(true);
  });

  test("genuinely several statements are still left alone", () => {
    // Not cappable as a subquery - and refused outright by runConsoleSqlOn.
    expect(wrapped("SELECT 1; SELECT * FROM measurements")).toBe(false);
  });
});

/**
 * Capping is only worth anything if what it produces still runs. The terminator
 * has to be cut off properly rather than trimmed with a regular expression, and
 * the closing parenthesis has to survive a trailing comment.
 */
describe("limitQuery produces valid SQL", () => {
  test("a doubled terminator leaves no semicolon inside the subquery", () => {
    expect(limitQuery("SELECT 1;;").text).toBe(capped("SELECT 1"));
    expect(limitQuery("SELECT 1 ; ; ").text).toBe(capped("SELECT 1"));
  });

  test("anything after the terminator is dropped, not carried inside", () => {
    expect(limitQuery("SELECT 1; -- Rest").text).toBe(capped("SELECT 1"));
    expect(limitQuery("SELECT 1; /* Rest */").text).toBe(capped("SELECT 1"));
  });

  test("a trailing line comment does not swallow the closing parenthesis", () => {
    const { text } = limitQuery("SELECT 1 -- Rest");
    expect(text).toBe(capped("SELECT 1 -- Rest"));
    // The newline is the whole reason this is valid.
    expect(text.endsWith("\n) AS _q LIMIT 201")).toBe(true);
  });

  test("no wrapped query ever carries a bare semicolon", () => {
    for (const q of [
      "SELECT 1;;",
      "SELECT 1; -- x",
      "SELECT * FROM measurements ;  ;",
      "SELECT 'a;b'",
      "SELECT * FROM measurements /*;*/",
    ]) {
      const { text, wrapped: isWrapped } = limitQuery(q);
      if (!isWrapped) continue;
      const inner = text.slice(text.indexOf("(\n") + 2, text.lastIndexOf("\n)"));
      // A semicolon may survive inside a literal or a comment - never outside.
      expect(countStatements(inner)).toBe(1);
    }
  });
});
