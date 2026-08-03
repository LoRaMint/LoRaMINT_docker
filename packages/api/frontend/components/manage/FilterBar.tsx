import type { FilterChip } from "../../../lib/manage-view";
import type { ColumnSpec, FilterSpec } from "./spec";

/**
 * Choosing which rows and which columns to see.
 *
 * A GET form, so the whole view ends up in the address: reloading, the back
 * button, bookmarks and sharing a link all work without any client-side state,
 * and every action can return to exactly the view it started from.
 *
 * Because submitting replaces the entire query string, the settings that are not
 * filters - the mode, the sorting - travel as hidden fields. Filtering must not
 * silently drop you back out of edit mode.
 *
 * The column picker is part of the filter on purpose: hiding the columns you are
 * not working on is the other half of finding the rows you are working on. It is
 * a display choice, not a permission - see the note in DataTable.
 */
export default function FilterBar(props: {
  action: string;
  filters: FilterSpec[];
  /** Options per select filter, taken from the data itself. */
  options: Record<string, string[]>;
  /** Current filter values, by key. */
  values: Record<string, string | undefined>;
  columns: ColumnSpec[];
  visibleColumns: string[];
  /** Carried through submission so filtering does not reset them. */
  hidden: Record<string, string | undefined>;
  chips: FilterChip[];
  /** Where "Zurücksetzen" leads: the same page with nothing set. */
  resetHref: string;
}) {
  const controlClass = "select select-sm w-full";

  return (
    <>
      <form method="get" action={props.action} class="mb-3">
        <div class="flex flex-wrap gap-3 items-end">
          {props.filters.map((filter) => (
            <label class="block">
              <span class="block text-sm mb-1 text-base-content/80">{filter.label}</span>
              {filter.kind === "select" ? (
                <select name={filter.key} class={controlClass}>
                  <option value="">alle</option>
                  {(props.options[filter.key] ?? []).map((option) => (
                    <option value={option} selected={props.values[filter.key] === option}>
                      {option}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type={filter.kind === "date" ? "date" : "text"}
                  name={filter.key}
                  value={props.values[filter.key] ?? ""}
                  placeholder={filter.placeholder}
                  class="input input-sm w-full"
                />
              )}
            </label>
          ))}

          <details class="dropdown">
            <summary class="btn btn-sm btn-outline">Spalten ▾</summary>
            <div class="dropdown-content z-10 mt-1 rounded-box border border-base-300 bg-base-100 p-3 shadow w-64">
              <p class="text-sm text-base-content/70 mb-2">
                Was nicht angezeigt wird, lässt sich hier auch nicht ändern.
              </p>
              {props.columns.map((column) => (
                <label class="flex items-center gap-2 py-1">
                  <input
                    type="checkbox"
                    name="cols"
                    value={column.key}
                    checked={props.visibleColumns.includes(column.key)}
                    class="checkbox checkbox-sm"
                  />
                  <span class="text-sm">{column.label}</span>
                </label>
              ))}
            </div>
          </details>

          {Object.entries(props.hidden).map(([key, value]) =>
            value ? <input type="hidden" name={key} value={value} /> : null,
          )}

          <button type="submit" class="btn btn-sm btn-primary">
            Filtern
          </button>
          <a href={props.resetHref} class="btn btn-sm btn-ghost">
            Zurücksetzen
          </a>
        </div>
      </form>

      {props.chips.length > 0 && (
        <div class="flex flex-wrap gap-2 mb-3">
          {props.chips.map((chip) => (
            <span class="badge badge-outline gap-1">
              {chip.label}: {chip.value}
              <a
                href={`${props.action}${chip.queryWithout}`}
                class="link no-underline"
                aria-label={`Filter ${chip.label} entfernen`}
                title={`Filter ${chip.label} entfernen`}
              >
                ×
              </a>
            </span>
          ))}
        </div>
      )}
    </>
  );
}
