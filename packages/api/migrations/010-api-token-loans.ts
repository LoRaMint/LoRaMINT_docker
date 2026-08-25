import { sql } from "bun"

/**
 * Lending a token to another data group.
 *
 * The case this exists for: one program needs to read the data of several
 * groups. The owning group lends its token to another; that group then sees it
 * and may grant it access to *its own* data. Nobody has to hand anything over
 * and no second token is needed.
 *
 * **The value is never lent along.** Only its hash is stored, so the
 * application could not show it again even if it wanted to - and that is the
 * right outcome rather than a limitation: a borrowing group that held the value
 * could use the token itself, and would then read the data of the owner and of
 * every other lender too. Lending passes the right to grant, never the ability
 * to act.
 *
 * There is no onward lending: only the owner lends, or it would lose track of
 * who may open data to it.
 *
 * See docs/api-token.md.
 */
export const up = async () => {
  await sql`
    CREATE TABLE IF NOT EXISTS api_token_loans (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      token_id UUID NOT NULL REFERENCES api_tokens(id) ON DELETE CASCADE,
      borrower_group VARCHAR(100) NOT NULL
        REFERENCES data_groups(name) ON DELETE CASCADE,
      lent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      lent_by VARCHAR(100),
      UNIQUE (token_id, borrower_group)
    )
  `.simple()

  // Read from both ends: a token's lenders, and the tokens lent to my group.
  await sql`
    CREATE INDEX IF NOT EXISTS api_token_loans_borrower_idx
      ON api_token_loans (borrower_group)
  `.simple()
}
