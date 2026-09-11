/**
 * Whether a device counts as aktiv, stumm or verwaist, and what those mean.
 *
 * One place, because two pages answer the question and they must not drift: the
 * device overview, which asks TTN which devices exist, and the status board,
 * which reads the local copy of that answer (services/device-names.ts). A second
 * copy of the rule would be two pages labelling the same device differently.
 *
 * Pure and free of the database, the config and TTN, so the cases below are
 * testable without any of them.
 */

/**
 *   active   registered, and something arrived recently.
 *   silent   registered, but nothing arrived, or nothing for a long time.
 *   orphan   data under an EUI that is not registered.
 */
export type DeviceState = "active" | "silent" | "orphan";

/**
 * How long a registered device may stay quiet before it counts as stumm. A day,
 * because these are classroom sensors that report every few minutes: anything
 * that has said nothing since yesterday is worth a look, and anything shorter
 * would flag a device over a single missed uplink.
 */
export const ACTIVE_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * The state of one device.
 *
 * "Something arrived" counts a measurement and a log message alike - a board
 * still being flashed, or one whose sensor is not wired up yet, sends only
 * messages. It is talking, and calling it stumm would send somebody looking for
 * a fault that is not there. Which of the two it was is a question the pages
 * answer in their own columns, not here.
 *
 * `now` is a parameter so a whole table is classified against one instant rather
 * than against a clock that moves between rows.
 */
export const deviceState = (
  registered: boolean,
  lastSeen: Date | null,
  now: number = Date.now(),
): DeviceState => {
  if (!registered) return "orphan";
  if (lastSeen && now - lastSeen.getTime() <= ACTIVE_WINDOW_MS) return "active";
  return "silent";
};

/** The later of two timestamps, either of which may be missing. */
export const laterOf = (a: Date | null, b: Date | null): Date | null =>
  a === null || b === null ? (a ?? b) : a.getTime() >= b.getTime() ? a : b;

/**
 * The state of every device that appears in a list of rows, keyed by upper-case
 * DevEUI.
 *
 * For the status board, which holds the latest row per device and sensor rather
 * than a device list: a device's "last heard" is the newest of everything it
 * appears in, measurements and logs together, so the rows are folded instead of
 * the database being asked a second time.
 *
 * The EUIs are upper-cased on the way in, because the rows hold whatever the
 * webhook was sent while `registered` is keyed the way TTN writes them.
 */
export const deviceStates = (
  rows: readonly { deviceEui: string; lastSeen: Date | null }[],
  registered: ReadonlySet<string>,
  now: number = Date.now(),
): Record<string, DeviceState> => {
  const lastSeen = new Map<string, Date | null>();
  for (const row of rows) {
    const eui = row.deviceEui.toUpperCase();
    lastSeen.set(eui, laterOf(lastSeen.get(eui) ?? null, row.lastSeen));
  }

  const states: Record<string, DeviceState> = {};
  for (const [eui, seen] of lastSeen) {
    states[eui] = deviceState(registered.has(eui), seen, now);
  }
  return states;
};
