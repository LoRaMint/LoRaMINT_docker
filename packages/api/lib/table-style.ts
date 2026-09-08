/**
 * The classes a table in this application is built from.
 *
 * They live here rather than in the component because there are now two places
 * that produce a table and only one of them can use a component:
 * `frontend/components/TableFrame.tsx` returns JSX, while `lib/markdown.ts`
 * produces HTML as a string and cannot call a Solid component at all. Written
 * out twice they would drift, and the first symptom would be a typed table on
 * the workshop page that looks almost - but not quite - like every other table
 * on the site.
 *
 * In `lib` and not in `frontend` because the dependency has to point that way:
 * the frontend may import from lib, the reverse would pull JSX into a module
 * that renders strings. `global.css` scans this directory for exactly that
 * reason.
 */

/** The bordered, side-scrollable box a table sits in. */
export const TABLE_FRAME_CLASS = "overflow-x-auto rounded-box border border-base-300";

/**
 * The table itself: dense, striped, with a header that stays put and a hover
 * highlight at 8 % of the brand colour.
 */
export const TABLE_CLASS =
  "table table-sm table-zebra table-pin-rows [&_tbody_tr:hover]:bg-primary/[.08]";
