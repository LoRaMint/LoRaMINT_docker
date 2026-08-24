import { AsyncLocalStorage } from "node:async_hooks";
import type { Session } from "./session";
import type { Scope } from "../services/connections";
import type { Grant } from "./api-tokens";

/**
 * Request-scoped state, so the shared Layout can render the signed-in user
 * without every page having to accept and forward a `user` prop.
 *
 * The session middleware in index.ts opens the store for the whole request;
 * AsyncLocalStorage keeps it in place across awaits, which the async page
 * handlers (for example /status) rely on.
 */
export const requestContext = new AsyncLocalStorage<{
  user: Session | null;
  /**
   * Resolved once per request from the session and the theme cookie, because
   * the HTML shell in config/ssr.ts needs it and the shell is not a page - it
   * takes no props and cannot be handed anything.
   *
   * Both are read here rather than at the point of use so that anonymous
   * visitors are covered by the same path as signed-in ones: they have no
   * session but they do have cookies, and most pages here are public.
   */
  darkMode?: boolean;
  /**
   * The timezone from the user's profile, or null for "use the browser's".
   *
   * The shell writes it into an attribute so the script that localises times
   * knows whether it may drop the zone suffix - see lib/time-zone.ts for the
   * rule.
   */
  timezone?: string | null;
  /**
   * Which measurements this request may see, as the row-level policies want it.
   *
   * Worked out once by the middleware in index.ts and read by every service that
   * touches `measurements` or `log_entries`, so no call site has to remember to
   * pass it along - the same arrangement `currentUser` already uses.
   *
   * The raw directory groups are handed on without first intersecting them with
   * the declared data groups. That is safe rather than sloppy: `group_name`
   * carries a foreign key to `data_groups`, so a directory group nobody declared
   * cannot match any row. Doing the intersection here would cost a query on
   * every request to reach the same answer.
   */
  scope?: Scope;
  /**
   * The permissions of the API token this request carries, when it carries one.
   *
   * `scope` alone only says which *groups* the request may reach; a grant may
   * narrow further, to one device or one measurand. Both are needed: the scope
   * is what the row-level policies read, the grants are what the services apply
   * on top - see services/measurement.ts's `filterClause`.
   *
   * Absent for every ordinary request, and then nothing narrows.
   */
  tokenGrants?: readonly Grant[];
}>();

/** The signed-in user for the request being handled, or null when anonymous. */
export const currentUser = (): Session | null =>
  requestContext.getStore()?.user ?? null;

/** Whether this request renders dark. False outside a request, which is right. */
export const currentDarkMode = (): boolean =>
  requestContext.getStore()?.darkMode === true;

/**
 * The timezone every time on this page should be shown in, or null when the
 * browser's is to be used.
 */
export const currentTimeZone = (): string | null =>
  requestContext.getStore()?.timezone ?? null;

/**
 * What this request may see. Defaults to nothing beyond the public rows, which
 * is the right answer outside a request and for anonymous visitors alike.
 */
export const currentScope = (): Scope => requestContext.getStore()?.scope ?? [];

/**
 * The token grants for this request, or null when it is not a token request.
 *
 * Null and "an empty list" mean different things and must stay apart: null is
 * an ordinary request, which nothing narrows; an empty list is a token with no
 * permission at all, which may see nothing beyond the public rows.
 */
export const currentTokenGrants = (): readonly Grant[] | null =>
  requestContext.getStore()?.tokenGrants ?? null;
