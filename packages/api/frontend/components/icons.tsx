/**
 * The few icons this application draws itself.
 *
 * They were written out inline where they were needed, and the bin was about to
 * be the fourth copy of the same eleven-character path. The rule they follow is
 * the one the design writes down: a 24-unit grid, 2px strokes, no fills, and
 * `currentColor` - so an icon takes the colour of the text beside it and needs
 * nothing said about it in dark mode.
 *
 * `aria-hidden` on every one of them: an icon here always sits next to the word
 * it illustrates, and a screen reader that read both would say it twice.
 */
import type { JSX } from "solid-js";

function Icon(props: { class?: string; children: JSX.Element }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class={props.class ?? "h-4 w-4"}
      aria-hidden="true"
    >
      {props.children}
    </svg>
  );
}

/** Goes on every control that removes something, so the meaning is not colour alone. */
export function TrashIcon(props: { class?: string }) {
  return (
    <Icon class={props.class}>
      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
    </Icon>
  );
}

/** Undoing: the arrow that turns back on itself. */
export function UndoIcon(props: { class?: string }) {
  return (
    <Icon class={props.class}>
      <path d="M3 7v6h6" />
      <path d="M3 13a9 9 0 1 0 3-7.7L3 8" />
    </Icon>
  );
}
