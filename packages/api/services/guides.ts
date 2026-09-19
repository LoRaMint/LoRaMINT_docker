/**
 * The written guides: reading the tree, resolving an address, and every change
 * an editor makes.
 *
 * Split the way everything else in this application is. Reading runs on
 * DATABASE_URL like every other query; writing goes through DATABASE_URL_MANAGE,
 * which holds exactly the rights this needs and nothing beyond them - see
 * services/connections.ts.
 *
 * **The tree is cached, and that is not an optimisation.** `Layout()` is a
 * synchronous Solid component: it renders the whole navigation and cannot
 * await a query. The same problem produced the settings store, and this follows
 * it exactly - a module cache in lib/guide-store.ts, filled at startup, brought
 * up to date by a middleware when it has gone stale, and written into directly
 * after every change so a page published a second ago is in the menu now.
 *
 * Only the shape of the tree is cached. A guide's **body** is read per request,
 * because it is the one field that is large, the one that is only ever needed
 * by the single page showing it, and the one that would make the cache a copy
 * of the table rather than an index of it.
 */

import type { SQL } from "bun";
import { reading, writing } from "./connections";
import {
  canMove,
  normaliseSlug,
  pathOf,
  treeOf,
  type GuideTreeNode,
} from "../lib/guide-tree";
import { replaceGuides, storedGuides, type GuideEntry } from "../lib/guide-store";
import type { MutationResult } from "../types";

//====================================
// TYPES
//====================================

/** A guide as its own page shows it. */
export type Guide = GuideEntry & {
  body: string;
  updatedBy: string | null;
  updatedAt: Date;
};

type Row = {
  id: string;
  parent_id: string | null;
  slug: string;
  title: string;
  position: number;
  published: boolean;
};

const toEntry = (row: Row): GuideEntry => ({
  id: row.id,
  parentId: row.parent_id,
  slug: row.slug,
  title: row.title,
  position: row.position,
  published: row.published,
});

//====================================
// THE CACHE
//====================================

let lastLoad = 0;

/**
 * How long the cached tree may be behind the table.
 *
 * The same five seconds the settings use, for the same reasons: every other way
 * a row can change - the SQL console, `psql`, a restore, a second instance
 * behind the same database - has to become visible without a restart, and one
 * small query every few seconds only when a request comes in is what that
 * costs. Saving through the management pages refreshes it directly, so this is
 * never the path a normal edit takes.
 */
export const GUIDES_MAX_AGE_MS = 5000;

export const loadGuides = async (): Promise<void> => {
  const rows = (await reading()`
    SELECT id, parent_id, slug, title, position, published FROM guides
  `) as unknown as Row[];
  replaceGuides(rows.map(toEntry));
  lastLoad = Date.now();
};

export const refreshGuidesIfStale = async (): Promise<void> => {
  if (Date.now() - lastLoad < GUIDES_MAX_AGE_MS) return;
  try {
    await loadGuides();
  } catch (err) {
    // A hiccup on the way to the database must not turn into a failed request:
    // the tree already in memory still renders a perfectly good menu.
    console.error(
      "guides: refresh failed, keeping the tree already loaded:",
      err instanceof Error ? err.message : String(err),
    );
    lastLoad = Date.now();
  }
};

/** Re-reads the table now, for the moment after a write. */
const refreshAfterWrite = async (): Promise<void> => {
  try {
    await loadGuides();
  } catch (err) {
    // The write went through; only the copy in memory is behind. Saying so is
    // better than failing a save that succeeded - the next refresh repairs it.
    console.error(
      "guides: the change was saved, but the cached tree could not be reloaded:",
      err instanceof Error ? err.message : String(err),
    );
  }
};

//====================================
// READING THE TREE
//====================================

/**
 * The tree as the menu and the overview show it.
 *
 * Synchronous, because `Layout` is. `drafts: true` keeps the unpublished pages
 * in, which is what an editor sees; without it they are dropped, and a
 * published page under an unpublished parent goes with them - `treeOf` drops a
 * child whose parent is absent rather than lifting it to the root, so a
 * sub-page can never publish its topic by being visible.
 */
export const guideTree = (options: { drafts: boolean }): GuideTreeNode<GuideEntry>[] =>
  treeOf(
    options.drafts
      ? storedGuides()
      : storedGuides().filter((entry) => entry.published),
  );

/** Every guide, drafts included, flat - for the parent picker and the routes. */
export const allGuides = (): GuideEntry[] => storedGuides();

