/**
 * The guide tree held for the process to look at, so rendering can read it
 * without a query.
 *
 * The same arrangement as lib/settings-store.ts and for the same reason:
 * `Layout()` is a synchronous Solid component and **cannot ask the database**.
 * The navigation is built from this tree on every page, and a `readdir`-shaped
 * excuse does not exist here - a menu that needed a query would put one on the
 * quietest path in the application.
 *
 * Deliberately the dumbest thing that can work: an array, and nothing else. It
 * imports only the tree type, so nothing can close a cycle through it.
 *
 * Filling it is somebody else's job: services/guides.ts loads the table into it
 * at startup, refreshes it when it has gone stale, and writes back into it
 * after every change - so a page that was just published appears in the menu on
 * the next request rather than after a restart.
 *
 * Before it is filled it is simply empty, and every guide reads as absent.
 */

import type { GuideRow } from "./guide-tree";

/** What the menu and the routes need. The body is never held here. */
export type GuideEntry = GuideRow & {
  title: string;
  published: boolean;
};

let entries: GuideEntry[] = [];

/** Every guide, drafts included. Callers filter; the store does not decide. */
export const storedGuides = (): GuideEntry[] => entries;

/** Replaces everything, for the load at startup and after a change. */
export const replaceGuides = (next: readonly GuideEntry[]): void => {
  entries = [...next];
};

/** Only for tests, which need a known starting point. */
export const resetGuides = (): void => {
  entries = [];
};
