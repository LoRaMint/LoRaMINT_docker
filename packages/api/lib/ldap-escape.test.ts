import { describe, expect, test } from "bun:test";
import { escapeDnValue, escapeFilterValue, fillUsername } from "./ldap-escape";

const FILTER = "(&(uid={username})(employeeType=loramint))";
const DN_TEMPLATE = "uid={username},ou=people,dc=example,dc=org";

describe("escapeFilterValue", () => {
  test("leaves ordinary login names alone", () => {
    expect(escapeFilterValue("mruf")).toBe("mruf");
  });

  test("escapes the RFC 4515 metacharacters", () => {
    expect(escapeFilterValue("*")).toBe("\\2a");
    expect(escapeFilterValue("(")).toBe("\\28");
    expect(escapeFilterValue(")")).toBe("\\29");
    expect(escapeFilterValue("\\")).toBe("\\5c");
    expect(escapeFilterValue("a\0b")).toBe("a\\00b");
  });

  test("neutralises a filter injection instead of closing the clause", () => {
    const filter = fillUsername(FILTER, "*)(uid=admin", escapeFilterValue);
    // The injected parentheses must not survive as filter syntax: the whole
    // thing has to stay a single uid comparison.
    expect(filter).toBe("(&(uid=\\2a\\29\\28uid=admin)(employeeType=loramint))");
    expect(filter.match(/\(/g)).toHaveLength(3); // (& , (uid= , (employeeType=
  });

  test("a bare wildcard cannot match every entry", () => {
    expect(fillUsername(FILTER, "*", escapeFilterValue)).toBe(
      "(&(uid=\\2a)(employeeType=loramint))",
    );
  });
});

describe("escapeDnValue", () => {
  test("leaves ordinary login names alone", () => {
    expect(escapeDnValue("mruf")).toBe("mruf");
  });

  test("escapes the RFC 4514 metacharacters", () => {
    for (const c of [",", "+", '"', "<", ">", ";", "=", "\\"]) {
      expect(escapeDnValue(c)).toBe(`\\${c}`);
    }
    expect(escapeDnValue("a\0b")).toBe("a\\00b");
  });

  test("escapes a leading hash and leading/trailing spaces", () => {
    expect(escapeDnValue("#tag")).toBe("\\#tag");
    expect(escapeDnValue(" lead")).toBe("\\ lead");
    expect(escapeDnValue("trail ")).toBe("trail\\ ");
  });

  test("cannot inject another RDN into the template", () => {
    const dn = fillUsername(DN_TEMPLATE, "service,ou=system", escapeDnValue);
    expect(dn).toBe("uid=service\\,ou\\=system,ou=people,dc=example,dc=org");
    // Still exactly one unescaped comma per template separator, none injected.
    expect(dn.match(/(?<!\\),/g)).toHaveLength(3);
  });
});

describe("fillUsername", () => {
  test("replaces every occurrence of the placeholder", () => {
    expect(fillUsername("{username}/{username}", "mruf", escapeFilterValue)).toBe(
      "mruf/mruf",
    );
  });

  test("a username that looks like the placeholder is not re-expanded", () => {
    expect(fillUsername(DN_TEMPLATE, "{username}", escapeDnValue)).toBe(
      "uid={username},ou=people,dc=example,dc=org",
    );
  });
});
