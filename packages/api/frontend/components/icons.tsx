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

/** Fetching a file: the arrow into the tray. */
export function DownloadIcon(props: { class?: string }) {
  return (
    <Icon class={props.class}>
      <path d="M12 3v12m0 0l-4-4m4 4l4-4" />
      <path d="M4 19h16" />
    </Icon>
  );
}

/**
 * Shown, and not shown.
 *
 * Both exist because the state has to be readable without colour: the row says
 * the word as well, and the icon is what makes the button it sits on legible at
 * a glance. See the design rule against carrying meaning in colour alone.
 */
export function EyeIcon(props: { class?: string }) {
  return (
    <Icon class={props.class}>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7" />
      <circle cx="12" cy="12" r="3" />
    </Icon>
  );
}

export function EyeOffIcon(props: { class?: string }) {
  return (
    <Icon class={props.class}>
      <path d="M4 4l16 16" />
      <path d="M9.9 5.2A9.6 9.6 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1" />
      <path d="M6.5 7.4A16.6 16.6 0 0 0 2 12s3.6 7 10 7a9.7 9.7 0 0 0 4.2-.9" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </Icon>
  );
}
