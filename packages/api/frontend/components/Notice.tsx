import type { JSX } from "solid-js";

export type Tone = "success" | "error" | "warning";

const TONES: Record<Tone, string> = {
  success: "border-success/40 bg-success/10",
  error: "border-error bg-error/10",
  warning: "border-warning bg-warning/10",
};

/**
 * The box a page says something in - the same four lines that stood in every
 * management page before.
 *
 * An error is announced to assistive technology, a confirmation is not: a
 * success message is worth reading, but interrupting somebody to say that what
 * they just asked for happened is noise.
 */
export default function Notice(props: { tone: Tone; children: JSX.Element }) {
  return (
    <div
      role={props.tone === "success" ? undefined : "alert"}
      class={`rounded-box border px-4 py-3 mb-4 ${TONES[props.tone]}`}
    >
      {props.children}
    </div>
  );
}
