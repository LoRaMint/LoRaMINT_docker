import type { JSX } from "solid-js";

/**
 * One label-and-value line: the caption in a fixed left column, the value
 * beside it, a rule underneath.
 *
 * It existed twice, written separately in `device-page.tsx` and
 * `profile/page.tsx`, plus three times inline in the profile form - which is how
 * these things go: whoever writes the second page does not think to search the
 * first. The two copies had drifted to `py-2` against `py-3` and
 * `border-base-200` against `border-base-300`, differences nobody chose.
 *
 * **The columns collapse below `sm`.** On a phone the caption sits above its
 * value instead of beside it, because 14rem of label next to a device identifier
 * leaves no room for the identifier.
 *
 * `last:border-0` keeps the final row from drawing a rule against the bottom of
 * whatever contains it, where there is already one.
 */
export default function Row(props: {
  label: JSX.Element;
  /**
   * The id of the control in the right-hand column, when there is one.
   *
   * This is the case `components/Field.tsx` cannot cover. Field nests the
   * control inside its label, which needs no id and cannot come apart - but here
   * the two sit in different grid cells, so the caption has to point at the
   * control by name. Without it the caption is decoration: clicking it does
   * nothing and a screen reader announces the control unnamed.
   */
  for?: string;
  children: JSX.Element;
}) {
  return (
    <div class="grid sm:grid-cols-[14rem_1fr] gap-1 sm:gap-4 py-3 border-b border-base-300 last:border-0">
      {props.for ? (
        <label class="text-base-content/70" for={props.for}>
          {props.label}
        </label>
      ) : (
        <div class="text-base-content/70">{props.label}</div>
      )}
      <div>{props.children}</div>
    </div>
  );
}

/**
 * A value that is not there: NULL in a result set, an unset field, a log entry
 * that recorded nothing.
 *
 * Eight places spelled this out. Worth a name mostly so the *distinction* stays
 * visible - "the value is empty" has to look different from "the value is the
 * text `leer`", and once that is one component it cannot come apart again.
 */
export function Muted(props: { children: JSX.Element }) {
  return <span class="text-base-content/40 italic">{props.children}</span>;
}
