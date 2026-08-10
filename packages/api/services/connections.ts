import { SQL } from "bun";
import { ingest, manage, regroup, sqlConsole } from "../config";

/**
 * The connections the application queries through, named after the intent of the
 * query rather than after the module that makes it.
 *
 * The rule, in one line: **a query runs on the narrowest role that can carry
 * it.** Not on the role of whoever is signed in - an administrator who only
 * reads on a page reads through `reading` like everybody else - and not on
 * whatever connection the surrounding file happened to import.
 *
 * The application's own DATABASE_URL is deliberately absent from this file. It
 * owns the schema and is a superuser in the default Docker setup; every read
 * used to run through it, so a flaw in any read path was worth a shell on the
 * database host rather than a few rows too many. It is now used by `migrate.ts`
 * and `scripts/ensure-roles.ts` and by nothing else.
 *
 * Created on first use, so importing this module opens nothing - the tests pull
 * these modules in for their pure helpers.
 */

/**
 * The open pools, one per connection string.
 *
 * Parked on `globalThis` rather than in a module-level `const`, and that is not
 * a style choice. `bun run --hot` re-evaluates this module on every file save
 * while keeping the process alive: a plain module-level Map would be a *new*
 * empty Map each time, the next request would open a fresh pool, and the pool
 * from before would be unreachable with its sockets still open. Measured during
 * an editing session: 97 idle connections against a `max_connections` of 100,
 * after which the server would not start and the tests failed with "remaining
 * connection slots are reserved" - a failure that looks like a broken test and
 * is really an editor.
 *
 * The process is the right lifetime for a connection pool, so the pools live
 * where the process does.
 */
const clients: Map<string, SQL> = ((globalThis as any).__loramintPools ??=
  new Map<string, SQL>());

/**
 * How many connections one role may hold.
 *
 * Splitting one connection into four multiplies the pools, and Postgres counts
 * every one of them against `max_connections` - which is 100 by default, three
 * of them reserved for superusers. Measured during this change: an unbounded
 * read pool took 77 slots on its own and the next connection was refused with
 * "remaining connection slots are reserved". A bound per role is what keeps the
 * total predictable: four roles, at most twenty connections between them.
 *
 * Reading gets the largest share because that is what serving pages is.
 */
const POOL_SIZE = { reading: 10, writing: 5, ingesting: 5 } as const;

const connect = (dsn: string, max: number): SQL => {
  let client = clients.get(dsn);
  if (!client) {
    // Idle connections are handed back rather than held for the life of the
    // process, so a quiet server does not sit on slots another one needs.
    client = new SQL(dsn, { max, idleTimeout: 30 });
    clients.set(dsn, client);
  }
  return client;
};

/**
 * Everything the application reads: pages, exports, the settings at startup.
 *
 * The role carries `default_transaction_read_only`, so this cannot write even if
 * a query tried - which is what survives a statement that ends the transaction
 * and carries on.
 */
export const reading = () => connect(sqlConsole.databaseUrl, POOL_SIZE.reading);

/** Every change a person makes: corrections, deletions, settings, device log. */
export const writing = () => connect(manage.databaseUrl, POOL_SIZE.writing);

/**
 * The webhook, and nothing else. INSERT on the two data tables and not even
 * SELECT: it is the only externally reachable route that writes, and it reads
 * nothing, so it may read nothing.
 */
export const ingesting = () => connect(ingest.databaseUrl, POOL_SIZE.ingesting);

/**
 * Moving a measurement between groups, and releasing it for everyone.
 *
 * A role of its own rather than two more columns on `writing`, and the split is
 * the point: `loramint_manage` is granted UPDATE column by column and does not
 * hold `group_name` or `public_read`, so the ordinary correction path *cannot*
 * hand a reading to another group. Postgres refuses it, which means no route can
 * be written that gets it wrong.
 *
 * This still follows the rule at the top of this file. "Move a measurement to
 * another group" is a different operation from "correct a value", not the same
 * operation performed by someone more senior - and it gets the narrowest role
 * that can carry it, which happens to be a role that can do nothing else.
 */
export const regrouping = () => connect(regroup.databaseUrl, POOL_SIZE.writing);

//====================================
// WHO IS ASKING
//====================================

/**
 * Which measurements a query may touch: every one of them, or those belonging
 * to the listed data groups.
 *
 * An empty array is a real answer - "nothing beyond what is public" - and not a
 * reason to fall back to showing everything.
 */
export type Scope = "all" | readonly string[];

/**
 * Tells the row-level policies who is asking, for the length of one transaction.
 *
 * The policies in migration 007 read two settings. Neither is set here by string
 * concatenation: `set_config` takes the value as a parameter, so a group name
 * out of the directory can never become part of a statement.
 *
 * `true` as the third argument is what makes it local to the transaction. A
 * session-wide setting would outlive the request and be inherited by whoever
 * gets that pooled connection next - which is the whole class of bug this
 * arrangement has to avoid.
 */
export const setScope = async (tx: SQL, scope: Scope): Promise<void> => {
  if (scope === "all") {
    await tx`SELECT set_config('loramint.allgroups', 'on', true)`;
    return;
  }
  // Nothing to set when the list is empty: unset means public-only, which is
  // exactly the right answer, and setting an empty string would only be a
  // longer way of saying it.
  if (scope.length === 0) return;
  await tx`SELECT set_config('loramint.groups', ${scope.join(",")}, true)`;
};

/**
 * Reads what `scope` is allowed to see.
 *
 * Every read that should show more than the public rows has to go through here,
 * because `set_config(..., true)` only lasts for a transaction and a bare query
 * has none. That is not an inconvenience but the safety net: a path somebody
 * forgets to wrap shows public data, never somebody else's.
 */
export const readingAs = <T>(
  scope: Scope,
  run: (tx: SQL) => Promise<T>,
): Promise<T> =>
  reading().begin("read only", async (tx) => {
    await setScope(tx as SQL, scope);
    return run(tx as SQL);
  }) as Promise<T>;

/** Changes what `scope` is allowed to change. Same reasoning as `readingAs`. */
export const writingAs = <T>(
  scope: Scope,
  run: (tx: SQL) => Promise<T>,
): Promise<T> =>
  writing().begin(async (tx) => {
    await setScope(tx as SQL, scope);
    return run(tx as SQL);
  }) as Promise<T>;

/** Moves rows between groups. Only ever called with `"all"` - see roles.ts. */
export const regroupingAs = <T>(
  scope: Scope,
  run: (tx: SQL) => Promise<T>,
): Promise<T> =>
  regrouping().begin(async (tx) => {
    await setScope(tx as SQL, scope);
    return run(tx as SQL);
  }) as Promise<T>;
