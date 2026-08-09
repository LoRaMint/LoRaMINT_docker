import { reading, writing } from "./connections";
import { isValidTimeZone } from "../lib/time-zone";

/**
 * The one row per person, and the two preferences on it.
 *
 * Split by intent like everything else here: the sign-in writes through
 * `writing()` because it writes, the profile page reads through `reading()`
 * because it reads. Neither goes near the schema owner.
 *
 * What this module deliberately cannot do is grant anything. It writes a
 * timezone and a theme, both of which decide how a page looks and nothing else.
 * Group membership is not stored here and is not writable from the application
 * at all - see services/data-groups.ts and docs/benutzereinstellungen.md for why
 * the two are kept apart.
 */

//====================================
// TYPES
//====================================

export type Preferences = {
  /**
   * An IANA zone name, or null for "never chose one".
   *
   * Null is an instruction, not an absence: it means "use the browser's zone",
   * which is a different answer from any particular zone. Somebody who travels
   * would notice.
   */
  timezone: string | null;
  /** Null means "never chose", which the layout treats as light. */
  darkMode: boolean | null;
};

export type UserRecord = Preferences & {
  username: string;
  displayName: string | null;
  createdAt: Date;
  lastSeenAt: Date;
};

const NONE: Preferences = { timezone: null, darkMode: null };

//====================================
// SIGN-IN
//====================================

/**
 * Records that somebody signed in, and hands back what they had chosen before.
 *
 * One statement, because the sign-in path should cost one round trip: the upsert
 * refreshes the display name and the timestamp and returns the row, whether it
 * was just created or already there.
 *
 * `ON CONFLICT` updates the display name and `last_seen_at` and **nothing else**.
 * Overwriting the preferences with the values being inserted - which are null,
 * since a sign-in knows no preferences - would reset everybody's timezone every
 * time they logged in. That is the kind of bug that looks like a browser problem
 * for a week.
 *
 * A failure here is swallowed on purpose. Someone whose password the directory
 * accepted has authenticated; refusing them a session because a preference table
 * was briefly unreachable would turn a cosmetic feature into an outage. They get
 * in with defaults, and the next sign-in tries again.
 */
export const rememberSignIn = async (
  username: string,
  displayName: string,
): Promise<Preferences> => {
  try {
    const rows = await writing()`
      INSERT INTO users (username, display_name)
      VALUES (${username}, ${displayName})
      ON CONFLICT (username) DO UPDATE
        SET display_name = EXCLUDED.display_name,
            last_seen_at = now()
      RETURNING timezone, dark_mode
    `;
    const row = rows[0];
    if (!row) return NONE;
    return {
      timezone: typeof row.timezone === "string" ? row.timezone : null,
      darkMode: typeof row.dark_mode === "boolean" ? row.dark_mode : null,
    };
  } catch (err) {
    console.error("users: could not record the sign-in for", username, err);
    return NONE;
  }
};

//====================================
// READING
//====================================

/** The whole row, for the profile page. Null when the user has never signed in. */
export const userRecord = async (
  username: string,
): Promise<UserRecord | null> => {
  const rows = await reading()`
    SELECT username, display_name, timezone, dark_mode, created_at, last_seen_at
    FROM users
    WHERE username = ${username}
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    username: row.username,
    displayName: row.display_name ?? null,
    timezone: typeof row.timezone === "string" ? row.timezone : null,
    darkMode: typeof row.dark_mode === "boolean" ? row.dark_mode : null,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
  };
};

//====================================
// WRITING
//====================================

export type SaveOutcome =
  | { ok: true; preferences: Preferences }
  | { ok: false; error: string };

/**
 * Saves what somebody chose on their own profile page.
 *
 * The timezone is checked against `Intl` before it is stored rather than when it
 * is used. A name Intl does not know throws a RangeError on every format call -
 * so an unchecked value would not produce a wrong time, it would produce a user
 * who cannot open any page until an administrator edits the row by hand.
 *
 * An empty string is not an error but the way back: it clears the choice and
 * restores "use the browser's zone", which is otherwise unreachable once
 * somebody has picked something.
 *
 * The row is created if it is missing. It normally exists by now - the sign-in
 * makes it - but not if that write was the one that failed, and the profile page
 * should still work in that case.
 */
export const savePreferences = async (
  username: string,
  input: { timezone: string | null; darkMode: boolean },
): Promise<SaveOutcome> => {
  const timezone =
    input.timezone && input.timezone.trim().length > 0
      ? input.timezone.trim()
      : null;

  if (timezone !== null && !isValidTimeZone(timezone)) {
    return { ok: false, error: `Unbekannte Zeitzone: ${timezone}` };
  }

  try {
    await writing()`
      INSERT INTO users (username, timezone, dark_mode)
      VALUES (${username}, ${timezone}, ${input.darkMode})
      ON CONFLICT (username) DO UPDATE
        SET timezone = EXCLUDED.timezone,
            dark_mode = EXCLUDED.dark_mode
    `;
    return { ok: true, preferences: { timezone, darkMode: input.darkMode } };
  } catch (err) {
    console.error("users: could not save preferences for", username, err);
    return { ok: false, error: "Die Einstellungen konnten nicht gespeichert werden." };
  }
};