/** The address of a guide, without the `/anleitungen` in front: `workshop/tag-3`. */
export const guidePath = (entry: GuideEntry): string =>
  pathOf(entry, storedGuides()).join("/");

/** The guide sitting at this address, or null. Reads the cached tree only. */
export const guideAt = (path: string): GuideEntry | null =>
  storedGuides().find((entry) => guidePath(entry) === path) ?? null;

//====================================
// READING ONE GUIDE
//====================================

/** One guide with its text. The only place the body is read. */
export const guideBody = async (id: string): Promise<Guide | null> => {
  const [row] = (await reading()`
    SELECT id, parent_id, slug, title, body, position, published, updated_by, updated_at
    FROM guides WHERE id = ${id}::uuid
  `) as unknown as (Row & {
    body: string;
    updated_by: string | null;
    updated_at: Date;
  })[];
  if (!row) return null;
  return {
    ...toEntry(row),
    body: row.body,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
  };
};

/**
 * Where an address used to point, for a page that has been renamed or moved.
 *
 * Asked only when the tree has already said the address is unknown, so it costs
 * a query on a miss and nothing at all on a hit.
 */
export const forwardingFor = async (path: string): Promise<string | null> => {
  const [row] = (await reading()`
    SELECT guide_id FROM guide_paths WHERE path = ${path}
  `) as unknown as { guide_id: string }[];
  if (!row) return null;
  const entry = storedGuides().find((guide) => guide.id === row.guide_id);
  return entry ? guidePath(entry) : null;
};

/** Every address that forwards, with where it goes. For the management page. */
export const forwardings = async (): Promise<
  { path: string; to: string | null; title: string | null }[]
> => {
  const rows = (await reading()`
    SELECT path, guide_id FROM guide_paths ORDER BY path
  `) as unknown as { path: string; guide_id: string }[];
  return rows.map((row) => {
    const entry = storedGuides().find((guide) => guide.id === row.guide_id);
    return {
      path: row.path,
      to: entry ? guidePath(entry) : null,
      title: entry?.title ?? null,
    };
  });
};

//====================================
// WRITING
//====================================

/**
 * Remembers the address a page had, so it keeps working after a move.
 *
 * Called with the path as it was *before* the change, inside the same
 * transaction. `ON CONFLICT` overwrites: an address that once belonged to
 * another page and has been freed up now belongs to this one, and the newest
 * claim is the only one that can be right.
 *
 * A page moved back to where it came from would otherwise forward to itself;
 * that row is deleted below instead, because a redirect to the current address
 * is a loop.
 */
const rememberPath = async (
  tx: SQL,
  path: string,
  id: string,
): Promise<void> => {
  if (path.length === 0) return;
  await tx`
    INSERT INTO guide_paths (path, guide_id) VALUES (${path}, ${id}::uuid)
    ON CONFLICT (path) DO UPDATE SET guide_id = EXCLUDED.guide_id
  `;
};

/**
 * Creates a page, at the end of its level.
 *
 * Unpublished, always. A page that appeared in the menu the moment it was named
 * would publish an empty page at the exact moment somebody is least ready for
 * it - the draft switch exists so that writing and publishing are two
 * decisions.
 */
export const createGuide = async (
  input: { title: string; slug: string; parentId: string | null },
  by: string,
): Promise<MutationResult<{ id: string }>> => {
  const title = input.title.trim();
  if (title.length === 0) return { ok: false, error: "Ohne Titel keine Seite." };

  // An empty slug field means "take it from the title", which is what somebody
  // typing a heading expects and saves a second field from being filled in.
  const slug = normaliseSlug(input.slug.trim().length > 0 ? input.slug : title);
  if ("error" in slug) return { ok: false, error: slug.error };

  const parentId = input.parentId;
  if (parentId !== null && !storedGuides().some((entry) => entry.id === parentId)) {
    return { ok: false, error: "Diese übergeordnete Seite gibt es nicht." };
  }

  const siblings = storedGuides().filter((entry) => entry.parentId === parentId);
  if (siblings.some((entry) => entry.slug === slug.slug)) {
    return {
      ok: false,
      error: `„${slug.slug}" gibt es an dieser Stelle schon.`,
    };
  }
  const position = siblings.reduce((max, entry) => Math.max(max, entry.position), -1) + 1;

  let id: string;
  try {
    const [row] = (await writing()`
      INSERT INTO guides (parent_id, slug, title, position, updated_by)
      VALUES (${parentId}::uuid, ${slug.slug}, ${title}, ${position}, ${by})
      RETURNING id
    `) as unknown as { id: string }[];
    id = row!.id;
  } catch (err) {
    return { ok: false, error: messageOf(err) };
  }

  await refreshAfterWrite();
  return { ok: true, data: { id } };
};

