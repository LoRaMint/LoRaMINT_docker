import { describe, expect, test } from "bun:test";
import { inverseOf } from "./audit-revert";

describe("undoing a correction", () => {
  test("puts the fields back where they came from", () => {
    const inverse = inverseOf({
      action: "update",
      changes: { fields: { value: { from: "235", to: "23.5" } } },
    });

    expect(inverse).toEqual({
      kind: "update",
      fields: { value: { from: "23.5", to: "235" } },
    });
  });

  test("swaps every field of the entry, not just the first", () => {
    const inverse = inverseOf({
      action: "update",
      changes: {
        fields: {
          value: { from: "1", to: "2" },
          location: { from: "Labor", to: "Gewächshaus" },
        },
      },
    });

    expect(inverse).toEqual({
      kind: "update",
      fields: {
        value: { from: "2", to: "1" },
        location: { from: "Gewächshaus", to: "Labor" },
      },
    });
  });

  test("keeps an emptied field as the null it was", () => {
    const inverse = inverseOf({
      action: "update",
      changes: { fields: { recorded_at: { from: "2026-01-01", to: null } } },
    });

    expect(inverse).toEqual({
      kind: "update",
      fields: { recorded_at: { from: null, to: "2026-01-01" } },
    });
  });
});

describe("undoing a deletion", () => {
  test("puts the row back, with the id it had", () => {
    const row = { id: "11111111-2222-3333-4444-555555555555", value: "23.5" };
    expect(inverseOf({ action: "delete", changes: { before: row } })).toEqual({
      kind: "insert",
      row,
    });
  });

  test("refuses a snapshot without an id - there would be no row to restore", () => {
    expect(inverseOf({ action: "delete", changes: { before: { value: "1" } } })).toBeNull();
  });
});

describe("undoing a restoration", () => {
  test("takes the row away again", () => {
    expect(
      inverseOf({ action: "insert", changes: { after: { id: "x", value: "1" } } }),
    ).toEqual({ kind: "delete" });
  });
});

describe("entries that cannot be read", () => {
  test("produce no operation rather than a guessed one", () => {
    // Changing data on the strength of a misread entry is worse than refusing.
    expect(inverseOf({ action: "update", changes: null })).toBeNull();
    expect(inverseOf({ action: "update", changes: {} })).toBeNull();
    expect(inverseOf({ action: "update", changes: { fields: {} } })).toBeNull();
    expect(inverseOf({ action: "truncate", changes: { fields: {} } })).toBeNull();
  });

  test("one unreadable field spoils the whole entry", () => {
    // Reverting the rest would leave the row in a state it was never in.
    const inverse = inverseOf({
      action: "update",
      changes: {
        fields: { value: { from: "1", to: "2" }, unit: { from: 5, to: 6 } },
      },
    });
    expect(inverse).toBeNull();
  });
});
