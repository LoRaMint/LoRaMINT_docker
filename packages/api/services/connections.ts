import { SQL } from "bun";
import { ingest, manage, sqlConsole } from "../config";

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
