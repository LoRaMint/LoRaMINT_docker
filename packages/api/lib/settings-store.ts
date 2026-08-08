/**
 * The settings read out of the database, held for the process to look at.
 *
 * Deliberately the dumbest thing that can work: a map, and nothing else. It
 * imports nothing - not the config, not the database, not even a type from
 * elsewhere - because `config.ts` reads from it, and `config.ts` is imported by
 * everything. Anything with a dependency here would close a cycle.
 *
 * Filling it is somebody else's job: `services/settings.ts` loads the table into
 * it once at startup and writes back into it after a change, so a value that was
 * just saved is in effect for the next request without a restart.
 *
 * Before it is filled it is simply empty, and every setting reads as absent.
 * That is why the load has to happen before the routes are registered - see the
 * top of index.ts.
 */

const store = new Map<string, string>();

/** True once the table has been read, so callers can tell empty from unread. */
let loaded = false;

/**
 * The stored value, or null when there is none.
 *
 * Empty counts as absent, the same rule `config.ts` applies to an environment
 * variable - so a setting cleared to nothing behaves like one that was never
 * set, rather than like an empty string nobody meant.
 */
export const storedSetting = (key: string): string | null => {
  const value = store.get(key);
  return value !== undefined && value.trim().length > 0 ? value : null;
};

/** Replaces everything, for the load at startup. */
export const replaceSettings = (entries: Iterable<[string, string]>): void => {
  store.clear();
  for (const [key, value] of entries) store.set(key, value);
  loaded = true;
};

/** Updates one entry after it was written, so the change takes effect at once. */
export const rememberSetting = (key: string, value: string | null): void => {
  if (value === null) store.delete(key);
  else store.set(key, value);
};

export const settingsLoaded = (): boolean => loaded;

/** Everything currently held, for the configuration page. */
export const allSettings = (): Map<string, string> => new Map(store);

/** Only for tests, which need a known starting point. */
export const resetSettings = (): void => {
  store.clear();
  loaded = false;
};
