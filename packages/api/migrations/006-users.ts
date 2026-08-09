import { sql } from "bun"

/**
 * The first two tables in this schema that are about *people* rather than
 * measurements.
 *
 * Until now the application had no user table at all: identity was the login
 * name inside the signed session cookie and nothing else, which is what the
 * profile page still says. That works as long as nothing belongs to anybody -
 * and stops working the moment a preference has to survive a sign-out.
 *
 * The two tables answer deliberately different questions, and keeping them apart
 * is the point rather than an accident of normalisation:
 *
 *   `users` holds what a person chose for themselves. They write it, on their
 *   own profile page, and it decides how things *look*.
 *
 *   `data_groups` holds what the operator declared. It decides which data a
 *   person may later see, and no user may write it.
 *
 * Were both in one place, the page that saves a timezone would be a page that
 * can grant an authorisation - which is exactly the mistake this split exists to
 * make impossible.
 *
 * See docs/benutzereinstellungen.md.
 *
 * Additive: two new tables, nothing existing touched.
 */
export const up = async () => {
  /**
   * One row per person who has ever signed in, keyed by the login name because
   * that is the only identifier both ways in agree on - the directory and the
   * local setup account.
   *
   * Both preferences are nullable, and null is not the same as the default.
   * "Never chose a timezone" means "use the browser's", which is a different
   * instruction from "chose Europe/Berlin" - somebody travelling would notice
   * the difference. Writing a default in at insert time would throw that
   * distinction away on the very first sign-in.
   *
   * `display_name` is a copy of what the directory said at the last sign-in. It
   * is not authoritative; it is here so a name can be shown next to a row
   * without asking LDAP, and it goes stale on purpose rather than being kept in
   * step.
   *
   * There is no password column and there never will be: authentication belongs
   * to the directory or to the setup account in the environment, and a table
   * that could hold a hash would be a table somebody eventually writes one into.
   */
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      username VARCHAR(100) PRIMARY KEY,
      display_name TEXT,
      timezone TEXT,
      dark_mode BOOLEAN,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `.simple()

  /**
   * Which directory groups count as data groups - a *true subset* of what LDAP
   * knows, declared here.
   *
   * This table never says who is in a group. Membership stays in the directory,
   * arrives in the session at sign-in, and is intersected with the names below.
   * That is why there is no second place to maintain, nothing that can drift
   * apart, and no way for the application to grant somebody a membership.
   *
   * The consequence is worth stating plainly: a name in here that no directory
   * group matches is harmless - it simply never intersects with anybody. A
   * directory group missing from here is equally harmless: it grants nothing.
   * Both failure modes are silent and safe, which is the right way round.
   *
   * The three role groups (LDAP_DATA_GROUP, LDAP_MANAGEMENT_GROUP,
   * LDAP_ADMIN_GROUP) must not be entered here. They answer "what may this
   * person do", not "which data is this about", and mixing the two axes would
   * turn a data scope into a privilege. services/data-groups.ts refuses them.
   */
  await sql`
    CREATE TABLE IF NOT EXISTS data_groups (
      name VARCHAR(100) PRIMARY KEY,
      label TEXT,
      note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      created_by VARCHAR(100)
    )
  `.simple()
}
