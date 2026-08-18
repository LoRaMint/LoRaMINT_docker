/**
 * The view state of a management table, which lives entirely in the URL:
 * filters, visible columns, sorting, page and whether the table is editable.
 *
 * Keeping it there rather than in the session is what makes reloading, the back
 * button, bookmarks and "send me that link" work without a line of client code -
 * and it is why every action can return to exactly the view it was started from.
 *
 * Everything here is pure. Nothing decides what a caller *may* do: an unknown
 * column or sort key falls back to the default instead of being refused, because
 * these are display choices, not permissions. What may be written is decided in
 * lib/manage-form.ts and services/manage.ts.
 */

//====================================
// TYPES
//====================================

export type SortDirection = "asc" | "desc";

/** A filter the user set, shown above the table with a link that removes it. */
export type FilterChip = {
  key: string;
  label: string;
  value: string;
  /** The same view with this one filter dropped. */
  queryWithout: string;
};

export type Params = Record<string, string | null | undefined>;

//====================================
// PARSING
//====================================

/**
 * The columns to show, in the order the resource declares them rather than the
 * order they arrived in - a table whose columns move around when a link is
 * shared is a table nobody trusts.
 *
 * An empty or unrecognisable selection falls back to the default, so a truncated
 * URL still renders something usable.
 */
export const parseColumns = (
  raw: string | string[] | null | undefined,
  allowed: readonly string[],
  fallback: readonly string[],
): string[] => {
  if (!raw || raw.length === 0) return [...fallback];
  // A checkbox group submits `cols=a&cols=b`, a shared link carries `cols=a,b`.
  // Both mean the same thing, so both are read.
  const entries = (Array.isArray(raw) ? raw : [raw]).flatMap((entry) =>
    entry.split(","),
  );
  const wanted = new Set(
    entries.map((entry) => entry.trim()).filter((entry) => entry.length > 0),
  );
  const columns = allowed.filter((column) => wanted.has(column));
  return columns.length > 0 ? columns : [...fallback];
};

/**
 * How a column selection travels in a link: one comma-separated value, or none
 * at all when it is the resource's default.
 *
 * The picker is a checkbox group, so it submits `cols` once per checked box.
 * Read back as a flat record - which is what a query object is - only the last
 * of those survives, and a link built from it would carry a single column and
 * drop the rest on the next page. Going through the comma form says the same
 * thing to parseColumns and survives being read back.
 */
export const columnsParam = (
  visible: readonly string[],
  fallback: readonly string[],
): string | null =>
  visible.join(",") === fallback.join(",") ? null : visible.join(",");

/** The column to sort by; anything unknown sorts by the resource's default. */
export const parseSort = (
  raw: string | null | undefined,
  allowed: readonly string[],
  fallback: string,
) => (raw && allowed.includes(raw) ? raw : fallback);

/** Newest first unless asked otherwise - the useful default for measurements. */
export const parseDirection = (raw: string | null | undefined): SortDirection =>
  raw === "asc" ? "asc" : "desc";

export const parsePage = (raw: string | null | undefined) => {
  const page = Number(raw);
  return Number.isInteger(page) && page >= 1 ? page : 1;
};

/**
 * Editing is off unless the URL says otherwise, so a link someone shares opens
 * read-only. The mode is a parameter rather than a client-side toggle: in read
 * mode the server renders no input fields at all, which is a stronger promise
 * than disabling them.
 */
export const parseEditMode = (raw: string | null | undefined) => raw === "1";

//====================================
// BUILDING LINKS
//====================================

/**
 * A query string carrying `params` with `overrides` applied. Null or empty
 * values are left out entirely, so the address stays readable and a removed
 * filter leaves no trace of itself.
 */
export const buildQuery = (params: Params, overrides: Params = {}) => {
  const merged: Params = { ...params, ...overrides };
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(merged)) {
    if (value === null || value === undefined || value === "") continue;
    search.set(key, value);
  }
  const query = search.toString();
  return query.length > 0 ? `?${query}` : "";
};

/**
 * The same view a page further on. Sorting and paging are links rather than
 * buttons, which is also why they discard unsaved edits - the page warns before
 * following one.
 */
export const pageLink = (params: Params, page: number) =>
  buildQuery(params, { page: page > 1 ? String(page) : null });

/**
 * The page numbers to offer around the current one.
 *
 * A window rather than every page: at fifty pages a full list is a wall of
 * numbers nobody aims at. It is centred on the current page and clamped to the
 * ends, keeping its width instead of shrinking near the edges - so the numbers
 * stay where the hand expects them from one page to the next.
 */
export const pageWindow = (current: number, total: number, size = 7): number[] => {
  if (total <= 0) return [];
  const width = Math.min(size, total);
  const start = Math.min(
    Math.max(1, current - Math.floor(width / 2)),
    total - width + 1,
  );
  return Array.from({ length: width }, (_, offset) => start + offset);
};

/**
 * Clicking a column heading sorts by it; clicking the active one turns it
 * around. Paging resets, because page 7 of a different order is not a place the
 * user has ever been.
 */
export const sortLink = (params: Params, column: string, activeSort: string, activeDirection: SortDirection) =>
  buildQuery(params, {
    sort: column,
    dir: column === activeSort && activeDirection === "desc" ? "asc" : "desc",
    page: null,
  });

/** The mode switch: the same filtered view, read-only or editable. */
export const modeLink = (params: Params, edit: boolean) =>
  buildQuery(params, { edit: edit ? "1" : null });

/**
 * The active filters, each with a link that removes just that one. Removing a
 * filter always returns to the first page: the point of loosening a filter is
 * that there is now more to see.
 */
export const filterChips = (
  params: Params,
  definitions: readonly { key: string; label: string }[],
): FilterChip[] => {
  const chips: FilterChip[] = [];
  for (const definition of definitions) {
    const value = params[definition.key];
    if (value === null || value === undefined || value === "") continue;
    chips.push({
      key: definition.key,
      label: definition.label,
      value,
      queryWithout: buildQuery(params, { [definition.key]: null, page: null }),
    });
  }
  return chips;
};

/**
 * How the column selection is shown as one chip. Listing eleven column names
 * across the top would cost more room than the columns it hides.
 */
export const columnSummary = (visible: readonly string[], available: readonly string[]) =>
  `${visible.length} von ${available.length}`;
