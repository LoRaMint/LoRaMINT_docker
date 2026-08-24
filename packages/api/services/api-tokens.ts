import { reading, writing } from "./connections";
import { currentTokenGrants } from "../lib/request-context";
import {
  expiryFor,
  generateToken,
  hashToken,
  isExpired,
  validateFilter,
  type Grant,
} from "../lib/api-tokens";

/**
 * API tokens: storage, authentication, and the history of every change.
 *
 * The rules that need no database live in lib/api-tokens.ts. This module is the
 * part that touches storage - and the part that keeps the two tables in step:
 * **every write appends to `api_token_log` in the same transaction**, so a
 * change and its record cannot come apart.
 *
 * No `reason` is asked for. A permission change is configuration, not a
 * correction to somebody's data, and the configuration page does not ask either
 * (see frontend/pages/management/config-routes.tsx). Who and when is recorded;
 * why belongs in the token's name.
 *
 * See docs/api-token.md.
 */

//====================================
// TYPES
//====================================

export type Visibility = "group" | "signed_in";

export type TokenRow = {
  id: string;
  name: string;
  ownerGroup: string;
  visibility: Visibility;
  expiresAt: Date;
  lastUsedAt: Date | null;
  createdAt: Date;
  createdBy: string | null;
  grants: Grant[];
};

/** Who is acting. Deliberately smaller than services/manage.ts's `Actor`: no reason, no scope. */
export type TokenActor = { username: string; displayName: string | null };

export type TokenAction =
  | "create"
  | "delete"
  | "grant"
  | "revoke"
  | "extend"
  | "visibility"
  | "reveal"
  | "lend"
  | "unlend";

export type LogEntry = {
  id: string;
  occurredAt: Date;
  username: string;
  displayName: string | null;
  action: TokenAction;
  tokenId: string;
  tokenName: string;
  groupName: string | null;
  details: Record<string, unknown>;
};

export type TokenResult<T = null> = { ok: true; data: T } | { ok: false; error: string };

//====================================
// READING
//====================================

const mapGrants = (raw: unknown): Grant[] => {
  if (!Array.isArray(raw)) return [];
  const grants: Grant[] = [];
  for (const row of raw as ({ group_name: string; filter: unknown } | null)[]) {
    if (row === null) continue;
    const filter = validateFilter(row.filter);
    if (typeof filter === "string") {
      // A stored filter this version cannot read is dropped, not guessed at.
      // Keeping the grant and ignoring its filter would widen access - the one
      // direction a mistake here must never take - and there is no reading of an
      // unknown filter that is safely narrower. Loud rather than silent: a token
      // quietly losing a permission is worth looking into.
      console.error(
        `api-tokens: grant for "${row.group_name}" has an unreadable filter and was ignored:`,
        filter,
      );
      continue;
    }
    grants.push({ group: row.group_name, filter });
  }
  return grants;
};

const mapToken = (row: Record<string, unknown>): TokenRow => ({
  id: row.id as string,
  name: row.name as string,
  ownerGroup: row.owner_group as string,
  visibility: row.visibility as Visibility,
  expiresAt: row.expires_at as Date,
  lastUsedAt: (row.last_used_at as Date | null) ?? null,
  createdAt: row.created_at as Date,
  createdBy: (row.created_by as string | null) ?? null,
  grants: mapGrants(row.grants),
});

/**
 * A group list as a parameter.
 *
 * Bun's driver does not encode a JS array as a Postgres array, and the literal
 * this codebase builds by hand elsewhere (`{a,b}`, see services/manage.ts:155)
 * would break on a name containing a comma. Going through JSON survives any
 * character a directory might hand us, and an empty list simply matches
 * nothing.
 */
const asJsonList = (values: readonly string[]) => JSON.stringify([...values]);

/** The tokens this person may see: their groups' own, plus the openly visible ones. */
export const listForUser = async (
  groups: readonly string[],
  isAdmin: boolean,
): Promise<TokenRow[]> => {
  const rows = await reading()`
    SELECT t.id, t.name, t.owner_group, t.visibility, t.expires_at,
           t.last_used_at, t.created_at, t.created_by,
           COALESCE(
             (SELECT json_agg(json_build_object('group_name', g.group_name, 'filter', g.filter))
                FROM api_token_grants g WHERE g.token_id = t.id),
             '[]'::json
           ) AS grants
    FROM api_tokens t
    WHERE ${isAdmin}
       OR t.visibility = 'signed_in'
       OR t.owner_group IN (
            SELECT jsonb_array_elements_text(${asJsonList(groups)}::text::jsonb)
          )
    ORDER BY t.name
  `;
  return (rows as Record<string, unknown>[]).map(mapToken);
};

