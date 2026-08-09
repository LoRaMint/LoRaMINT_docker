import type { JSX } from "solid-js";

/**
 * One labelled control in a form.
 *
 * There were three spellings of this before, across nine files - and two of them
 * did not work. `form-control` and `label-text` are daisyUI **4** classes; the
 * project is on 5, where they no longer exist, so those thirty-nine usages
 * emitted no CSS at all and the forms on those pages quietly rendered their
 * labels at a different size from everywhere else. Nobody chose that; a version
 * bump did.
 *
 * Which is why this is built from plain Tailwind utilities rather than from
 * whatever daisyUI currently calls its form wrapper: the utilities are stable
 * across daisyUI versions, and the failure mode above - a class that silently
 * stops existing - is one this component should not be able to repeat. The
 * colour still comes from the theme (`base-content`), so a change to the palette
 * moves the labels with it.
 *
 * **The control is nested inside the `<label>`**, so it needs no `id` and no
 * `for`. That association cannot drift out of step the way a hand-written pair
 * can. Where the label has to sit somewhere else in the layout - the two-column
 * rows on the profile and device pages - that is a different component, because
 * there the explicit `for` is not optional.
 */
/**
 * A caption over a *group* of controls - several checkboxes, say - rather than
 * over one.
 *
 * Separate from `Field` because a `<label>` names exactly one control. Wrapping
 * six checkboxes in one would leave a screen reader announcing the group caption
 * as the name of each, which is worse than no caption. `<fieldset>` and
 * `<legend>` are the elements HTML has for this, and they need no extra
 * plumbing.
 */
export function FieldGroup(props: {
  label: JSX.Element;
  class?: string;
  children: JSX.Element;
}) {
  return (
    <fieldset class={props.class}>
      <legend class="block text-sm mb-1 text-base-content/80">
        {props.label}
      </legend>
      {props.children}
    </fieldset>
  );
}

export default function Field(props: {
  label: JSX.Element;
  /** Marks the field and tells the browser, which then says so before the trip. */
  required?: boolean;
  /** The sentence under the control: what the value means, or what it costs. */
  hint?: JSX.Element;
  /**
   * What is wrong with the value. Replaces the hint rather than joining it: two
   * lines under one field, one of them now irrelevant, is how somebody reads the
   * wrong one and corrects the wrong thing.
   */
  problem?: JSX.Element;
  /** Utility classes for the wrapper - width, mostly. */
  class?: string;
  children: JSX.Element;
}) {
  return (
    <label class={`block ${props.class ?? ""}`}>
      <span class="block text-sm mb-1 text-base-content/80">
        {props.label}
        {props.required && <span class="text-error"> *</span>}
      </span>
      {props.children}
      {props.problem ? (
        <span role="alert" class="block text-sm text-error mt-1">
          {props.problem}
        </span>
      ) : (
        props.hint && (
          <span class="block text-sm text-base-content/60 mt-1">
            {props.hint}
          </span>
        )
      )}
    </label>
  );
}
