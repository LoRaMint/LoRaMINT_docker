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
}>();

/** The signed-in user for the request being handled, or null when anonymous. */
export const currentUser = (): Session | null =>
  requestContext.getStore()?.user ?? null;
