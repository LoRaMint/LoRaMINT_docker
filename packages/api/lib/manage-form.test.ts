import { describe, expect, test } from "bun:test";
import {
  changedFields,
  isConfirmed,
  parseAction,
  parseReason,
  parseRows,
  parseSelection,
} from "./manage-form";

const EDITABLE = ["value", "unit", "location", "recorded_at"] as const;

const ID = "11111111-2222-3333-4444-555555555555";
const OTHER = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

/** The pair of inputs one editable cell produces. */
const cell = (id: string, field: string, value: string, previous: string) => ({
  [`m.${id}.${field}`]: value,
  [`m.${id}.prev.${field}`]: previous,
});

describe("which button was pressed", () => {
  test("a row's own save button carries the row it belongs to", () => {
    const result = parseAction({ saveRow: ID });
    expect(result).toEqual({ ok: true, data: { kind: "saveRow", id: ID } });
  });

  test("the bulk buttons carry nothing else", () => {
    for (const kind of ["saveSelected", "deleteSelected", "deleteAll"] as const) {
      expect(parseAction({ [kind]: "" })).toEqual({ ok: true, data: { kind } });
    }
  });

  test("no button at all is refused", () => {
    expect(parseAction({ reason: "weil" }).ok).toBe(false);
  });

  test("two at once are refused rather than resolved by precedence", () => {
    const result = parseAction({ saveSelected: "", deleteSelected: "" });
    expect(result.ok).toBe(false);
  });

  test("a row id that is not a uuid is refused", () => {
    expect(parseAction({ saveRow: "1 OR 1=1" }).ok).toBe(false);
  });
});

describe("reading the submitted cells", () => {
  test("pairs each value with where it started", () => {
    const rows = parseRows({ ...cell(ID, "value", "23.5", "235") }, EDITABLE);
    expect(rows).toEqual([
      { id: ID, values: { value: "23.5" }, previous: { value: "235" } },
    ]);
  });

  test("keeps the rows apart", () => {
    const rows = parseRows(
      { ...cell(ID, "value", "1", "0"), ...cell(OTHER, "value", "3", "2") },
      EDITABLE,
    );
    expect(rows.map((row) => row.id).sort()).toEqual([OTHER, ID].sort());
  });

  test("drops a field that is not editable", () => {
    const rows = parseRows(
      {
        ...cell(ID, "value", "1", "0"),
        ...cell(ID, "device_eui", "0000000000000000", "70B3D57ED0001234"),
      },
      EDITABLE,
    );
    expect(rows[0]!.values).toEqual({ value: "1" });
    expect(rows[0]!.values.device_eui).toBeUndefined();
  });

  test("drops a value that arrived without its previous value", () => {
    // Without a starting point there is nothing to detect a concurrent change
    // against, so the field is not written at all.
    const rows = parseRows({ [`m.${ID}.value`]: "99" }, EDITABLE);
    expect(rows).toEqual([]);
  });

  test("ignores keys that are not cells of this table", () => {
    const rows = parseRows(
      { reason: "weil", saveSelected: "", "x.y.z": "1", [`m.${ID}`]: "1" },
      EDITABLE,
    );
    expect(rows).toEqual([]);
  });

  test("ignores a row id that is not a uuid", () => {
    const rows = parseRows({ ...cell("../../etc/passwd", "value", "1", "0") }, EDITABLE);
    expect(rows).toEqual([]);
  });

  test("reads an emptied field as null rather than as an empty string", () => {
    const rows = parseRows({ ...cell(ID, "recorded_at", "  ", "2026-01-01") }, EDITABLE);
    expect(rows[0]!.values.recorded_at).toBeNull();
  });
});

describe("what actually changed", () => {
  test("only the fields that moved", () => {
    const rows = parseRows(
      { ...cell(ID, "value", "23.5", "235"), ...cell(ID, "unit", "°C", "°C") },
      EDITABLE,
    );
    expect(changedFields(rows[0]!)).toEqual({
      value: { from: "235", to: "23.5" },
    });
  });

  test("a table nobody touched produces no changes at all", () => {
    const rows = parseRows(
      { ...cell(ID, "value", "1", "1"), ...cell(ID, "unit", "°C", "°C") },
      EDITABLE,
    );
    expect(changedFields(rows[0]!)).toEqual({});
  });

  test("clearing a field is a change to null, not an absent one", () => {
    const rows = parseRows({ ...cell(ID, "recorded_at", "", "2026-01-01") }, EDITABLE);
    expect(changedFields(rows[0]!)).toEqual({
      recorded_at: { from: "2026-01-01", to: null },
    });
  });

  test("filling an empty field is a change from null", () => {
    const rows = parseRows({ ...cell(ID, "recorded_at", "2026-01-01", "") }, EDITABLE);
    expect(changedFields(rows[0]!)).toEqual({
      recorded_at: { from: null, to: "2026-01-01" },
    });
  });
});

describe("the selection", () => {
  test("reads several ticked boxes", () => {
    expect(parseSelection({ sel: [ID, OTHER] }).sort()).toEqual([ID, OTHER].sort());
  });

  test("reads a single ticked box, which arrives without an array", () => {
    expect(parseSelection({ sel: ID })).toEqual([ID]);
  });

  test("is empty when nothing is ticked", () => {
    expect(parseSelection({})).toEqual([]);
  });

  test("drops anything that is not an id", () => {
    expect(parseSelection({ sel: [ID, "'; DELETE FROM measurements; --"] })).toEqual([ID]);
  });

  test("counts a duplicated id once", () => {
    expect(parseSelection({ sel: [ID, ID] })).toEqual([ID]);
  });
});

describe("the reason and the confirmation", () => {
  test("an empty reason is none", () => {
    expect(parseReason({ reason: "   " })).toBeNull();
    expect(parseReason({})).toBeNull();
  });

  test("a long reason is cut rather than refused", () => {
    expect(parseReason({ reason: "x".repeat(900) })!.length).toBe(500);
  });

  test("only an explicit confirm counts", () => {
    expect(isConfirmed({ confirm: "1" })).toBe(true);
    expect(isConfirmed({ confirm: "0" })).toBe(false);
    expect(isConfirmed({ confirm: "true" })).toBe(false);
    expect(isConfirmed({})).toBe(false);
  });
});
