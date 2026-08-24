import { afterAll, describe, expect, test } from "bun:test";
import { connect } from "node:net";
import { SQL } from "bun";
import { DB_ROLES, roleDsn } from "../lib/db-roles";
import { requestContext } from "../lib/request-context";
import type { Grant } from "../lib/api-tokens";

/**
 * Integration tests for what an API token may read, against a real Postgres.
 *
 * The property under test cannot be shown with a mock, because two mechanisms
 * have to agree: row-level security admits the granted *groups*, and the grant
 * clause in the service narrows within them. Either one alone would be wrong -
 * too much or too little - and a mistake here would be silent, handing out rows
 * nobody meant to share.
 *
 *     docker compose -f compose.dev.yml up -d postgres
 *     bun run migrate
 *     bun run ensure-roles
 *
 * Skipped when nothing is listening; CI sets DB_TESTS_REQUIRED=1.
 */

const APP_DSN =
  Bun.env.DATABASE_URL ?? "postgres://loramint:loramint@localhost:5432/loramint";
const MANAGE_DSN = roleDsn(APP_DSN, DB_ROLES.manage);

const reachable = await new Promise<boolean>((resolve) => {
  let hostname = "localhost";
  let port = 5432;
  try {
    const url = new URL(APP_DSN);
    hostname = url.hostname || hostname;
    port = Number(url.port) || port;
  } catch {
    // Fall back to the defaults above.
  }
  const socket = connect({ host: hostname, port });
  const done = (result: boolean) => {
    socket.destroy();
    resolve(result);
  };
  socket.setTimeout(1000);
  socket.once("connect", () => done(true));
  socket.once("timeout", () => done(false));
  socket.once("error", () => done(false));
});

if (!reachable) {
  const hint = "  Start it with: docker compose -f compose.dev.yml up -d postgres";
  if (Bun.env.DB_TESTS_REQUIRED === "1") {
    throw new Error(
      `DB_TESTS_REQUIRED is set but no database is listening for ${APP_DSN}.\n${hint}`,
    );
  }
  console.warn(`No database at ${APP_DSN} - API token integration tests skipped.\n${hint}`);
}

process.env.TTN_APP_KEY ??= "integration-test";
process.env.DATABASE_URL_MANAGE ??= MANAGE_DSN;

const app = new SQL(APP_DSN);
const { measurements } = await import("./measurement");
const apiTokens = await import("./api-tokens");

/** Unique per run, so a leftover row from a failed run cannot skew a count. */
const suffix = Math.random().toString(36).slice(2, 8);
const GROUP_A = `test-a-${suffix}`;
const GROUP_B = `test-b-${suffix}`;
const DEVICE_1 = "AAAA000000000001";
const DEVICE_2 = "AAAA000000000002";

const actor = { username: "test", displayName: null };

/** Runs as a token would: the granted groups in scope, the grants alongside. */
const asToken = <T>(grants: readonly Grant[], run: () => Promise<T>): Promise<T> =>
  requestContext.run(
    { user: null, scope: grants.map((g) => g.group), tokenGrants: grants },
    run,
  );

/** How many rows this token can see, over the whole table. */
const visible = async (grants: readonly Grant[]) =>
  asToken(grants, async () => {
    const result = await measurements.list({ page: 1, perPage: 1, offset: 0 }, {});
    return result.total;
  });

const seed = async () => {
  await app`INSERT INTO data_groups (name) VALUES (${GROUP_A}), (${GROUP_B})
            ON CONFLICT (name) DO NOTHING`;
  // Written through the owner connection, which bypasses the group-stamping
  // trigger's effect by setting the columns straight after - the trigger reads
  // device_groups, which these synthetic devices are not in.
  for (const [device, group, measurand] of [
    [DEVICE_1, GROUP_A, "Temperatur"],
    [DEVICE_1, GROUP_A, "Druck"],
    [DEVICE_2, GROUP_A, "Temperatur"],
    [DEVICE_1, GROUP_B, "Temperatur"],
  ] as const) {
    const [row] = await app`
      INSERT INTO measurements (device_eui, measurand, unit, datatype, sensor, location, value, time_method)
      VALUES (${device}, ${measurand}, 'x', 'float', 'S', 'L', '1.0', 'server')
      RETURNING id
    `;
    await app`UPDATE measurements SET group_name = ${group}, public_read = false
              WHERE id = ${row.id}`;
  }
};

const cleanup = async () => {
  await app`DELETE FROM api_token_log WHERE group_name IN (${GROUP_A}, ${GROUP_B})`;
  await app`DELETE FROM measurements WHERE device_eui IN (${DEVICE_1}, ${DEVICE_2})`;
  await app`DELETE FROM api_tokens WHERE owner_group IN (${GROUP_A}, ${GROUP_B})`;
  await app`DELETE FROM data_groups WHERE name IN (${GROUP_A}, ${GROUP_B})`;
};

