import { SQL } from "bun";
import { reading } from "./connections";
import { manage } from "../config";
import { CATALOG, settingFor } from "../lib/config-catalog";
import { rememberSetting, replaceSettings, storedSetting } from "../lib/settings-store";
import type { MutationResult } from "../types";

/**
 * The settings table: read once at startup, written one value at a time.
 *
 * Split the same way everything else in this application is. Reading runs on
 * DATABASE_URL like every other query; writing goes through DATABASE_URL_MANAGE,
 * which holds exactly the rights this needs and nothing beyond them.
 *
 * Not through the *admin* connection, although the page is administrators-only:
 * `loramint_admin_sql` may read and write every table in the schema, including
 * both change logs. A page that only has to change one row should not run on a
 * connection that could rewrite all of them. Who may click and what the
 * connection may do are two different questions - see
 * docs/konfiguration-verwalten.md.
 */

//====================================
// READING
//====================================

/**
 * Loads the table into the store.
 *
 * Called before the routes are registered, because `auth.enabled` decides
 * whether they exist at all and it now answers out of this table. Unknown keys
 * are dropped rather than kept: a row left behind by an older version must not
 * quietly become configuration again if the name is ever reused.
 */
let lastLoad = 0;

/**
 * Re-reads the table when the copy in memory has gone stale.
 *
 * Saving through the configuration page updates the store directly, so this is
 * not for that. It is for every other way a value can change: the SQL console,
 * `psql`, a restore from backup, or a second instance of this server behind the
 * same database. Without it those changes would sit in the table and take effect
 * at the next restart, which is a thing nobody does on purpose.
 *
 * One small query every few seconds at most, and only when a request comes in -
 * an idle server asks nothing. The window is short enough that a change made in
 * one place is noticed in another before anybody has finished switching windows.
 */
export const SETTINGS_MAX_AGE_MS = 5000;

export const refreshSettingsIfStale = async (): Promise<void> => {
  if (Date.now() - lastLoad < SETTINGS_MAX_AGE_MS) return;
  try {
    await loadSettings();
  } catch (err) {
    // A hiccup on the way to the database must not turn into a failed request:
    // the settings already in memory are still perfectly usable.
    console.error(
      "settings: refresh failed, keeping the values already loaded:",
      err instanceof Error ? err.message : String(err),
    );
    lastLoad = Date.now();
  }
};

export const loadSettings = async (): Promise<void> => {
  const rows = (await reading()`SELECT key, value FROM settings`) as unknown as {
    key: string;
    value: string;
  }[];

  const known = rows.filter((row) => {
    const setting = settingFor(row.key);
    return setting !== undefined && setting.tier === "movable";
  });

  replaceSettings(known.map((row) => [row.key, row.value] as [string, string]));

  lastLoad = Date.now();

  const ignored = rows.length - known.length;
  if (ignored > 0) {
    console.warn(
      `settings: ${ignored} row(s) in the settings table name something this ` +
        `version does not know and were ignored.`,
    );
  }
};

/**
 * Which movable settings are still sitting in the environment, where they no
 * longer have any effect.
 *
 * The configuration page shows this: after the move, a value left in the compose
 * file is not merely redundant, it is misleading - somebody will read it and
 * believe it. Naming them is what turns a silent change into a visible one.
 */
export const strandedInEnvironment = (): string[] =>
  CATALOG.filter((setting) => {
    if (setting.tier !== "movable") return false;
    const value = Bun.env[setting.key];
    return value !== undefined && value.trim().length > 0;
  }).map((setting) => setting.key);

//====================================
// WRITING
//====================================

let client: SQL | null = null;
const writeClient = () => {
  if (!manage.databaseUrl) return null;
  if (!client) client = new SQL(manage.databaseUrl);
  return client;
};

const NOT_CONFIGURED =
  "Das Ändern von Einstellungen ist auf diesem Server nicht eingerichtet.";

/** A setting as the page shows it: the stored value plus what was noted about it. */
export type StoredSetting = {
  key: string;
  value: string;
  note: string | null;
  updatedBy: string | null;
  updatedAt: Date;
};

/** The notes and the who/when, for the configuration page. */
export const settingsDetail = async (): Promise<Map<string, StoredSetting>> => {
  const rows = (await reading()`
    SELECT key, value, note, updated_by, updated_at FROM settings
  `) as unknown as {
    key: string;
    value: string;
    note: string | null;
    updated_by: string | null;
    updated_at: Date;
  }[];

  return new Map(
    rows.map((row) => [
      row.key,
      {
        key: row.key,
        value: row.value,
        note: row.note,
        updatedBy: row.updated_by,
        updatedAt: row.updated_at,
      },
    ]),
  );
};

/**
 * Writes one setting, together with the note that explains it.
 *
 * No reason is asked for and nothing is logged. A configuration change is not
 * a correction to somebody's data, and an explanation typed while saving would
 * be buried in a list a week later; the note stays beside the value it explains
 * and can be corrected when the reasoning does. `updated_by` and `updated_at`
 * answer the rest - who touched it last, and when.
 *
 * An empty value removes the row, so "not set" stays one state rather than two -
 * the same rule config.ts applies to the environment. A note on a setting that
 * has no value has nowhere to live, and goes with it.
 *
 * `value` may be null to mean "leave the value alone and only write the note",
 * which is how a secret is annotated without being retyped.
 */
export const saveSetting = async (
  key: string,
  value: string | null,
  note: string | null,
  by: string,
): Promise<MutationResult<null>> => {
  const write = writeClient();
  if (!write) return { ok: false, error: NOT_CONFIGURED };

  const setting = settingFor(key);
  if (setting === undefined || setting.tier !== "movable") {
    return { ok: false, error: "Diese Einstellung lässt sich nicht ändern." };
  }

  const trimmedNote = note !== null && note.trim().length > 0 ? note.trim() : null;

  try {
    await write.begin(async (tx) => {
      const [existing] = (await tx`
        SELECT value FROM settings WHERE key = ${key}
      `) as unknown as { value: string }[];

      // null means "keep whatever is there" - the form sends that for a secret
      // whose field was left alone.
      const next =
        value === null
          ? (existing?.value ?? null)
          : value.trim().length > 0
            ? value
            : null;

      if (next === null) {
        await tx`DELETE FROM settings WHERE key = ${key}`;
        return;
      }

      await tx`
        INSERT INTO settings (key, value, note, updated_by)
        VALUES (${key}, ${next}, ${trimmedNote}, ${by})
        ON CONFLICT (key) DO UPDATE
          SET value = EXCLUDED.value,
              note = EXCLUDED.note,
              updated_by = EXCLUDED.updated_by,
              updated_at = now()
      `;
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`settings: saving ${key} failed:`, message);
    return { ok: false, error: message.split("\n")[0]! };
  }

  rememberSetting(
    key,
    value === null ? (storedSetting(key) ?? null) : value.trim() || null,
  );
  return { ok: true, data: null };
};
