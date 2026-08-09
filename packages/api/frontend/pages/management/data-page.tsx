import Layout from "../../components/layout/Layout";
import PageHeading from "../../components/PageHeading";
import { allResources } from "./resources";

/**
 * The way in to the managed datasets. Management role only.
 *
 * A page rather than a redirect to the first dataset: the point is to show what
 * there is. The three sub-pages are reached from here instead of from a third
 * level in the header menu, which would be a menu nobody finds the bottom of.
 */
export default function ManageDataPage(props: {
  /** Current row count per resource key, for the cards. */
  counts: Record<string, number>;
}) {
  return (
    <Layout>
      <PageHeading
        title="Daten verwalten"
        intro="Messwerte und Logeinträge durchsehen, korrigieren und entfernen – und nachvollziehen, wer was geändert hat."
      />

      <ul class="grid gap-3 sm:grid-cols-2 max-w-3xl">
        {allResources.map((resource) => (
          <li class="rounded-box border border-base-300 p-4">
            <a href={resource.path} class="font-semibold link no-underline">
              {resource.title}
            </a>
            <p class="text-sm text-base-content/60 mt-1">
              {props.counts[resource.key] ?? 0} Zeilen
            </p>
            <p class="text-sm text-base-content/70 mt-2">{resource.intro}</p>
          </li>
        ))}
      </ul>
    </Layout>
  );
}
