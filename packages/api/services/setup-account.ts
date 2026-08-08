import { createHash, timingSafeEqual } from "node:crypto";
import { setupAccount } from "../config";
import type { SessionUser } from "../lib/session";

/**
 * The local setup account: signing in against the environment rather than the
 * directory.
 *
 * It answers three ways, and the third is the reason this is a separate step
 * rather than a fallback inside the LDAP path:
 *
 *   other    the name is not the setup account's - ask the directory.
 *   ok       name and password match.
 *   wrong    the name *is* the setup account's and the password is not.
 *
 * "wrong" is refused outright and never passed on to the directory. Two reasons.
 * The name then belongs unambiguously to this account, so nobody can find out by
 * trying whether a directory entry of the same name exists; and a failed attempt
 * costs one comparison rather than a comparison plus a bind, so the response time
 * does not say which path answered.
 */

export type SetupOutcome =
  | { kind: "other" }
  | { kind: "ok"; user: SessionUser }
  | { kind: "wrong" };

/**
 * Constant-time comparison of two strings of any length.
 *
 * Both sides are hashed to a fixed size first, so neither the result nor the
 * length of either value leaks through timing - the same trick `verifyAppKey`
 * in config.ts uses, and for the same reason.
 */
const equals = (a: string, b: string) =>
  timingSafeEqual(
    createHash("sha256").update(a).digest(),
    createHash("sha256").update(b).digest(),
  );

/**
 * Checks a submitted login against the setup account.
 *
 * The password is verified against `ADMIN_PASSWORD_HASH` when there is one, and
 * only otherwise against `ADMIN_PW`. A deployment that sets both gets the hash;
 * config.ts says so in the log at startup.
 */
export const verifySetupAccount = async (
  username: string,
  password: string,
): Promise<SetupOutcome> => {
  if (!setupAccount.enabled || setupAccount.username === null) {
    return { kind: "other" };
  }

  // Trimmed, because a name pasted into a login form arrives with whatever the
  // clipboard carried. Not lower-cased: the directory treats names as given, and
  // two different rules for the same field would be a surprise.
  if (username.trim() !== setupAccount.username.trim()) {
    return { kind: "other" };
  }

  // An empty password never matches, and must not reach Bun.password.verify -
  // which would happily spend its time on it.
  if (password.length === 0) return { kind: "wrong" };

  let matches = false;
  if (setupAccount.passwordHash !== null) {
    try {
      matches = await Bun.password.verify(password, setupAccount.passwordHash);
    } catch {
      // An unreadable hash is a configuration mistake, not a wrong password.
      // Saying so here is what keeps somebody from hunting for a typo in the
      // password they know is right.
      console.error(
        "setup-account: ADMIN_PASSWORD_HASH is not a hash this server can " +
          "read. Generate one with: bun scripts/hash-password.ts",
      );
      matches = false;
    }
  } else if (setupAccount.password !== null) {
    matches = equals(password, setupAccount.password);
  }

  if (!matches) return { kind: "wrong" };

  return {
    kind: "ok",
    user: {
      username: setupAccount.username,
      displayName: setupAccount.username,
      // No directory, no groups. lib/roles.ts grants `admin` off the flag below
      // instead, because a group name here would have to match whatever
      // LDAP_ADMIN_GROUP happens to say - and that may not be configured yet,
      // which is the very situation this account exists for.
      groups: [],
      setup: true,
    },
  };
};