describe.skipIf(!reachable)("was ein Token sehen darf", () => {
  afterAll(cleanup);

  test("nichts Zusätzliches ohne Berechtigung, alles Gewährte mit", async () => {
    await cleanup();
    await seed();

    // Der Bezugspunkt: was ohne jede Berechtigung sichtbar ist. Alle vier
    // gesäten Zeilen sind nicht öffentlich, dürfen hier also nicht vorkommen.
    const publicOnly = await visible([]);

    // Ganze Gruppe A: die drei Zeilen von A kommen hinzu.
    expect(await visible([{ group: GROUP_A, filter: {} }])).toBe(publicOnly + 3);

    // Gefiltert auf ein Gerät: nur dessen zwei Zeilen in A.
    expect(
      await visible([{ group: GROUP_A, filter: { device_eui: DEVICE_1 } }]),
    ).toBe(publicOnly + 2);

    // Zwei Felder wirken zusammen.
    expect(
      await visible([
        { group: GROUP_A, filter: { device_eui: DEVICE_1, measurand: "Druck" } },
      ]),
    ).toBe(publicOnly + 1);

    // Mehrere Berechtigungen als ODER: A ganz plus B ganz.
    expect(
      await visible([
        { group: GROUP_A, filter: {} },
        { group: GROUP_B, filter: {} },
      ]),
    ).toBe(publicOnly + 4);
  });

  /**
   * Die Grenze, auf die es ankommt: eine Berechtigung für A darf keine Zeile
   * von B sichtbar machen, auch wenn der Filter auf B passen würde.
   */
  test("ein Filter greift nicht über die Gruppe hinaus", async () => {
    await cleanup();
    await seed();
    const publicOnly = await visible([]);

    // DEVICE_1/Temperatur gibt es in A *und* in B. Die Berechtigung nennt A,
    // also darf nur A's Zeile erscheinen.
    expect(
      await visible([
        { group: GROUP_A, filter: { device_eui: DEVICE_1, measurand: "Temperatur" } },
      ]),
    ).toBe(publicOnly + 1);
  });

  test("ein abgelaufenes Token authentifiziert nicht mehr", async () => {
    await cleanup();
    await seed();

    const made = await apiTokens.createToken(
      { name: "Ablauf", ownerGroup: GROUP_A, days: 30, visibility: "group" },
      actor,
    );
    if (!made.ok) throw new Error(made.error);

    expect(await apiTokens.authenticate(made.data.plaintext)).not.toBeNull();

    await app`UPDATE api_tokens SET expires_at = now() - interval '1 second'
              WHERE id = ${made.data.id}`;
    expect(await apiTokens.authenticate(made.data.plaintext)).toBeNull();
  });

  test("ein entzogenes Recht wirkt sofort, das Token bleibt gültig", async () => {
    await cleanup();
    await seed();

    const made = await apiTokens.createToken(
      { name: "Entzug", ownerGroup: GROUP_A, days: 30, visibility: "group" },
      actor,
    );
    if (!made.ok) throw new Error(made.error);
    const token = (await apiTokens.getToken(made.data.id))!;

    await apiTokens.grant(token, GROUP_A, {}, actor);
    expect((await apiTokens.authenticate(made.data.plaintext))!.grants).toHaveLength(1);

    await apiTokens.revoke(token, GROUP_A, actor);
    const after = await apiTokens.authenticate(made.data.plaintext);
    // Der Nachweis lebt weiter - nur seine Rechte sind fort. Genau darum geht es.
    expect(after).not.toBeNull();
    expect(after!.grants).toHaveLength(0);
  });

  test("die Historie überlebt das Löschen des Tokens", async () => {
    await cleanup();
    await seed();

    const made = await apiTokens.createToken(
      { name: "Spur", ownerGroup: GROUP_A, days: 30, visibility: "group" },
      actor,
    );
    if (!made.ok) throw new Error(made.error);
    const token = (await apiTokens.getToken(made.data.id))!;
    await apiTokens.deleteToken(token, actor);

    expect(await apiTokens.getToken(made.data.id)).toBeNull();
    const entries = await apiTokens.history([GROUP_A], false);
    expect(entries.map((e) => e.action)).toEqual(["delete", "create"]);
    expect(entries[0]!.tokenName).toBe("Spur");
  });
});

/**
 * Runs a statement as the management role and returns why it was refused, or
 * null when it went through. Same helper as manage.integration.test.ts - the
 * try/catch form, because a rejected query object needs handling rather than
 * assertion chaining.
 */
const asManage = new SQL(MANAGE_DSN);
const refusalFor = async (statement: string) => {
  try {
    await asManage.unsafe(statement);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
};

describe.skipIf(!reachable)("das Protokoll lässt sich nicht umschreiben", () => {
  /**
   * Die Eigenschaft gehört der Datenbankrolle, nicht der Oberfläche: die Rolle
   * hinter diesen Seiten hat SELECT und INSERT und sonst nichts. Kein Knopf in
   * der Anwendung könnte das aufweichen, und keiner müsste es verhindern.
   */
  test("die Verwaltungsrolle darf anhängen", async () => {
    expect(
      await refusalFor(
        "INSERT INTO api_token_log (username, action, token_id, token_name) " +
          "VALUES ('probe', 'create', gen_random_uuid(), 'Probe')",
      ),
    ).toBeNull();
    await app`DELETE FROM api_token_log WHERE username = 'probe'`;
  });

  test("aber die Datenbank verweigert UPDATE", async () => {
    expect(await refusalFor("UPDATE api_token_log SET username = 'gefälscht'")).toMatch(
      /permission denied/i,
    );
  });

  test("und verweigert DELETE", async () => {
    expect(await refusalFor("DELETE FROM api_token_log")).toMatch(/permission denied/i);
  });
});