/** The text and the title. The address is changed by `renameGuide`. */
export const saveGuide = async (
  id: string,
  input: { title: string; body: string; published: boolean },
  by: string,
): Promise<MutationResult<null>> => {
  const title = input.title.trim();
  if (title.length === 0) return { ok: false, error: "Ohne Titel keine Seite." };

  try {
    await writing()`
      UPDATE guides
         SET title = ${title}, body = ${input.body},
             published = ${input.published},
             updated_by = ${by}, updated_at = now()
       WHERE id = ${id}::uuid
    `;
  } catch (err) {
    return { ok: false, error: messageOf(err) };
  }

  await refreshAfterWrite();
  return { ok: true, data: null };
};

/**
 * Gives a page a different address, and remembers the old one.
 *
 * Every sub-page moves with it, so every address below changes too - and every
 * one of them is remembered, not just the page that was renamed. Forgetting the
 * children is the failure that looks like the redirect working: the topic
 * forwards, the five pages under it do not, and those are the addresses on the
 * printed worksheets.
 */
export const renameGuide = async (
  id: string,
  typed: string,
): Promise<MutationResult<null>> => {
  const entry = storedGuides().find((guide) => guide.id === id);
  if (!entry) return { ok: false, error: "Diese Seite gibt es nicht (mehr)." };

  const slug = normaliseSlug(typed);
  if ("error" in slug) return { ok: false, error: slug.error };
  if (slug.slug === entry.slug) return { ok: false, error: "Die Adresse war schon so." };

  const clash = storedGuides().some(
    (other) => other.parentId === entry.parentId && other.slug === slug.slug,
  );
  if (clash) return { ok: false, error: `„${slug.slug}" gibt es an dieser Stelle schon.` };

  const before = affectedPaths(id);
  try {
    await writing().begin(async (tx) => {
      for (const [guideId, path] of before) await rememberPath(tx as SQL, path, guideId);
      await tx`UPDATE guides SET slug = ${slug.slug} WHERE id = ${id}::uuid`;
    });
  } catch (err) {
    return { ok: false, error: messageOf(err) };
  }

  await refreshAfterWrite();
  await pruneSelfReferences();
  return { ok: true, data: null };
};

/** Hangs a page under a different parent, at the end of that level. */
export const moveGuide = async (
  id: string,
  newParentId: string | null,
): Promise<MutationResult<null>> => {
  const all = storedGuides();
  const entry = all.find((guide) => guide.id === id);
  if (!entry) return { ok: false, error: "Diese Seite gibt es nicht (mehr)." };
  if (entry.parentId === newParentId) {
    return { ok: false, error: "Die Seite liegt schon dort." };
  }

  // The refusal that cannot be a database constraint - see lib/guide-tree.ts.
  const allowed = canMove(entry, newParentId, all);
  if (!allowed.ok) return { ok: false, error: allowed.error };

  const siblings = all.filter((guide) => guide.parentId === newParentId);
  if (siblings.some((guide) => guide.slug === entry.slug)) {
    return {
      ok: false,
      error:
        `Dort gibt es schon eine Seite mit der Adresse „${entry.slug}". ` +
        "Benenne eine von beiden um.",
    };
  }
  const position = siblings.reduce((max, guide) => Math.max(max, guide.position), -1) + 1;

  const before = affectedPaths(id);
  try {
    await writing().begin(async (tx) => {
      for (const [guideId, path] of before) await rememberPath(tx as SQL, path, guideId);
      await tx`
        UPDATE guides SET parent_id = ${newParentId}::uuid, position = ${position}
         WHERE id = ${id}::uuid
      `;
    });
  } catch (err) {
    return { ok: false, error: messageOf(err) };
  }

  await refreshAfterWrite();
  await pruneSelfReferences();
  return { ok: true, data: null };
};

/**
 * Moves a page one place up or down among its siblings.
 *
 * Both rows are rewritten in one transaction. Writing only the moved one and
 * leaving the other to be sorted out later is how two pages end up sharing a
 * position, which `treeOf` then breaks by slug - an order nobody chose.
 */
