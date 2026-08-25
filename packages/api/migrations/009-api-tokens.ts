import { sql } from "bun"

/**
 * API tokens: a nameable, revocable way for a program to read the API.
 *
 * Until now the only way in was a person's session cookie - eight hours long,
 * not revocable one at a time, and carrying full write rights in the WebUI. A
 * nightly export would have had to keep somebody's password in the clear.
 *
 * **The model separates the credential from what it may do.** `api_tokens`
 * holds a name and nothing else of substance; `api_token_grants` holds what
 * data groups have allowed it to read. Withdrawing a grant therefore leaves the
 * token alone - no new value, no script to edit. That is the property the whole
 * design exists for.
 *
 * See docs/api-token.md.
 */
export const up = async () => {
  /**
   * Only the hash is stored, never the value - the same rule the device AppKey
   * follows. The value is shown once, at creation, and is then unrecoverable;
   * losing it means issuing a new token.
   *
   * `owner_group` cascades: a data group that goes away takes its tokens with
   * it. In practice this is rare, because ON DELETE RESTRICT on `measurements`
   * already refuses to delete a group that still owns readings.
   */
  await sql`
    CREATE TABLE IF NOT EXISTS api_tokens (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      owner_group VARCHAR(100) NOT NULL
        REFERENCES data_groups(name) ON DELETE CASCADE,
      visibility TEXT NOT NULL DEFAULT 'group'
        CHECK (visibility IN ('group', 'signed_in')),
      expires_at TIMESTAMPTZ NOT NULL,
      last_used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      created_by VARCHAR(100)
    )
  `.simple()

  await sql`
    CREATE INDEX IF NOT EXISTS api_tokens_owner_idx ON api_tokens (owner_group)
  `.simple()

  /**
   * One permission per (token, granting group).
   *
   * Several rows per token, because a token can be made known to other groups
   * (see 010) and each of them grants on its own - the shape does not change
   * when that happens.
   *
   * `filter` narrows within the group - the same columns the API already
   * filters by. An empty object means the whole group. See lib/api-tokens.ts.
   */
  await sql`
    CREATE TABLE IF NOT EXISTS api_token_grants (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      token_id UUID NOT NULL REFERENCES api_tokens(id) ON DELETE CASCADE,
      group_name VARCHAR(100) NOT NULL
        REFERENCES data_groups(name) ON DELETE CASCADE,
      filter JSONB NOT NULL DEFAULT '{}'::jsonb,
      granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      granted_by VARCHAR(100),
      UNIQUE (token_id, group_name)
    )
  `.simple()

  /**
   * The history of every change to the permission structure.
   *
   * **No foreign key to api_tokens, on purpose.** A cascade would delete a
   * token's history along with the token - and deleting is something every
   * member of the owning group may do. The log would then be empty exactly when
   * it is needed, so `token_id` and `token_name` are kept as plain values.
   *
   * `group_name` is here from the start. That is the deliberate difference from
   * `audit_log`, whose missing group column is why group members cannot see the
   * history of their own measurements (see docs/todo.md).
   *
   * Append-only, and that is a property of the database role rather than a
   * promise of the code: `loramint_manage` gets SELECT and INSERT on this table
   * and nothing else - see scripts/ensure-roles.ts.
   */
  await sql`
    CREATE TABLE IF NOT EXISTS api_token_log (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      username VARCHAR(100) NOT NULL,
      display_name VARCHAR(200),
      action VARCHAR(20) NOT NULL CHECK (action IN (
        'create', 'delete', 'grant', 'revoke', 'extend', 'visibility',
        'reveal', 'announce', 'unannounce'
      )),
      token_id UUID NOT NULL,
      token_name TEXT NOT NULL,
      group_name VARCHAR(100),
      details JSONB NOT NULL DEFAULT '{}'::jsonb
    )
  `.simple()

  // Newest first for the page, per token for one token's story, per group so a
  // granting group can find its own entries.
  await sql`
    CREATE INDEX IF NOT EXISTS api_token_log_time_idx
      ON api_token_log (occurred_at DESC)
  `.simple()
  await sql`
    CREATE INDEX IF NOT EXISTS api_token_log_token_idx
      ON api_token_log (token_id, occurred_at DESC)
  `.simple()
  await sql`
    CREATE INDEX IF NOT EXISTS api_token_log_group_idx
      ON api_token_log (group_name, occurred_at DESC)
  `.simple()
}
