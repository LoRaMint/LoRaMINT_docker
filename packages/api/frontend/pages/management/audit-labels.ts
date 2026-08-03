/**
 * German names for the things the log records.
 *
 * The database stores what happened in its own words - `update`, `log_entries` -
 * and the page says it in the reader's. Kept in one place so the operation list,
 * the operation page and the confirmation cannot disagree about what an entry is
 * called.
 */

export const ACTION_LABELS: Record<string, string> = {
  update: "geändert",
  delete: "gelöscht",
  insert: "wiederhergestellt",
};

export const TABLE_LABELS: Record<string, string> = {
  measurements: "Messwerte",
  log_entries: "Logeinträge",
};

export const actionLabel = (action: unknown) =>
  ACTION_LABELS[String(action)] ?? String(action);

export const tableLabel = (table: unknown) =>
  TABLE_LABELS[String(table)] ?? String(table);

/** Where the rows an entry belongs to can be looked at. */
export const tablePath = (table: unknown) =>
  String(table) === "log_entries"
    ? "/management/data/log-entries"
    : "/management/data/measurements";

/**
 * How much of an operation has been taken back. Derived from the entries rather
 * than stored, so it cannot fall out of step with them.
 */
export const revertState = (rowCount: number, revertedCount: number) => {
  if (revertedCount === 0) return { label: "offen", tone: "" };
  if (revertedCount >= rowCount)
    return { label: "zurückgenommen", tone: "badge-success" };
  return { label: `teilweise zurückgenommen (${revertedCount}/${rowCount})`, tone: "badge-warning" };
};
