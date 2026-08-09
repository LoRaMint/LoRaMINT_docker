import { createHmac, timingSafeEqual } from "node:crypto";
import { isValidTimeZone } from "./time-zone";

/**
 * Stateless session cookies: the signed payload *is* the session, there is no
 * server-side session store.
 *
 * The cookie value is `base64url(JSON payload).base64url(HMAC-SHA256)`, signed
 * with SESSION_SECRET. Nothing secret is stored in it - only the login name, a
 * display name and an expiry - and the signature is what makes it unforgeable.
 *
 * The trade-off is deliberate: no table, no migration and no database round trip
 * per request, but also no server-side revocation. Signing out clears the cookie
 * in that one browser; to invalidate every session at once, rotate
 * SESSION_SECRET. If per-session revocation is ever needed (an admin kicking a
 * user), this has to move to a `sessions` table.
 */
export type SessionUser = {
  /** The login name the user authenticated with. */
  username: string;
  /** Display name from the directory, or the login name when it has none. */
  displayName: string;
  /**
   * Group names from the directory, resolved at sign-in and used to decide what
   * the user may do (see services/catalog.ts).
   *
   * They are therefore only as fresh as the session: revoking a group in the
   * directory takes effect when the session expires, not immediately. Shorten
   * SESSION_TTL_HOURS if that window matters, or rotate SESSION_SECRET to end
   * every session at once.
   */
  groups: string[];
  /**
   * True for the local setup account, which authenticated against the
   * environment rather than against the directory and therefore holds no groups
   * at all. `lib/roles.ts` reads it and grants `admin` outright.
   *
   * It travels inside the signed payload, so it cannot be added to a cookie from
   * the outside - forging one would need SESSION_SECRET, and whoever has that
   * can already sign in as anybody.
   */
  setup?: boolean;
  /**
   * The user's own preferences, copied out of the `users` table at sign-in so no
   * page has to query for them.
   *
   * They ride along here rather than being looked up per request because they
   * are needed on *every* rendered page and are worth no round trip. The copy
   * going stale is harmless in a way a stale group would not be: the only writer
   * is the user themselves, on their own profile page, and that page re-issues
   * the cookie as it saves. Nobody else can change these, so there is nothing to
   * be out of date with.
   *
   * Absent means "never chose one" - for the timezone that is an instruction
   * (use the browser's), not a missing value.
   */
  timezone?: string;
  darkMode?: boolean;
};

type SessionPayload = SessionUser & {
  /** Expiry as a Unix timestamp in seconds. */
  exp: number;
};

/**
 * A verified session: the user, plus when the cookie stops being accepted. The
 * expiry is read back out because the profile page shows it - it is the one
 * thing about a stateless session a user cannot otherwise find out.
 */
export type Session = SessionUser & { expiresAt: Date };

export const SESSION_COOKIE = "loramint_session";

const encode = (bytes: Uint8Array | Buffer) =>
  Buffer.from(bytes).toString("base64url");

const sign = (data: string, secret: string) =>
  createHmac("sha256", secret).update(data).digest();

/** Signs a session for `user`, valid for `ttlHours` from now. */
export const createSession = (
  user: SessionUser,
  secret: string,
  ttlHours: number,
): string => {
  const payload: SessionPayload = {
    username: user.username,
    displayName: user.displayName,
    groups: user.groups,
    ...(user.setup ? { setup: true as const } : {}),
    // Only written when chosen, so the payload of somebody who never touched
    // their profile stays exactly as small as it was before this existed.
    ...(user.timezone ? { timezone: user.timezone } : {}),
    ...(typeof user.darkMode === "boolean" ? { darkMode: user.darkMode } : {}),
    exp: Math.floor(Date.now() / 1000) + ttlHours * 3600,
  };
  const body = encode(Buffer.from(JSON.stringify(payload), "utf8"));
  return `${body}.${encode(sign(body, secret))}`;
};

/**
 * Verifies a session cookie and returns its user, or null when the cookie is
 * malformed, the signature does not match or the session has expired.
 */
export const readSession = (
  cookie: string | undefined,
  secret: string,
): Session | null => {
  if (!cookie) return null;

  const separator = cookie.lastIndexOf(".");
  if (separator <= 0) return null;
  const body = cookie.slice(0, separator);
  const signature = Buffer.from(cookie.slice(separator + 1), "base64url");

  const expected = sign(body, secret);
  // Bail out before timingSafeEqual, which throws on a length mismatch.
  if (signature.length !== expected.length) return null;
  if (!timingSafeEqual(signature, expected)) return null;

  let payload: SessionPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (typeof payload?.username !== "string" || !payload.username) return null;
  if (typeof payload.exp !== "number") return null;
  if (payload.exp <= Math.floor(Date.now() / 1000)) return null;

  return {
    expiresAt: new Date(payload.exp * 1000),
    username: payload.username,
    displayName:
      typeof payload.displayName === "string" && payload.displayName
        ? payload.displayName
        : payload.username,
    // A cookie signed before groups existed has none; treat that as "no groups"
    // rather than letting undefined reach the authorisation checks.
    groups: Array.isArray(payload.groups)
      ? payload.groups.filter((g): g is string => typeof g === "string")
      : [],
    // Only ever true, never false: the field is what grants admin, so it is
    // read strictly and a payload without it is an ordinary session. The
    // signature is what makes trusting it safe - see SessionUser.
    ...(payload.setup === true ? { setup: true as const } : {}),
    // Checked here and not only when it was stored. The value reaches
    // Intl.DateTimeFormat, which throws a RangeError on a name it does not know,
    // and that would not produce a wrong time - it would produce a user for whom
    // no page renders at all until somebody edits the row by hand. A cookie
    // signed by an older version, or one carrying a zone the tz database has
    // since dropped, must degrade to "use the browser's" instead.
    ...(typeof payload.timezone === "string" && isValidTimeZone(payload.timezone)
      ? { timezone: payload.timezone }
      : {}),
    ...(typeof payload.darkMode === "boolean"
      ? { darkMode: payload.darkMode }
      : {}),
  };
};
