/**
 * Which filter values are still worth offering, given what is already chosen.
 *
 * The filter lists on /plots came from five independent `SELECT DISTINCT`
 * queries, so they formed a cross product: a sensor and a measurand could both
 * be offered although no row ever carried the two together. Ticking such a pair
 * plotted nothing, and the page said nothing about why - the same class of
 * mistake the board's `knownTriples` was introduced to end.
 *
 * The fix is to carry the *combinations* that actually occurred and to derive
 * every list from them. This module is that derivation, and nothing else.
 *
 * **The rule that keeps it from locking anybody out:** a facet is never
 * narrowed by its own selection, only by the others. Within a multi-valued
 * facet the chosen values are OR-ed, across facets they are AND-ed - ordinary
 * faceted search. From that follows the property that matters: anything offered
 * fits the rest of the selection, and unticking always widens the list again,
 * so no sequence of clicks can reach a dead end.
 *
 * Pure: no DOM, no configuration, no network, and deliberately no import from
 * types.ts - that would pull zod into a browser bundle. Testable like
 * lib/time-zone.ts.
 */

/**
 * The `group_name` value that means "no group at all" rather than a group of
 * that name.
 *
 * Lives here rather than in types.ts because both the server and the browser
 * islands need it, and the islands cannot import a module that pulls in zod.
 * types.ts re-exports it, so there is still one definition.
 */
export const NO_GROUP = "__none__";

/** One (measurand, sensor, location, group, public) tuple that really occurred. */
export type Combination = {
  measurand: string;
  sensor: string;
  location: string;
  /** NO_GROUP for the rows that belong to none - NULL cannot be named otherwise. */
  group: string;
  isPublic: boolean;
};

/**
 * What the person has chosen so far. The two arrays are the checkbox groups;
 * the three strings are the selects, where "" means "do not narrow".
 *
 * `isPublic` is a string rather than a boolean because that is what a select
 * hands over: "", "true" or "false" - and "" has to stay distinguishable from
 * "false".
 */
export type Selection = {
  measurands: string[];
  sensors: string[];
  location: string;
  group: string;
  isPublic: string;
};

export type FacetOptions = {
  measurands: string[];
  sensors: string[];
  locations: string[];
  groups: string[];
};

const distinct = (values: string[]): string[] => [...new Set(values)].sort();

/** True when `row` satisfies every part of the selection except `except`. */
const matches = (row: Combination, selection: Selection, except: keyof Selection): boolean => {
  if (except !== "measurands" && selection.measurands.length > 0) {
    if (!selection.measurands.includes(row.measurand)) return false;
  }
  if (except !== "sensors" && selection.sensors.length > 0) {
    if (!selection.sensors.includes(row.sensor)) return false;
  }
  if (except !== "location" && selection.location !== "") {
    if (row.location !== selection.location) return false;
  }
  if (except !== "group" && selection.group !== "") {
    if (row.group !== selection.group) return false;
  }
  if (except !== "isPublic" && selection.isPublic !== "") {
    if (row.isPublic !== (selection.isPublic === "true")) return false;
  }
  return true;
};

/**
 * The values each facet may still offer.
 *
 * Every list is built from the rows that satisfy all the *other* facets, which
 * is what stops a choice from removing the very option it was made from.
 *
 * The group list holds names only. The "ohne Gruppe" sentinel is a choice the
 * caller adds, the same way it does for the other pages - it is not data, and
 * a row without a group carries NO_GROUP here precisely so it can be matched
 * against.
 */
export const facetOptions = (rows: Combination[], selection: Selection): FacetOptions => ({
  measurands: distinct(
    rows.filter((row) => matches(row, selection, "measurands")).map((row) => row.measurand),
  ),
  sensors: distinct(
    rows.filter((row) => matches(row, selection, "sensors")).map((row) => row.sensor),
  ),
  locations: distinct(
    rows.filter((row) => matches(row, selection, "location")).map((row) => row.location),
  ),
  groups: distinct(
    rows
      .filter((row) => matches(row, selection, "group"))
      .map((row) => row.group)
      .filter((group) => group !== NO_GROUP),
  ),
});
