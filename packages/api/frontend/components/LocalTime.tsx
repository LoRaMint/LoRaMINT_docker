import { currentTimeZone } from "../../lib/request-context";
import { formatInstant } from "../../lib/time-zone";

/**
 * A point in time, shown the one way this application shows time.
 *
 * The rule it implements, from docs/benutzereinstellungen.md:
 *
 *   Shown is the effective zone - the profile's, else the browser's, else UTC.
 *   A time that is **not** in the effective zone says which zone it is in.
 *
 * So in the ordinary case nothing is labelled, and a label therefore means
 * something. That is the whole point: a suffix on every timestamp is furniture
 * nobody reads, and a suffix on none of them is how the plots came to be two
 * hours out without anyone noticing.
 *
 * Two cases, and the split is forced by the server not knowing the browser:
 *
 *   **The user chose a zone.** The server renders in it, correctly and finally,
 *   with no suffix. Nothing runs on the client.
 *
 *   **They did not.** The server cannot know the browser's zone at render time,
 *   so it writes UTC *and says so*. The script in the Layout replaces the text
 *   with the browser's zone and drops the suffix. Without JavaScript the page
 *   keeps a correct, honestly labelled UTC time rather than a wrong unlabelled
 *   local one - which is the same trade this application makes everywhere else.
 *
 * `datetime` always holds the exact UTC instant. That is what the script reads,
 * and what screen readers announce.
 */
/**
 * The same text, for the places that need a string rather than an element -
 * a `title` attribute, mostly.
 *
 * Those cannot be rewritten on the client, so a visitor with no chosen zone
 * reads UTC in the tooltip. That is the honest outcome and not a gap: the
 * suffix says so, and the visible time beside it is already local.
 */
export const localTimeText = (at: Date | string): string => {
  const zone = currentTimeZone();
  return formatInstant(at, zone ?? "UTC", zone === null);
};

export default function LocalTime(props: { at: Date | string }) {
  const date = props.at instanceof Date ? props.at : new Date(props.at);
  const zone = currentTimeZone();
  return (
    <time datetime={date.toISOString()} data-local>
      {formatInstant(date, zone ?? "UTC", zone === null)}
    </time>
  );
}
