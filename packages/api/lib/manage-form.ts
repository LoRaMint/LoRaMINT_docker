import type { MutationResult } from "../types";

/**
 * Reading the form a management table submits.
 *
 * The table is one big form: every editable cell is an input named
 * `m.<uuid>.<field>`, carrying its starting value in a hidden
 * `m.<uuid>.prev.<field>`. Nothing here touches a database, so all of it is
 * unit-testable, and the rules that decide what may be written are in one place
 * rather than spread through a route handler.
 *
 * The guiding rule: anything that does not match exactly is dropped, not
 * repaired. A request naming a field that is not editable simply has no field by
 * that name as far as the rest of the application is concerned.
 */

//====================================
// TYPES
//====================================

/** Which button was pressed. Exactly one of these arrives per request. */
export type ManageAction =
  | { kind: "saveRow"; id: string }
  | { kind: "saveSelected" }
  | { kind: "deleteSelected" }
  | { kind: "deleteAll" };

/** One row as it came back from the browser: new values and where they started. */
export type SubmittedRow = {
  id: string;
  values: Record<string, string | null>;
  previous: Record<string, string | null>;
};

export type FieldChange = { from: string | null; to: string | null };

//====================================
// CONSTANTS
//====================================

const UUID_PATTERN =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** Long enough for a sentence explaining a correction, short enough to store. */
const REASON_MAX_LENGTH = 500;

const ACTION_KEYS = ["saveRow", "saveSelected", "deleteSelected", "deleteAll"] as const;

//====================================
// PRIMITIVES
//====================================

/**
 * The single string behind a form key. Anything else - a file upload, a repeated
 * field, a missing one - is not a value this form ever produces, so it is none.
 */
const single = (raw: unknown): string | null => {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  // Empty means "cleared", and the column decides whether that is allowed. Using
  // null rather than "" keeps that decision out of here.
  return trimmed.length === 0 ? null : trimmed;
};

/** Every string behind a form key, for the fields that legitimately repeat. */
const many = (raw: unknown): string[] => {
  if (typeof raw === "string") return [raw];
  if (!Array.isArray(raw)) return [];
  return raw.filter((entry): entry is string => typeof entry === "string");
};

//====================================
// PARSING
//====================================

/**
 * Which button the browser sent. Only the clicked submit button is transmitted,
 * so this is how one form serves five actions without any JavaScript.
 *
 * More than one is refused rather than resolved by precedence: a request
 * claiming to both save and delete was not produced by this page, and guessing
 * which half to honour is how the wrong one gets honoured.
 */
export const parseAction = (
  body: Record<string, unknown>,
): MutationResult<ManageAction> => {
  const present = ACTION_KEYS.filter((key) => key in body);
  if (present.length === 0) return { ok: false, error: "Keine Aktion angegeben." };
  if (present.length > 1) return { ok: false, error: "Mehrere Aktionen auf einmal." };

  const key = present[0]!;
  if (key === "saveRow") {
    const id = single(body.saveRow);
    if (!id || !UUID_PATTERN.test(id)) {
      return { ok: false, error: "Ungültige Zeile." };
    }
    return { ok: true, data: { kind: "saveRow", id } };
  }
  return { ok: true, data: { kind: key } };
};

/**
 * The rows the form carried, keyed by id.
 *
 * A field survives only when it is in `editable` *and* its previous value came
 * along: without the starting point there is nothing to detect a concurrent
 * change against, and writing blind is exactly what the hidden field exists to
 * prevent.
 */
export const parseRows = (
  body: Record<string, unknown>,
  editable: readonly string[],
): SubmittedRow[] => {
  const rows = new Map<string, SubmittedRow>();
  const allowed = new Set(editable);

  const rowFor = (id: string) => {
    let row = rows.get(id);
    if (!row) {
      row = { id, values: {}, previous: {} };
      rows.set(id, row);
    }
    return row;
  };

  for (const [key, raw] of Object.entries(body)) {
    const parts = key.split(".");
    // m.<uuid>.<field>  or  m.<uuid>.prev.<field>
    if (parts[0] !== "m") continue;
    if (parts.length !== 3 && parts.length !== 4) continue;

    const id = parts[1]!;
    if (!UUID_PATTERN.test(id)) continue;

    const isPrevious = parts.length === 4;
    if (isPrevious && parts[2] !== "prev") continue;

    const field = parts[parts.length - 1]!;
    if (!allowed.has(field)) continue;

    const target = isPrevious ? rowFor(id).previous : rowFor(id).values;
    target[field] = single(raw);
  }

  // Drop fields that arrived without their counterpart, then rows left empty.
  const complete: SubmittedRow[] = [];
  for (const row of rows.values()) {
    const values: Record<string, string | null> = {};
    const previous: Record<string, string | null> = {};
    for (const field of Object.keys(row.values)) {
      if (!(field in row.previous)) continue;
      values[field] = row.values[field]!;
      previous[field] = row.previous[field]!;
    }
    if (Object.keys(values).length > 0) {
      complete.push({ id: row.id, values, previous });
    }
  }
  return complete;
};

/**
 * What actually moved in a row. An untouched field produces no entry, so it is
 * neither written nor logged - which is why saving a table full of inputs does
 * not rewrite every cell in it.
 */
export const changedFields = (row: SubmittedRow): Record<string, FieldChange> => {
  const changes: Record<string, FieldChange> = {};
  for (const [field, value] of Object.entries(row.values)) {
    const before = row.previous[field] ?? null;
    if (value === before) continue;
    changes[field] = { from: before, to: value };
  }
  return changes;
};

/** The ticked checkboxes, as ids. */
export const parseSelection = (body: Record<string, unknown>): string[] => {
  const seen = new Set<string>();
  for (const entry of many(body.sel)) {
    const id = entry.trim();
    if (UUID_PATTERN.test(id)) seen.add(id);
  }
  return [...seen];
};

/** Why the change is being made, for the log. Optional, and never trusted for length. */
export const parseReason = (body: Record<string, unknown>): string | null => {
  const reason = single(body.reason);
  if (!reason) return null;
  return reason.length > REASON_MAX_LENGTH
    ? reason.slice(0, REASON_MAX_LENGTH)
    : reason;
};

/** True only on the second, deliberate submit of a confirmation. */
export const isConfirmed = (body: Record<string, unknown>) => body.confirm === "1";
