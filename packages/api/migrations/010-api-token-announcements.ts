import { sql } from "bun"

/**
 * Making a token known to another data group.
 *
 * The case this exists for: one program needs to read the data of several
 * groups. The owning group announces its token to another; that group then sees
 * it and may grant it access to *its own* data. No second token, and nothing
 * changes hands.
 *
 * **Announcing is not lending, and the word matters.** The other group receives
 * nothing it can use - never the value, only the knowledge that the token
 * exists - and the owner gives nothing up. What flows afterwards flows *to* the
 * owner's program. So this passes the right to contribute, never the ability to
 * act.
 *
 * That the value stays behind is not a limitation to work around: only its hash
 * is stored, so it could not be shown again anyway. A group holding it could use
 * the token itself and would then read the owner's data and every other
 * contributor's.
 *
 * A group cannot pass the announcement on: only the owner announces, or it
 * would lose track of who may open data to its token.
 *
 * See docs/api-token.md.
 */
export const up = async () => {
  await sql`
    CREATE TABLE IF NOT EXISTS api_token_announcements (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      token_id UUID NOT NULL REFERENCES api_tokens(id) ON DELETE CASCADE,
      announced_to_group VARCHAR(100) NOT NULL
        REFERENCES data_groups(name) ON DELETE CASCADE,
      announced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      announced_by VARCHAR(100),
      UNIQUE (token_id, announced_to_group)
    )
  `.simple()

  // Read from both ends: a token's lenders, and the tokens lent to my group.
  await sql`
    CREATE INDEX IF NOT EXISTS api_token_announcements_group_idx
      ON api_token_announcements (announced_to_group)
  `.simple()
}
