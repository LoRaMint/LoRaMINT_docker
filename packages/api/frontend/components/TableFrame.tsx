import type { JSX } from "solid-js";
import { TABLE_CLASS, TABLE_FRAME_CLASS } from "../../lib/table-style";

/**
 * A table in the bordered, side-scrollable box this application shows tables in.
 *
 * It was written out twelve times, and the table inside it in three different
 * spellings - `table`, `table table-sm`, `table table-sm table-zebra` - with no
 * rule anywhere for which belonged where. So this owns the `<table>` element as
 * well as the frame: leaving the classes to the caller is what let three
 * variants grow, and a component that fixes only the box would not have
 * prevented any of it.
 *
 * The one kept is the dense, striped variant. These are wide rows of readings
 * and identifiers, and the stripe is what stops the eye sliding into the wrong
 * one halfway across.
 *
 * `overflow-x-auto` is the part that matters on a phone: a measurement table has
 * more columns than a phone has width, and this scrolls the table rather than
 * the page.
 */
export default function TableFrame(props: {
  /** Utility classes for the frame - bottom margin, mostly. */
  class?: string;
  children: JSX.Element;
}) {
  return (
    <div class={`${TABLE_FRAME_CLASS} ${props.class ?? ""}`}>
      {/*
        * `table-pin-rows` keeps the header where it is while the body scrolls.
        * On a measurement table twenty rows in, the column a number belongs to
        * is otherwise a guess.
        *
        * The classes come from lib/table-style.ts because lib/markdown.ts
        * builds the same table as a string and the two must not drift.
        */}
      <table class={TABLE_CLASS}>{props.children}</table>
    </div>
  );
}

/**
 * The row a table shows instead of rows when it has none.
 *
 * Six places wrote this out, each with its own column count. It is worth being a
 * component less for the six lines it saves than for the `colspan`: get that
 * number wrong and the cell stops spanning the table, which looks like a broken
 * layout rather than like an empty result, and nobody notices until the table
 * happens to be empty.
 */
export function EmptyRow(props: { columns: number; children: JSX.Element }) {
  return (
    <tr>
      <td colspan={props.columns} class="text-center text-base-content/70 py-6">
        {props.children}
      </td>
    </tr>
  );
}
