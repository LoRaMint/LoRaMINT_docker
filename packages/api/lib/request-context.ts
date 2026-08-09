import { AsyncLocalStorage } from "node:async_hooks";
import type { Session } from "./session";

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
