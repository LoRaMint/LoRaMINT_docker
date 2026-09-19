/**
 * The shape of the guide tree, as pure functions.
 *
 * Separate from services/guides.ts, which does the querying, for the same
 * reason lib/ttn-ids.ts is separate from services/ttn.ts: these are the parts
 * that must be right and are cheapest to be sure about. No database, no
 * configuration, no clock - a test can throw a malformed tree at `canMove` in a
 * millisecond, and the one case that matters is exactly the one nobody
 * reproduces by hand.
 *
 * **The case that matters is hanging a branch on itself.** Move a topic into
 * one of its own sub-pages and the parent chain becomes a ring: `pathOf` never
 * terminates, the menu renders until the stack does, and the row that caused it
 * looks perfectly ordinary in the table. It cannot be expressed as a database
 * constraint - a foreign key knows about one edge, not about a chain - so it has
 * to be refused here, before the write.
 */

import { foldUmlauts } from "./umlauts";

/**
 * How deep the tree may go, counting the root page as level one.
 *
 * The data allows any depth; this does not. The whole tree is rendered into the
 * header menu, and on a phone that is one `<ul>` inside another inside another -
 * a fifth level indents past the width of the screen before it says anything.
 *
 * The limit lives here rather than in the rendering on purpose. Discovered at
 * render time it is a page that looks broken; decided here it is a sentence
 * under the field saying the move would be one level too deep.
 */
export const MAX_DEPTH = 5;

/** The fields the tree is built from. A row carries more; none of it is needed. */
export type GuideRow = {
  id: string;
  parentId: string | null;
  slug: string;
  position: number;
};

/** One node with its children hung underneath, sorted. */
export type GuideTreeNode<T extends GuideRow> = T & {
  children: GuideTreeNode<T>[];
};

//====================================
// SLUGS
//====================================

/**
 * The shape a slug has to end up in, checked rather than assumed.
 *
 * Same idea as `DEVICE_ID` in lib/ttn-ids.ts: lower case letters, digits and
 * single dashes, starting and ending on a letter or digit. Three characters at
 * the least, because a one-letter address says nothing on a printed worksheet,
 * and sixty-four at the most, which is what the column holds.
 */
const SLUG = /^[a-z0-9](?:-?[a-z0-9]){2,63}$/;

/**
 * A heading somebody typed, reduced to the segment it becomes in the address.
 *
 * The steps are the same ones `sanitizeFileName` takes and in the same order,
 * and the order is the substance:
 *
 *  1. Normalise and drop control characters, so a title cannot carry a newline
 *     into a log line.
 *  2. Umlauts become digraphs *before* the generic replacement, or „Übung" turns
 *     into `-bung` instead of `uebung`.
 *  3. Lowercase throughout, because the address is compared as it is stored and
 *     `Workshop` and `workshop` must not be two pages.
 *  4. What is left is reduced to the permitted characters, runs of dashes are
 *     folded, and the ends are trimmed.
 *
 * Returns a sentence rather than a fallback whenever the answer would be a
 * guess. A page silently filed under an address nobody chose is worse than a
 * message saying why it was not - the address is what gets printed and linked.
 */
export const normaliseSlug = (raw: string): { slug: string } | { error: string } => {
  const slug = foldUmlauts(raw.normalize("NFC"))
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    // Trimmed twice: the cut above can leave a dash on the end.
    .replace(/-+$/, "");

  if (slug.length === 0) {
    return { error: "Aus diesem Titel bleibt keine Adresse übrig." };
  }
  if (slug.length < 3) {
    return {
      error:
        `Die Adresse „${slug}" ist zu kurz – drei Zeichen müssen es sein, ` +
        "damit sie auf einem Blatt Papier noch etwas sagt.",
    };
  }
  // The guarantee, checked rather than assumed: everything the steps above
  // produce has to satisfy the shape the routes resolve against.
  if (!SLUG.test(slug)) {
    return { error: "Aus diesem Titel bleibt keine brauchbare Adresse übrig." };
  }

  return { slug };
};

//====================================
// WALKING THE TREE
//====================================

/**
 * The slugs from the root down to this node: `["workshop", "tag-3"]`.
 *
 * Returns an empty array when the chain leads nowhere - a missing parent, or a
 * ring that `canMove` should have refused. Walking it with a visited set rather
 * than trusting the data is not paranoia about this application's own writes:
 * the SQL console can write these rows, and a page that renders until the stack
 * runs out is a worse answer than a page that is not found.
 */
export const pathOf = <T extends GuideRow>(
  node: T,
  all: readonly T[],
): string[] => {
  const byId = new Map(all.map((row) => [row.id, row]));
  const segments: string[] = [];
  const seen = new Set<string>();

  let current: T | undefined = node;
  while (current) {
    if (seen.has(current.id)) return [];
    seen.add(current.id);
    segments.unshift(current.slug);
    if (current.parentId === null) return segments;
    current = byId.get(current.parentId);
  }

  // The chain ended at a parent that is not in the list. That is not a path.
  return [];
};

