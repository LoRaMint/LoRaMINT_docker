import { sql } from "bun"

/**
 * The written guides: a tree of pages, and the addresses they used to have.
 *
 * Until now a guide was code. The workshop page was one row in `settings`, the
 * ESP32 guide was four hundred lines of hand-written JSX, and a new guide meant
 * a new version of the application. This table is what ends that: a page is
 * written on the running site, given a place in the tree, and published.
 *
 * **Three levels in practice, more in the data.** `parent_id` allows any depth;
 * the service caps it (`MAX_DEPTH` in lib/guide-tree.ts) because the phone menu
 * has to render the whole tree and stops being usable long before the data
 * does. The limit lives there rather than here so it can be raised without a
 * migration - and so the failure is a sentence under a field rather than a
 * constraint violation.
 *
 * `ON DELETE RESTRICT` on the parent is deliberate: deleting a topic that has
 * sub-pages should be a decision somebody makes, not a side effect of deleting
 * something above them. The alternative, CASCADE, silently takes five pages down
 * with one click on the wrong row.
 *
 * No RLS. Every guide is either published - and then public - or a draft that
 * only the editor role can reach, and both questions are answered by
 * `published` and the route guard. There is no per-group visibility here to
 * express, and inventing one would be a policy with no reader.
 */
export const up = async () => {
  await sql`
    CREATE TABLE IF NOT EXISTS guides (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      parent_id  UUID REFERENCES guides(id) ON DELETE RESTRICT,
      slug       VARCHAR(64)  NOT NULL,
      title      TEXT         NOT NULL,
      body       TEXT         NOT NULL DEFAULT '',
      -- Sparse on purpose: moving a page up or down rewrites the positions of
      -- its siblings, and the numbers themselves are never shown.
      position   INTEGER      NOT NULL DEFAULT 0,
      published  BOOLEAN      NOT NULL DEFAULT false,
      updated_by VARCHAR(100),
      updated_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
      UNIQUE (parent_id, slug)
    )
  `.simple()

  /*
   * The line above does not hold for root pages, and that is not a quirk worth
   * discovering later: in Postgres NULL is never equal to NULL, so two rows with
   * `parent_id IS NULL` and the same slug both satisfy the UNIQUE constraint.
   * Two guides would then share one address, and which of them /anleitungen/x
   * resolved to would depend on the order of a query.
   */
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS guides_root_slug
      ON guides (slug) WHERE parent_id IS NULL
  `.simple()

  /**
   * Every address a page has ever had, so renaming or moving one does not break
   * what is already printed on a worksheet or pasted into a mail.
   *
   * The path is the key rather than a column beside the id: the lookup is
   * "which page did this address point at", and it happens on every request
   * that misses the tree. Entries are tiny and accumulate as pages are renamed;
   * the management page lists them and lets them go, because a redirect nobody
   * needs is still an address nobody else can use.
   *
   * CASCADE here, unlike above: a forwarding address for a page that is gone
   * has nothing to forward to.
   */
  await sql`
    CREATE TABLE IF NOT EXISTS guide_paths (
      path     TEXT PRIMARY KEY,
      guide_id UUID NOT NULL REFERENCES guides(id) ON DELETE CASCADE
    )
  `.simple()
}
