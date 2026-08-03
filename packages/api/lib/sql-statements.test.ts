import { describe, expect, test } from "bun:test";
import {
  countStatements,
  hasMultipleStatements,
  singleStatement,
} from "./sql-statements";

describe("counting statements", () => {
  test("counts plain statements", () => {
    expect(countStatements("SELECT 1")).toBe(1);
    expect(countStatements("SELECT 1; SELECT 2")).toBe(2);
    expect(countStatements("SELECT 1; SELECT 2; SELECT 3")).toBe(3);
  });

  test("a trailing semicolon does not add one", () => {
    expect(countStatements("SELECT 1;")).toBe(1);
    expect(countStatements("SELECT 1;   \n  ")).toBe(1);
  });

  test("empty statements are not counted", () => {
    expect(countStatements(";;;")).toBe(0);
    expect(countStatements("; SELECT 1")).toBe(1);
    expect(countStatements("SELECT 1;; SELECT 2")).toBe(2);
  });

  test("nothing at all is no statement", () => {
    expect(countStatements("")).toBe(0);
    expect(countStatements("   \n\t ")).toBe(0);
  });
});

describe("semicolons that do not separate anything", () => {
  test("inside a string literal", () => {
    // The case a naive check gets wrong, and it is a plausible one.
    expect(countStatements("DELETE FROM t WHERE message = 'a;b'")).toBe(1);
  });

  test("inside a string with a doubled quote", () => {
    expect(countStatements("SELECT 'it''s; fine'")).toBe(1);
  });

  test("inside a quoted identifier", () => {
    expect(countStatements('SELECT 1 AS "odd;name"')).toBe(1);
  });

  test("inside a line comment", () => {
    expect(countStatements("SELECT 1 -- ; not a statement")).toBe(1);
    expect(countStatements("SELECT 1 -- comment\n; SELECT 2")).toBe(2);
  });

  test("inside a block comment, including nested ones", () => {
    expect(countStatements("SELECT 1 /* ; */")).toBe(1);
    expect(countStatements("SELECT 1 /* a /* ; */ b */")).toBe(1);
  });

  test("inside a dollar-quoted body", () => {
    expect(countStatements("SELECT $$a;b$$")).toBe(1);
    expect(countStatements("SELECT $tag$a;b$tag$")).toBe(1);
  });

  test("a lone dollar sign is not a quote", () => {
    expect(countStatements("SELECT $1; SELECT $2")).toBe(2);
  });
});

describe("hasMultipleStatements", () => {
  test("is what the admin console asks", () => {
    expect(hasMultipleStatements("DELETE FROM measurements")).toBe(false);
    expect(hasMultipleStatements("DELETE FROM measurements;")).toBe(false);
    // The case this exists for: Postgres would report the last command only,
    // so the deletion would never reach the confirmation step.
    expect(hasMultipleStatements("DELETE FROM measurements; SELECT 1")).toBe(true);
  });

  test("an unterminated string does not swallow the rest silently", () => {
    // Malformed input is Postgres's problem to report, but it must not be
    // mistaken for several statements.
    expect(hasMultipleStatements("SELECT 'unterminated; SELECT 1")).toBe(false);
  });
});

describe("singleStatement", () => {
  test("hands back the statement without its terminator", () => {
    expect(singleStatement("SELECT 1")).toBe("SELECT 1");
    expect(singleStatement("SELECT 1;")).toBe("SELECT 1");
    expect(singleStatement("  SELECT 1 ;  ")).toBe("SELECT 1");
  });

  test("drops everything after the terminator, not just a trailing semicolon", () => {
    // The two cases a regular expression gets wrong, and the reason this exists:
    // both used to travel into a subquery and turn into a syntax error.
    expect(singleStatement("SELECT 1;;")).toBe("SELECT 1");
    expect(singleStatement("SELECT 1; -- Rest")).toBe("SELECT 1");
    expect(singleStatement("SELECT 1; /* Rest */ ;")).toBe("SELECT 1");
  });

  test("a semicolon that separates nothing stays part of the statement", () => {
    expect(singleStatement("SELECT 'a;b'")).toBe("SELECT 'a;b'");
    expect(singleStatement("SELECT 1 /*;*/")).toBe("SELECT 1 /*;*/");
    expect(singleStatement('SELECT "od;d" FROM t')).toBe('SELECT "od;d" FROM t');
  });

  test("several statements have no single one to hand back", () => {
    expect(singleStatement("SELECT 1; SELECT 2")).toBeNull();
    expect(singleStatement("DELETE FROM t; SELECT 1")).toBeNull();
  });

  test("nothing at all is not a statement either", () => {
    expect(singleStatement("")).toBeNull();
    expect(singleStatement("  ;; ")).toBeNull();
  });
});
