/**
 * Turning a log entry into the operation that undoes it.
 *
 * Pure, and deliberately separate from the code that executes it: the rule
 * "what is the opposite of this change" is the heart of the undo, and it should
 * be readable and testable without a database in the way.
 *
 * Undoing never removes anything. The entry stays, the opposite operation runs,
 * and that operation is logged as an entry of its own pointing back at the one
 * it took back. So a correction, its undo, and the undo of that undo are three
 * rows in the log and one chain to read - which is the whole point.
 */

//====================================
// TYPES
//====================================

export type FieldChange = { from: string | null; to: string | null };

/** The shape a log entry needs to have to be undone. */
export type RevertableEntry = {
  action: string;
  /** The decoded `changes` column: `{ fields }`, `{ before }` or `{ after }`. */
  changes: unknown;
};

export type Inverse =
  /** Put the fields back to what they were before the change. */
  | { kind: "update"; fields: Record<string, FieldChange> }
  /** Put the row back, exactly as it was, id included. */
  | { kind: "insert"; row: Record<string, unknown> }
  /** Take the row away again; the snapshot is taken as it happens. */
  | { kind: "delete" };

//====================================
// READING THE ENTRY
//====================================

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

/** A `{from, to}` pair, or null if it is not one. */
const asFieldChange = (value: unknown): FieldChange | null => {
  const record = asRecord(value);
  if (!record || !("from" in record) || !("to" in record)) return null;
  const from = record.from;
  const to = record.to;
  const ok = (v: unknown) => v === null || typeof v === "string";
  if (!ok(from) || !ok(to)) return null;
  return { from: from as string | null, to: to as string | null };
};

//====================================
// THE INVERSE
//====================================

/**
 * The operation that undoes `entry`, or null when the entry does not describe
 * something that can be undone.
 *
 * Null rather than a guess: an entry whose payload does not have the expected
 * shape is one this code does not understand, and inventing an operation from
 * it would change data on the strength of a misreading.
 */
export const inverseOf = (entry: RevertableEntry): Inverse | null => {
  const changes = asRecord(entry.changes);
  if (!changes) return null;

  if (entry.action === "update") {
    const fields = asRecord(changes.fields);
    if (!fields) return null;
    const inverted: Record<string, FieldChange> = {};
    for (const [column, raw] of Object.entries(fields)) {
      const change = asFieldChange(raw);
      // One unreadable field makes the whole entry unreadable: reverting the
      // rest would leave the row in a state that never existed.
      if (!change) return null;
      inverted[column] = { from: change.to, to: change.from };
    }
    return Object.keys(inverted).length > 0 ? { kind: "update", fields: inverted } : null;
  }

  if (entry.action === "delete") {
    const row = asRecord(changes.before);
    if (!row || typeof row.id !== "string") return null;
    return { kind: "insert", row };
  }

  if (entry.action === "insert") {
    // The row is still there to be snapshotted, so nothing from the entry is
    // needed beyond knowing which row it was.
    return { kind: "delete" };
  }

  return null;
};
