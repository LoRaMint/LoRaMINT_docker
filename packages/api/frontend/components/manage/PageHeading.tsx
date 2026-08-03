import type { JSX } from "solid-js";

/**
 * The heading every page in this application uses, plus the way back out of a
 * sub-page. It existed as the same eight copied lines in eight files before.
 */
export default function PageHeading(props: {
  title: string;
  /** One sentence on what the page is for. */
  intro?: JSX.Element;
  /** Where this page sits, so a sub-page is never a dead end. */
  back?: { href: string; label: string };
}) {
  return (
    <>
      {props.back && (
        <a href={props.back.href} class="link text-sm text-base-content/70 mt-8 inline-block">
          ← {props.back.label}
        </a>
      )}
      <h2
        class={`text-xl font-bold border-b border-base-300 pb-2 mb-4 ${
          props.back ? "mt-2" : "mt-8"
        }`}
      >
        {props.title}
      </h2>
      {props.intro && (
        <p class="mb-4 max-w-3xl text-base-content/80">{props.intro}</p>
      )}
    </>
  );
}
