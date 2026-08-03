/**
 * What a management table is made of.
 *
 * The components own these shapes and the resource definitions fill them in, so
 * a new managed dataset is a column list, a filter list and three flags rather
 * than a new page. Nothing here grants a permission: what may be written is
 * decided by services/manage.ts, which does not read these files.
 */

export type ColumnSpec = {
  /** The database column, and the name the form field is built from. */
  key: string;
  label: string;
  /**
   * Whether the cell becomes an input in edit mode. The authoritative list is
   * EDITABLE_COLUMNS in services/manage.ts; this only decides what is offered.
   */
  editable?: boolean;
  /** How the value is shown and typed - `datetime` round-trips as ISO 8601. */
  kind?: "text" | "number" | "datetime";
  /** Off by default in the column picker, for the columns most people never need. */
  secondary?: boolean;
};

export type FilterSpec = {
  key: string;
  label: string;
  /** `select` needs options, supplied per request from the data itself. */
  kind: "select" | "text" | "date";
  placeholder?: string;
};

export type ResourceSpec = {
  /** Path segment and the key its options are looked up under. */
  key: string;
  path: string;
  title: string;
  intro: string;
  columns: ColumnSpec[];
  /** Shown when the address names no columns. */
  defaultColumns: string[];
  sortable: string[];
  defaultSort: string;
  filters: FilterSpec[];
  capabilities: {
    /** Cells can become inputs. */
    edit: boolean;
    /** Rows carry a checkbox. */
    select: boolean;
    /** The selection can be removed. */
    remove: boolean;
  };
};

export const columnsByKey = (spec: ResourceSpec, keys: readonly string[]) =>
  keys
    .map((key) => spec.columns.find((column) => column.key === key))
    .filter((column): column is ColumnSpec => column !== undefined);