export const getToken = async (id: string): Promise<TokenRow | null> => {
  const rows = await reading()`
    SELECT t.id, t.name, t.owner_group, t.visibility, t.expires_at,
           t.last_used_at, t.created_at, t.created_by,
           COALESCE(
             (SELECT json_agg(json_build_object('group_name', g.group_name, 'filter', g.filter))
                FROM api_token_grants g WHERE g.token_id = t.id),
             '[]'::json
           ) AS grants
    FROM api_tokens t
    WHERE t.id = ${id}
  `;
  const [row] = rows as Record<string, unknown>[];
  return row ? mapToken(row) : null;
};

//====================================
// AUTHENTICATION
//====================================

/**
 * How stale `last_used_at` may become before it is written again.
 *
 * Without this, every read through the API would cost a write. The field exists
 * to spot a forgotten token, and for that a five-minute resolution is plenty.
 */
const LAST_USED_MAX_AGE_MS = 5 * 60 * 1000;

/**
 * Turns a bearer value into the groups and filters it may read, or null.
 *
 * One indexed lookup on the hash - which is what allows SHA-256 rather than a
 * password hash here; see lib/api-tokens.ts.
 */
export const authenticate = async (
  bearer: string,
): Promise<{ tokenId: string; grants: Grant[] } | null> => {
  const hash = hashToken(bearer);
  const rows = await reading()`
    SELECT t.id, t.expires_at, t.last_used_at,
           COALESCE(
             (SELECT json_agg(json_build_object('group_name', g.group_name, 'filter', g.filter))
                FROM api_token_grants g WHERE g.token_id = t.id),
             '[]'::json
           ) AS grants
    FROM api_tokens t
    WHERE t.token_hash = ${hash}
  `;
  const [row] = rows as Record<string, unknown>[];
  if (!row) return null;
  if (isExpired(row.expires_at as Date, new Date())) return null;

  const lastUsed = (row.last_used_at as Date | null) ?? null;
  if (!lastUsed || Date.now() - lastUsed.getTime() > LAST_USED_MAX_AGE_MS) {
    // Not awaited into the answer: a failed bookkeeping write must never turn a
    // valid token into a rejected one.
    writing()`UPDATE api_tokens SET last_used_at = now() WHERE id = ${row.id as string}`.catch(
      (err) => console.error("api-tokens: could not record last use:", err),
    );
  }

  return { tokenId: row.id as string, grants: mapGrants(row.grants) };
};

//====================================
// WRITING
//====================================

