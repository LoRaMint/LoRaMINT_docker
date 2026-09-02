import Layout from "../../components/layout/Layout";
import PageHeading from "../../components/PageHeading";
import { allResources } from "./resources";
import { PAGES } from "../../../lib";

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
  /**
   * Whether to offer the change log.
   *
   * It is the one dataset here that needs the data role rather than group
   * membership, so the card has to ask the same question its route does -
   * otherwise a group member clicks it and lands on a 404.
   */
  maySeeAudit: boolean;
}) {
  const shown = allResources.filter(
    (resource) => resource.key !== "audit" || props.maySeeAudit,
  );
  return (
    <Layout>
      <PageHeading
        title={PAGES.data.label}
        intro="Messwerte und Logeinträge durchsehen, korrigieren und entfernen – und nachvollziehen, wer was geändert hat."
      />

      <ul class="grid gap-3 sm:grid-cols-2 max-w-3xl">
        {shown.map((resource) => (
          <li class="rounded-box border border-base-300 p-4">
            <a href={resource.path} class="font-semibold link no-underline">
              {resource.title}
            </a>
            <p class="text-sm text-base-content/70 mt-1">
              {props.counts[resource.key] ?? 0} Zeilen
            </p>
            <p class="text-sm text-base-content/70 mt-2">{resource.intro}</p>
          </li>
        ))}
      </ul>
    </Layout>
  );
}
