import { createHash, randomBytes } from "node:crypto";

/**
 * The rules an API token obeys, as pure functions.
 *
 * A token is a **name, nothing more**. It carries no rights of its own; what it
 * may read stands in a separate list of grants that data groups issue and
 * withdraw. That separation is the whole point: withdrawing a grant leaves the
 * token untouched, so no script has to be edited and no value re-issued.
 *
 * This module holds the parts of that model which need no database: how a value
 * is minted and hashed, how long it may live, and what a grant's filter may say.
 * The storage and the SQL live in services/api-tokens.ts.
 *
 * Pure: no configuration, no network, no clock of its own beyond the instant it
 * is handed. Testable like lib/facets.ts and lib/time-zone.ts.
 */

/** Marks the value as ours in a log or a configuration file. */
export const TOKEN_PREFIX = "lm_";

/** The longest a token may ever be valid, from the moment it is set. */
export const MAX_DAYS = 360;

const DAY_MS = 24 * 60 * 60 * 1000;

//====================================
// THE VALUE
//====================================

/**
 * A fresh token value: 32 random bytes, URL-safe, behind the prefix.
 *
 * 256 bits from the system's CSPRNG. That is what lets the hash below be a
 * plain SHA-256 rather than a password hash - see `hashToken`.
 */
export const generateToken = (): string =>
  TOKEN_PREFIX + randomBytes(32).toString("base64url");

/**
 * The value as it is stored: SHA-256, hex.
 *
 * **Deliberately not argon2**, unlike the setup account's password
 * (scripts/hash-password.ts). A password hash is slow on purpose because a
 * password is guessable; this value is 256 bits of randomness, so there is
 * nothing to guess, and the hash has to be computed on *every* API request.
 * Slowness here would be a cost with no matching benefit.
 *
 * Being a fixed, cheap digest is also what allows a unique index on the column
 * and therefore a single indexed lookup per request, instead of comparing
 * against every stored token in turn.
 */
export const hashToken = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

//====================================
// LIFETIME
//====================================

/** The latest expiry that may be set right now: MAX_DAYS from `now`. */
export const maxExpiry = (now: Date): Date => new Date(now.getTime() + MAX_DAYS * DAY_MS);

/**
 * The expiry for a request of `days`, capped at MAX_DAYS from `now`.
 *
 * The cap is applied on every extension, not only at creation. That is what
 * keeps the ceiling real while still letting a working integration carry on:
 * renewing always measures from today, never from the old expiry.
 */
export const expiryFor = (days: number, now: Date): Date => {
  const wanted = Math.floor(days);
  if (!Number.isFinite(wanted) || wanted < 1) return new Date(now.getTime() + DAY_MS);
  return new Date(now.getTime() + Math.min(wanted, MAX_DAYS) * DAY_MS);
};

/** Expired means "at or after the instant", so a token is not valid on its edge. */
export const isExpired = (expiresAt: Date, now: Date): boolean =>
  expiresAt.getTime() <= now.getTime();

//====================================
// GRANTS
//====================================

/**
 * What a grant may narrow beyond the group itself.
 *
 * Exactly the columns the API already filters by, so no new vocabulary enters
 * the application - it is the shape of `MeasurementFilter` minus the parts a
 * grant has no business deciding: `group_name` and `public_read` are what the
 * grant *is*, and a time range would be confused with the time range of the
 * query.
 */
export type GrantFilter = {
  device_eui?: string;
  measurand?: string;
  sensor?: string;
  location?: string;
  datatype?: string;
};

/** One group's permission for one token, with the filter it applies. */
export type Grant = {
  group: string;
  filter: GrantFilter;
};

export const FILTER_KEYS = [
  "device_eui",
  "measurand",
  "sensor",
  "location",
  "datatype",
] as const;

const VALID_DATATYPES = new Set(["float", "integer", "string"]);

/**
 * Reads a stored or submitted filter, or says what is wrong with it.
 *
 * Unknown keys are refused rather than dropped. A filter that silently ignores
 * what it does not understand would widen access without anybody noticing -
 * which is the one direction an error here must not take.
 */
export const validateFilter = (raw: unknown): GrantFilter | string => {
  if (raw === null || raw === undefined) return {};
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return "Der Filter muss ein Objekt sein.";
  }

  const filter: GrantFilter = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!(FILTER_KEYS as readonly string[]).includes(key)) {
      return `„${key}" ist kein zulässiges Filterfeld.`;
    }
    if (value === null || value === undefined || value === "") continue;
    if (typeof value !== "string") return `„${key}" muss eine Zeichenkette sein.`;
    const trimmed = value.trim();
    if (trimmed.length === 0) continue;
    if (key === "datatype" && !VALID_DATATYPES.has(trimmed)) {
      return `„${trimmed}" ist kein bekannter Datentyp.`;
    }
    filter[key as keyof GrantFilter] = trimmed;
  }
  return filter;
};

/**
 * Whether a row is covered by any of the grants.
 *
 * The same decision the SQL in services/api-tokens.ts makes, written once here
 * so it can be tested without a database. Public rows are not considered - they
 * are visible to everyone anyway and are added alongside, not through, a grant.
 */
export const grantsCover = (
  grants: readonly Grant[],
  row: { group_name: string | null } & Record<string, unknown>,
): boolean =>
  grants.some((grant) => {
    if (row.group_name !== grant.group) return false;
    return FILTER_KEYS.every((key) => {
      const wanted = grant.filter[key];
      return wanted === undefined || row[key] === wanted;
    });
  });