/** Appends to the history. Always called inside the transaction it belongs to. */
const logInto = async (
  tx: { (strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown> },
  entry: {
    action: TokenAction;
    tokenId: string;
    tokenName: string;
    groupName: string | null;
    details?: Record<string, unknown>;
  },
  actor: TokenActor,
) => {
  // ::text::jsonb rather than ::jsonb - against a jsonb parameter the driver
  // encodes the string a second time. Same detour as services/device-log.ts.
  await tx`
    INSERT INTO api_token_log
      (username, display_name, action, token_id, token_name, group_name, details)
    VALUES (
      ${actor.username}, ${actor.displayName}, ${entry.action}, ${entry.tokenId}::uuid,
      ${entry.tokenName}, ${entry.groupName},
      ${JSON.stringify(entry.details ?? {})}::text::jsonb
    )
  `;
};

const failed = (what: string, err: unknown): TokenResult<never> => {
  console.error(`api-tokens: ${what} failed:`, err);
  return { ok: false, error: `${what} ist fehlgeschlagen.` };
};

/**
 * Creates a token and returns its value **once**.
 *
 * The plaintext is never stored and cannot be recovered: losing it means
 * issuing a new token. The caller must render it directly rather than
 * redirecting, or it is gone.
 */
export const createToken = async (
  input: { name: string; ownerGroup: string; days: number; visibility: Visibility },
  actor: TokenActor,
): Promise<TokenResult<{ plaintext: string; id: string }>> => {
  const name = input.name.trim();
  if (name.length === 0) return { ok: false, error: "Der Name darf nicht leer sein." };
  if (name.length > 100) return { ok: false, error: "Der Name ist zu lang (höchstens 100 Zeichen)." };

  const plaintext = generateToken();
  const expiresAt = expiryFor(input.days, new Date());

  try {
    let id = "";
    await writing().begin(async (tx: any) => {
      const [row] = await tx`
        INSERT INTO api_tokens (name, token_hash, owner_group, visibility, expires_at, created_by)
        VALUES (${name}, ${hashToken(plaintext)}, ${input.ownerGroup},
                ${input.visibility}, ${expiresAt}, ${actor.username})
        RETURNING id
      `;
      id = row.id as string;
      await logInto(tx, {
        action: "create",
        tokenId: id,
        tokenName: name,
        groupName: input.ownerGroup,
        details: { expiresAt: expiresAt.toISOString(), visibility: input.visibility },
      }, actor);
    });
    return { ok: true, data: { plaintext, id } };
  } catch (err) {
    return failed("Das Anlegen des Tokens", err);
  }
};

export const deleteToken = async (
  token: TokenRow,
  actor: TokenActor,
): Promise<TokenResult> => {
  try {
    await writing().begin(async (tx: any) => {
      // The log entry first: it holds the id and name as plain values, so it
      // survives the row it describes - which is the point, since every group
      // member may delete.
      await logInto(tx, {
        action: "delete",
        tokenId: token.id,
        tokenName: token.name,
        groupName: token.ownerGroup,
      }, actor);
      await tx`DELETE FROM api_tokens WHERE id = ${token.id}`;
    });
    return { ok: true, data: null };
  } catch (err) {
    return failed("Das Löschen des Tokens", err);
  }
};

export const extendToken = async (
  token: TokenRow,
  days: number,
  actor: TokenActor,
): Promise<TokenResult> => {
  const expiresAt = expiryFor(days, new Date());
  try {
    await writing().begin(async (tx: any) => {
      await tx`UPDATE api_tokens SET expires_at = ${expiresAt} WHERE id = ${token.id}`;
      await logInto(tx, {
        action: "extend",
        tokenId: token.id,
        tokenName: token.name,
        groupName: token.ownerGroup,
        details: { expiresAt: expiresAt.toISOString() },
      }, actor);
    });
    return { ok: true, data: null };
  } catch (err) {
    return failed("Das Verlängern des Tokens", err);
  }
};

export const setVisibility = async (
  token: TokenRow,
  visibility: Visibility,
  actor: TokenActor,
): Promise<TokenResult> => {
  try {
    await writing().begin(async (tx: any) => {
      await tx`UPDATE api_tokens SET visibility = ${visibility} WHERE id = ${token.id}`;
      await logInto(tx, {
        action: "visibility",
        tokenId: token.id,
        tokenName: token.name,
        groupName: token.ownerGroup,
        details: { visibility },
      }, actor);
    });
    return { ok: true, data: null };
  } catch (err) {
    return failed("Das Ändern der Sichtbarkeit", err);
  }
};

/** Grants (or re-grants) one group's permission, with its filter. */
export const grant = async (
  token: TokenRow,
  group: string,
  rawFilter: unknown,
  actor: TokenActor,
): Promise<TokenResult> => {
  const filter = validateFilter(rawFilter);
  if (typeof filter === "string") return { ok: false, error: filter };

  try {
    await writing().begin(async (tx: any) => {
      await tx`
        INSERT INTO api_token_grants (token_id, group_name, filter, granted_by)
        VALUES (${token.id}, ${group}, ${JSON.stringify(filter)}::text::jsonb, ${actor.username})
        ON CONFLICT (token_id, group_name) DO UPDATE
          SET filter = EXCLUDED.filter,
              granted_at = now(),
              granted_by = EXCLUDED.granted_by
      `;
      await logInto(tx, {
        action: "grant",
        tokenId: token.id,
        tokenName: token.name,
        groupName: group,
        details: { filter },
      }, actor);
    });
    return { ok: true, data: null };
  } catch (err) {
    return failed("Das Erteilen der Berechtigung", err);
  }
};

export const revoke = async (
  token: TokenRow,
  group: string,
  actor: TokenActor,
): Promise<TokenResult> => {
  try {
    await writing().begin(async (tx: any) => {
      await tx`DELETE FROM api_token_grants WHERE token_id = ${token.id} AND group_name = ${group}`;
      await logInto(tx, {
        action: "revoke",
        tokenId: token.id,
        tokenName: token.name,
        groupName: group,
      }, actor);
    });
    return { ok: true, data: null };
  } catch (err) {
    return failed("Das Entziehen der Berechtigung", err);
  }
};

//====================================
// WHAT A TOKEN MAY SEE
//====================================

/**
 * The condition a token's grants add to a query.
 *
 * Two stages decide what a token reads, and this is the second. The first is
 * row-level security: `scope` carries the granted group names, so the policies
 * already let those rows through. This narrows further, to the filter each
 * grant carries.
 *
 * The grants travel as one JSON parameter and are unfolded in SQL, so there is
 * no dynamic statement to build and any number of grants costs one placeholder.
 *
 *   no token       -> the parameter is NULL and the condition is a tautology.
 *   token, 0 grants-> nothing matches the EXISTS, so only public rows survive.
 *   token, n grants-> a row passes if it is public, or if some grant names its
 *                     group and every field of that grant's filter agrees.
 *
 * Public rows are added rather than granted: they are readable by anyone
 * already, so a token must not see *less* than an anonymous caller.
 */
export const measurementGrantClause = () => {
  const grants = currentTokenGrants();
  const json = grants === null ? null : JSON.stringify(grants);
  return reading()`(
    ${json}::text IS NULL
    OR public_read
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(${json}::text::jsonb) AS g
      WHERE group_name = g->>'group'
        AND (g->'filter'->>'device_eui' IS NULL OR device_eui = g->'filter'->>'device_eui')
        AND (g->'filter'->>'measurand'  IS NULL OR measurand  = g->'filter'->>'measurand')
        AND (g->'filter'->>'sensor'     IS NULL OR sensor     = g->'filter'->>'sensor')
        AND (g->'filter'->>'location'   IS NULL OR location   = g->'filter'->>'location')
        AND (g->'filter'->>'datatype'   IS NULL OR datatype   = g->'filter'->>'datatype')
    )
  )`;
};

/**
 * The same for `log_entries`, which carries only `device_eui` of the filter's
 * columns.
 *
 * A grant that names a column this table does not have covers **no** log entry
 * at all. That is the fail-closed reading: somebody who granted "only the
 * temperature readings" said something about measurements, and honouring the
 * part a log entry happens to share would hand over more than they allowed.
 */
export const logEntryGrantClause = () => {
  const grants = currentTokenGrants();
  const json = grants === null ? null : JSON.stringify(grants);
  return reading()`(
    ${json}::text IS NULL
    OR public_read
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(${json}::text::jsonb) AS g
      WHERE group_name = g->>'group'
        AND (g->'filter'->>'device_eui' IS NULL OR device_eui = g->'filter'->>'device_eui')
        AND ((g->'filter') - 'device_eui') = '{}'::jsonb
    )
  )`;
};

//====================================
// HISTORY
//====================================

/**
 * The history, narrowed to what this person may see.
 *
 * Their own groups' entries - as owner or as granting group - and everything
 * for administrators. The group column is what makes that possible at all; see
 * the note in migrations/009-api-tokens.ts.
 */
export const history = async (
  groups: readonly string[],
  isAdmin: boolean,
  limit = 200,
): Promise<LogEntry[]> => {
  const rows = await reading()`
    SELECT id, occurred_at, username, display_name, action,
           token_id, token_name, group_name, details
    FROM api_token_log
    WHERE ${isAdmin}
       OR group_name IN (
            SELECT jsonb_array_elements_text(${asJsonList(groups)}::text::jsonb)
          )
    ORDER BY occurred_at DESC
    LIMIT ${limit}
  `;
  return (rows as Record<string, unknown>[]).map((row) => ({
    id: row.id as string,
    occurredAt: row.occurred_at as Date,
    username: row.username as string,
    displayName: (row.display_name as string | null) ?? null,
    action: row.action as TokenAction,
    tokenId: row.token_id as string,
    tokenName: row.token_name as string,
    groupName: (row.group_name as string | null) ?? null,
    details: (row.details as Record<string, unknown> | null) ?? {},
  }));
};
