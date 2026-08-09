/**
 * Turning an instant into something a person reads.
 *
 * Three rules hold everywhere in this application, and this module exists so
 * they are stated once:
 *
 *   1. **Stored is always UTC.** Nothing here changes that; a timezone is a
 *      question of display, never of data. The CSV export stays UTC for the same
 *      reason - a downstream analysis must not shift when somebody changes a
 *      preference.
 *
 *   2. **Shown is the effective zone**: the one from the profile, else the
 *      browser's, else UTC.
 *
 *   3. **A time that is not in the effective zone says which zone it is in.**
 *      In the ordinary case nothing is labelled, so a label means something -
 *      which is the whole value of the rule. See docs/benutzereinstellungen.md.
 *
 * Pure: no configuration, no network, no clock of its own beyond the instant it
 * is handed. Testable like lib/ttn-ids.ts.
 */

/**
 * Whether `Intl` knows this zone.
 *
 * Everything that reaches the database goes through here first. `Intl` throws a
 * RangeError on an unknown identifier, and a stored value that throws would
 * break every page the user afterwards visits - a preference must not be able to
 * do that. Asking the platform beats keeping a list: the tz database changes,
 * and a list here would rot.
 */
export const isValidTimeZone = (name: string): boolean => {
  if (!name || name.length > 64) return false;
  try {
    new Intl.DateTimeFormat("de-DE", { timeZone: name });
    return true;
  } catch {
    return false;
  }
};

/**
 * A short list of the zones somebody here plausibly wants, offered *above* the
 * full one rather than instead of it.
 *
 * This is a school project in Germany measuring things in Germany, so a picker
 * of roughly 400 entries buries the one likely answer. But a shortlist on its
 * own is worse than the long list it replaces: whoever needs a zone that is not
 * on it has no way in at all. Both, in that order, costs nothing.
 */
export const COMMON_ZONES = [
  "Europe/Berlin",
  "Europe/London",
  "Europe/Lisbon",
  "Europe/Athens",
  "Europe/Moscow",
  "UTC",
  "America/New_York",
  "America/Sao_Paulo",
  "Asia/Kolkata",
  "Asia/Tokyo",
  "Australia/Sydney",
] as const;

/**
 * Every zone the platform knows, without the ones already in `COMMON_ZONES`.
 *
 * Asked of `Intl` rather than kept as a list here, for the same reason
 * `isValidTimeZone` asks: the tz database changes - zones are added, others
 * become aliases - and a copy in this file would quietly go out of date.
 *
 * `supportedValuesOf` is ES2022. Where it is missing there is no way to
 * enumerate zones at all, so the picker falls back to the shortlist; that is a
 * smaller picker, not a broken one, and a name typed in by other means is still
 * accepted because `isValidTimeZone` decides that on its own.
 */
export const otherZones = (): string[] => {
  const supported = (
    Intl as unknown as { supportedValuesOf?: (key: string) => string[] }
  ).supportedValuesOf;
  if (typeof supported !== "function") return [];

  try {
    const common = new Set<string>(COMMON_ZONES);
    return supported("timeZone").filter((zone) => !common.has(zone));
  } catch {
    return [];
  }
};

const partsIn = (instant: Date, timeZone: string) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(instant);

  const find = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "00";

  return {
    year: find("year"),
    month: find("month"),
    day: find("day"),
    // Midnight comes back as "24" from some implementations rather than "00".
    hour: find("hour") === "24" ? "00" : find("hour"),
    minute: find("minute"),
    second: find("second"),
  };
};

/**
 * The instant as a *naive* local timestamp: `YYYY-MM-DDTHH:mm:ss.sss`, with no
 * offset and no `Z`.
 *
 * This is the trick the plots need. Plotly is handed date strings and does not
 * convert between zones - so the local time has to already be in the value.
 * Feeding it `…Z` is why the axis silently reads UTC today, an hour out in
 * winter and two in summer.
 *
 * Deliberately *not* a valid instant: it names a wall clock, and turning it back
 * into a `Date` would reinterpret it in whatever zone the reader is in. Only ever
 * hand it to something that wants to draw it.
 */
export const wallClockIn = (instant: Date | string, timeZone: string): string => {
  const date = instant instanceof Date ? instant : new Date(instant);
  const { year, month, day, hour, minute, second } = partsIn(date, timeZone);
  // Milliseconds are the same in every zone: every offset in use is a whole
  // number of minutes.
  const ms = String(date.getUTCMilliseconds()).padStart(3, "0");
  return `${year}-${month}-${day}T${hour}:${minute}:${second}.${ms}`;
};

/**
 * The zone as it should be written next to a time: `MESZ`, `UTC`, `GMT-4`.
 *
 * Taken from `Intl` rather than from the identifier, because the identifier is
 * not what a reader wants and because the right abbreviation depends on the
 * date - `Europe/Berlin` is MEZ in January and MESZ in July.
 */
export const zoneAbbreviation = (
  instant: Date | string,
  timeZone: string,
): string => {
  const date = instant instanceof Date ? instant : new Date(instant);
  const parts = new Intl.DateTimeFormat("de-DE", {
    timeZone,
    timeZoneName: "short",
  }).formatToParts(date);
  return parts.find((part) => part.type === "timeZoneName")?.value ?? timeZone;
};

/**
 * The reading format: `9.8.2026, 14:03`, optionally with the zone behind it.
 *
 * `withZone` is the caller's decision and not this function's, because only the
 * caller knows the effective zone to compare against. Rule 3 lives at the call
 * site; this one only formats.
 */
export const formatInstant = (
  instant: Date | string,
  timeZone: string,
  withZone = false,
): string => {
  const date = instant instanceof Date ? instant : new Date(instant);
  const text = date.toLocaleString("de-DE", {
    timeZone,
    dateStyle: "medium",
    timeStyle: "short",
  });
  return withZone ? `${text} ${zoneAbbreviation(date, timeZone)}` : text;
};
