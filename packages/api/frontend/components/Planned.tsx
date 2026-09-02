import type { JSX } from "solid-js";
import PageHeading from "./PageHeading";

/**
 * A page for a feature that is announced but not built yet.
 *
 * It exists so the navigation and the access rules can be settled first: the
 * route is already gated on the right role, so when the feature lands there is
 * no second discussion about who may reach it. Everything it lists is labelled
 * as planned rather than shown as a disabled control, because a greyed-out
 * button invites clicking and then explains nothing.
 */
export default function Planned(props: {
  title: string;
  intro: JSX.Element;
  /** What the finished page will do, one entry per capability. */
  features: { label: string; description: string }[];
  /** Where the data or the limitation comes from, if that is worth saying. */
  note?: JSX.Element;
}) {
  return (
    <>
      <PageHeading title={props.title} intro={props.intro} />

      <div class="flex items-center gap-2 mb-4">
        <span class="badge badge-warning">In Planung</span>
        <span class="text-sm text-base-content/70">
          Diese Seite kündigt an, was hier entstehen soll – noch ohne Funktion.
        </span>
      </div>

      <ul class="grid gap-3 sm:grid-cols-2 max-w-3xl">
        {props.features.map((feature) => (
          <li class="rounded-box border border-base-300 p-4">
            <div class="font-semibold mb-1">{feature.label}</div>
            <p class="text-sm text-base-content/70">{feature.description}</p>
          </li>
        ))}
      </ul>

      {props.note && (
        <p class="mt-6 max-w-[65ch] text-sm text-base-content/70">{props.note}</p>
      )}
    </>
  );
}
