import type { JSX } from "solid-js";
import TableFrame, { EmptyRow } from "../TableFrame";
import type { SortDirection } from "../../../lib/manage-view";
import type { ColumnSpec } from "./spec";
import { Muted } from "../Row";

/**
 * The management table: the result of a query, and in edit mode the form that
 * changes it.
 *
 * The table *is* the form. Correcting two rows is two clicks into cells and one
 * save, not two round trips through a detail page - which is also why there is
 * no detail page.
 *
 * Two things are worth being precise about:
 *
 * In read mode there are no inputs in the document. Not disabled ones, not
 * readonly ones - none. That is what makes "you cannot change anything by
 * accident here" true rather than merely intended.
 *
 * Which columns are visible is a display choice and *not* a security boundary:
 * it lives in the address and the caller sets it. What may be written is decided
 * by the field whitelist in services/manage.ts, which never reads this file.
 */

//====================================
// VALUES
//====================================

/**
 * The text a cell shows, and the exact string an input round-trips.
 *
 * Timestamps are rendered as ISO 8601 in UTC rather than in a local format,
 * because this string is also what gets typed back and compared against the
 * stored value. A pretty date that means a different instant when it returns
 * would be worse than a plain one.
 */
export const formatValue = (value: unknown) => {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};

/** A read-only cell. Also used by the SQL console, which shows arbitrary rows. */
export function Cell(props: { value: unknown }) {
  const v = props.value;
  if (v === null || v === undefined) {
    return <Muted>NULL</Muted>;
  }
  if (v instanceof Date) return <>{v.toISOString()}</>;
  if (typeof v === "object") return <>{JSON.stringify(v)}</>;
  return <>{String(v)}</>;
}

//====================================
// TABLE
//====================================

/**
 * How a column is set: numbers to the right and in figures of equal width,
 * everything else to the left.
 *
 * Left-aligned proportional numbers put the units, tens and hundreds of a
 * column in different places, and 18,4 / 124,05 / 1013,2 then cannot be
 * compared by looking down them. `tabular-nums` is the half people forget:
 * right alignment alone still lets a "1" take less room than a "0", so the
 * commas wander anyway.
 *
 * Read off `kind`, which the resource definitions already carry - no new
 * column property, and no list of "these ones are numbers" to keep in step.
 */
const cellClass = (column: ColumnSpec): string =>
  column.kind === "number" ? "text-right tabular-nums" : "";

export default function DataTable(props: {
  columns: ColumnSpec[];
  rows: Record<string, unknown>[];
  editing: boolean;
  selectable: boolean;
  /**
   * What goes in the last column of a row, if anything. A function rather than
   * a set of flags, because every page wants something different there - saving,
   * opening, undoing - and the table has no business knowing which.
   */
  rowActions?: (row: Record<string, unknown>) => JSX.Element | null;
  sortable: readonly string[];
  activeSort: string;
  activeDirection: SortDirection;
  sortHref: (column: string) => string;
  /** Shown when the filter matched nothing. */
  emptyText: string;
}) {
  const columnCount =
    props.columns.length + (props.selectable ? 1 : 0) + (props.rowActions ? 1 : 0);

  return (
    <TableFrame>
        <thead>
          <tr>
            {props.selectable && (
              <th class="w-8">
                {/* Ticks the rows of this page - the boundary you can see. The
                    whole result set has its own button, with its count in the
                    label. Enhanced by the island; without JavaScript the row
                    checkboxes still work on their own. */}
                <input
                  type="checkbox"
                  class="checkbox checkbox-sm"
                  data-select-all
                  aria-label="Alle Zeilen dieser Seite auswählen"
                />
              </th>
            )}
            {props.columns.map((column) => (
              <th class={cellClass(column)}>
                {props.sortable.includes(column.key) ? (
                  <a href={props.sortHref(column.key)} class="link no-underline">
                    {column.label}
                    {props.activeSort === column.key &&
                      (props.activeDirection === "desc" ? " ▾" : " ▴")}
                  </a>
                ) : (
                  column.label
                )}
              </th>
            ))}
            {props.rowActions && <th class="text-right">Aktion</th>}
          </tr>
        </thead>
        <tbody>
          {props.rows.length === 0 ? (
            <EmptyRow columns={columnCount}>{props.emptyText}</EmptyRow>
          ) : (
            props.rows.map((row) => {
              const id = String(row.id ?? "");
              return (
                <tr>
                  {props.selectable && (
                    <td>
                      <input
                        type="checkbox"
                        name="sel"
                        value={id}
                        class="checkbox checkbox-sm"
                        aria-label="Diese Zeile auswählen"
                      />
                    </td>
                  )}
                  {props.columns.map((column) => {
                    const editable = props.editing && column.editable === true;
                    const text = formatValue(row[column.key]);
                    return (
                      <td
                        class={`${editable ? "p-1" : "whitespace-nowrap"} ${cellClass(column)}`}
                      >
                        {editable ? (
                          <>
                            <input
                              type="text"
                              name={`m.${id}.${column.key}`}
                              value={text}
                              data-previous={text}
                              class="input input-sm input-ghost w-full min-w-24 font-mono"
                              spellcheck={false}
                              autocapitalize="none"
                              aria-label={column.label}
                            />
                            {/* The starting point. Without it the save has
                                nothing to detect a concurrent change against,
                                and the field is dropped rather than written. */}
                            <input
                              type="hidden"
                              name={`m.${id}.prev.${column.key}`}
                              value={text}
                            />
                          </>
                        ) : (
                          <Cell value={row[column.key]} />
                        )}
                      </td>
                    );
                  })}
                  {props.rowActions && (
                    <td class="text-right whitespace-nowrap">{props.rowActions(row)}</td>
                  )}
                </tr>
              );
            })
          )}
        </tbody>
      </TableFrame>
  );
}