/** How far down this node sits, counting itself. A root page is 1. */
export const depthOf = <T extends GuideRow>(node: T, all: readonly T[]): number =>
  pathOf(node, all).length;

/** Every node below this one, at any depth. Excludes the node itself. */
export const descendantsOf = <T extends GuideRow>(
  node: T,
  all: readonly T[],
): T[] => {
  const found: T[] = [];
  let frontier = [node.id];
  // Bounded by the number of rows: a ring cannot make this run forever, because
  // each round only looks at children of ids it has not expanded yet.
  const expanded = new Set<string>();

  while (frontier.length > 0) {
    const next: string[] = [];
    for (const id of frontier) {
      if (expanded.has(id)) continue;
      expanded.add(id);
      for (const row of all) {
        if (row.parentId === id) {
          found.push(row);
          next.push(row.id);
        }
      }
    }
    frontier = next;
  }
  return found;
};

/** The deepest level inside this subtree, counting the node itself as 1. */
const heightOf = <T extends GuideRow>(node: T, all: readonly T[]): number => {
  const base = depthOf(node, all);
  if (base === 0) return 1;
  return descendantsOf(node, all).reduce(
    (deepest, row) => Math.max(deepest, depthOf(row, all) - base + 1),
    1,
  );
};

/**
 * Whether this page may be hung under that parent.
 *
 * Two refusals, and they fail for different reasons:
 *
 *   **Into its own subtree** - the parent chain would close into a ring. This is
 *   the one that cannot be a database constraint and the one that breaks
 *   everything downstream of it at once.
 *
 *   **Too deep** - the moved page brings its own children along, so what counts
 *   is not where the page lands but where its deepest descendant does.
 *
 * `null` as the new parent means "make it a root page", which is always allowed:
 * it can neither close a ring nor add depth.
 */
export const canMove = <T extends GuideRow>(
  node: T,
  newParentId: string | null,
  all: readonly T[],
): { ok: true } | { ok: false; error: string } => {
  if (newParentId === null) return { ok: true };

  if (newParentId === node.id) {
    return { ok: false, error: "Eine Seite kann nicht unter sich selbst liegen." };
  }

  const parent = all.find((row) => row.id === newParentId);
  if (!parent) return { ok: false, error: "Diese Seite gibt es nicht (mehr)." };

  if (descendantsOf(node, all).some((row) => row.id === newParentId)) {
    return {
      ok: false,
      error:
        "Das würde einen Ring ergeben: die gewählte Seite liegt bereits " +
        "unterhalb der verschobenen.",
    };
  }

  const wouldBe = depthOf(parent, all) + heightOf(node, all);
  if (wouldBe > MAX_DEPTH) {
    return {
      ok: false,
      error:
        `Zu tief: dort läge die unterste Seite auf Ebene ${wouldBe}, erlaubt ` +
        `sind ${MAX_DEPTH}. Tiefer wird das Menü auf einem Handy unbenutzbar.`,
    };
  }

  return { ok: true };
};

//====================================
// BUILDING THE TREE
//====================================

/**
 * Rows into a nested structure, each level sorted by `position`.
 *
 * The slug is the tiebreak, so two siblings that were given the same position -
 * by a restore, or by a hand-written UPDATE - still come out in a fixed order
 * rather than in whatever order the query happened to return.
 *
 * Rows whose parent is not in the list are dropped rather than lifted to the
 * root. Their parent is either a draft the caller filtered out, in which case
 * showing the child would publish a page through its sub-page, or it does not
 * exist, in which case the row has no address at all.
 */
export const treeOf = <T extends GuideRow>(
  rows: readonly T[],
): GuideTreeNode<T>[] => {
  const nodes = new Map<string, GuideTreeNode<T>>(
    rows.map((row) => [row.id, { ...row, children: [] }]),
  );

  const roots: GuideTreeNode<T>[] = [];
  for (const node of nodes.values()) {
    if (node.parentId === null) {
      roots.push(node);
      continue;
    }
    // Not `?.push` - a child whose parent is absent is deliberately dropped,
    // and silently doing nothing is exactly what should happen.
    nodes.get(node.parentId)?.children.push(node);
  }

  const order = (a: GuideTreeNode<T>, b: GuideTreeNode<T>) =>
    a.position - b.position || a.slug.localeCompare(b.slug);

  const sortDeep = (level: GuideTreeNode<T>[]) => {
    level.sort(order);
    for (const node of level) sortDeep(node.children);
  };
  sortDeep(roots);

  return roots;
};

/**
 * The tree flattened back into a list, in the order it is shown, with the depth
 * of each row alongside.
 *
 * The management table needs exactly this: one row per page, indented by depth,
 * in the order the menu will show them. Building it from the tree rather than
 * sorting the rows again is what keeps the two views from disagreeing about
 * where a page sits.
 */
export const flatten = <T extends GuideRow>(
  tree: readonly GuideTreeNode<T>[],
  depth = 1,
): { node: GuideTreeNode<T>; depth: number }[] =>
  tree.flatMap((node) => [
    { node, depth },
    ...flatten(node.children, depth + 1),
  ]);
