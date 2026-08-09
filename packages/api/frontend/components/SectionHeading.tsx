/**
 * A heading for one section within a page - the level below `PageHeading`.
 *
 * It existed in five different shapes before this: `font-bold mt-6 mb-2`,
 * `text-lg font-semibold mb-3`, `font-bold mb-2` and two variants with a rule
 * underneath. All ten places do the same thing, though - they name the panel,
 * table or form directly below them - so they are one heading and not five.
 *
 * **No rule underneath**, unlike `PageHeading`. That is the one deliberate
 * change: the page title is separated from the page by a line, and repeating
 * that line for every section stacks up several full-width rules on a page whose
 * tables and form rows already carry borders of their own. The size and weight
 * are what mark the level here.
 */
export default function SectionHeading(props: { children: string }) {
  return (
    <h3 class="text-lg font-semibold mt-6 mb-2">{props.children}</h3>
  );
}