export const reorderGuide = async (
  id: string,
  direction: "up" | "down",
): Promise<MutationResult<null>> => {
  const all = storedGuides();
  const entry = all.find((guide) => guide.id === id);
  if (!entry) return { ok: false, error: "Diese Seite gibt es nicht (mehr)." };

  const siblings = all
    .filter((guide) => guide.parentId === entry.parentId)
    .sort((a, b) => a.position - b.position || a.slug.localeCompare(b.slug));
  const index = siblings.findIndex((guide) => guide.id === id);
  const other = siblings[direction === "up" ? index - 1 : index + 1];
  if (!other) return { ok: false, error: "Weiter geht es in diese Richtung nicht." };

  try {
    await writing().begin(async (tx) => {
      // By index rather than by the stored numbers: two siblings may legitimately
      // carry the same position, and swapping equal numbers changes nothing.
      const here = direction === "up" ? index - 1 : index + 1;
      await tx`UPDATE guides SET position = ${here} WHERE id = ${id}::uuid`;
      await tx`UPDATE guides SET position = ${index} WHERE id = ${other.id}::uuid`;
    });
  } catch (err) {
    return { ok: false, error: messageOf(err) };
  }

  await refreshAfterWrite();
  return { ok: true, data: null };
};

/**
 * Deletes a page.
 *
 * A page with sub-pages is refused by the database - `ON DELETE RESTRICT` in
 * migration 013 - and the message says which pages are in the way rather than
 * relaying a foreign key violation. Deleting a topic should be a decision about
 * each page under it, not a side effect of one click.
 */
export const deleteGuide = async (id: string): Promise<MutationResult<null>> => {
  const children = storedGuides().filter((guide) => guide.parentId === id);
  if (children.length > 0) {
    return {
      ok: false,
      error:
        `Darunter liegen noch ${children.length} Seite(n): ` +
        `${children.map((child) => `„${child.title}"`).join(", ")}. ` +
        "Verschiebe oder lösche sie zuerst.",
    };
  }

  try {
    await writing()`DELETE FROM guides WHERE id = ${id}::uuid`;
  } catch (err) {
    return { ok: false, error: messageOf(err) };
  }

  await refreshAfterWrite();
  return { ok: true, data: null };
};

/** Drops one forwarding address, for the management page. */
export const forgetPath = async (path: string): Promise<MutationResult<null>> => {
  try {
    await writing()`DELETE FROM guide_paths WHERE path = ${path}`;
  } catch (err) {
    return { ok: false, error: messageOf(err) };
  }
  return { ok: true, data: null };
};

//====================================
// HELPERS
//====================================

/**
 * The current addresses of a page and everything under it, as `[id, path]`.
 *
 * Taken from the cache *before* the write, which is the whole point: afterwards
 * the old addresses are gone and there is nothing left to remember.
 */
const affectedPaths = (id: string): [string, string][] => {
  const all = storedGuides();
  const inSubtree = (entry: GuideEntry): boolean => {
    let current: GuideEntry | undefined = entry;
    const seen = new Set<string>();
    while (current && !seen.has(current.id)) {
      if (current.id === id) return true;
      seen.add(current.id);
      current = all.find((guide) => guide.id === current!.parentId);
    }
    return false;
  };

  return all
    .filter(inSubtree)
    .map((entry) => [entry.id, pathOf(entry, all).join("/")] as [string, string])
    .filter(([, path]) => path.length > 0);
};

/**
 * Removes forwarding entries that point at the address they sit on.
 *
 * They appear whenever a page is moved back to where it was, and a redirect
 * from an address to itself is a loop the browser gives up on rather than a
 * page that is merely wrong.
 */
const pruneSelfReferences = async (): Promise<void> => {
  const current = new Set(storedGuides().map((entry) => guidePath(entry)));
  if (current.size === 0) return;
  try {
    await writing()`
      DELETE FROM guide_paths WHERE path = ANY(${[...current]}::text[])
    `;
  } catch (err) {
    // Cosmetic: a self-referencing row would be found and skipped by the route
    // as well. Not worth failing a move that has already happened.
    console.error(
      "guides: could not tidy up the forwarding addresses:",
      err instanceof Error ? err.message : String(err),
    );
  }
};

const messageOf = (err: unknown): string => {
  const message = err instanceof Error ? err.message : String(err);
  console.error("guides:", message);
  return message.split("\n")[0]!;
};
