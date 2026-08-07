import { afterAll, describe, expect, test } from "bun:test";
import { connect } from "node:net";
import { SQL } from "bun";

/**
 * Integration tests for the management write path against a real Postgres.
 *
 * The guarantees under test are properties of the *database*, not of the service:
 * that the management role can append to the change log but not rewrite it, and
 * that a change and its log entry share one transaction. Neither can be shown
 * with a mock. Start a database and the roles with:
 *
 *     docker compose -f compose.dev.yml up -d postgres
 *     bun run migrate
 *     bun run ensure-roles
 *
 * Skipped when nothing is listening, so `bun test` works without Docker; CI sets
 * DB_TESTS_REQUIRED=1 to turn a skip into a failure.
 */

const APP_DSN =
  Bun.env.DATABASE_URL ?? "postgres://loramint:loramint@localhost:5432/loramint";

const MANAGE_DSN =
  Bun.env.DATABASE_URL_MANAGE ??
  "postgres://loramint_manage:managepw@localhost:5432/loramint";

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
  console.warn(`No database at ${APP_DSN} - management integration tests skipped.\n${hint}`);
}

// config.ts throws on a missing TTN_APP_KEY at import time, and reads the
// management DSN once - both have to be in place before the service is loaded.
process.env.TTN_APP_KEY ??= "integration-test";
process.env.DATABASE_URL_MANAGE ??= MANAGE_DSN;
const { managed } = await import("./manage");

const app = new SQL(APP_DSN);
const asManage = new SQL(MANAGE_DSN);

const ACTOR = { username: "testuser", displayName: "Test User", reason: "Testlauf" };

/** A device id used by this run only, so the fixtures cannot collide. */
const deviceEui = `FFFF${crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`;

const seed = async (value: string, location = "Labor") => {
  const [row] = await app`
    INSERT INTO measurements (device_eui, measurand, unit, datatype, sensor, location, value, time_method, recorded_at)
    VALUES (${deviceEui}, 'Temperatur', '°C', 'float', 'BME280', ${location}, ${value}, 'server', now())
    RETURNING id
  `;
  return (row as { id: string }).id;
};

const valueOf = async (id: string) => {
  const [row] = await app`SELECT value, location FROM measurements WHERE id = ${id}`;
  return row as { value: string; location: string } | undefined;
};

type LogRow = {
  action: string;
  changes: Record<string, unknown>;
  reason: string | null;
  username: string;
  batch_id: string;
};

const logFor = async (id: string) => {
  const rows = (await app`
    SELECT action, changes, reason, username, batch_id
    FROM audit_log WHERE row_id = ${id}::uuid ORDER BY occurred_at
  `) as unknown as (Omit<LogRow, "changes"> & { changes: unknown })[];
  // The driver hands jsonb back decoded. Whether it was *stored* as an object
  // rather than as a double-encoded string is asserted separately below, so this
  // only has to survive both shapes.
  return rows.map(
    (row) =>
      ({
        ...row,
        changes: typeof row.changes === "string" ? JSON.parse(row.changes) : row.changes,
      }) as LogRow,
  );
};

const seedLog = async (message: string) => {
  const [row] = await app`
    INSERT INTO log_entries (device_eui, message)
    VALUES (${deviceEui}, ${message})
    RETURNING id
  `;
  return (row as { id: string }).id;
};

afterAll(async () => {
  if (!reachable) return;
  await app`DELETE FROM measurements WHERE device_eui = ${deviceEui}`;
  await app`DELETE FROM log_entries WHERE device_eui = ${deviceEui}`;
  await app`DELETE FROM audit_log WHERE username = ${ACTOR.username}`;
});

/**
 * The message the database answered with, or null when it allowed the
 * statement. Written out rather than using `expect().rejects`, because a query
 * from bun's client is a thenable rather than a real promise and the matcher
 * never settles on one.
 */
const refusalFor = async (statement: string) => {
  try {
    await asManage.unsafe(statement);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
};

describe.skipIf(!reachable)("the change log cannot be rewritten by the pages", () => {
  test("the management role may append to it", async () => {
    expect(await refusalFor("INSERT INTO audit_log (username, action, table_name, row_id, batch_id, changes) VALUES ('probe', 'update', 'measurements', gen_random_uuid(), gen_random_uuid(), '{}'::jsonb)")).toBeNull();
    await app`DELETE FROM audit_log WHERE username = 'probe'`;
  });

  test("but the database refuses UPDATE on it", async () => {
    expect(await refusalFor("UPDATE audit_log SET reason = 'tampered'")).toMatch(
      /permission denied/i,
    );
  });

  test("and refuses DELETE on it", async () => {
    expect(await refusalFor("DELETE FROM audit_log")).toMatch(/permission denied/i);
  });

  test("and refuses schema changes, so the log cannot be dropped", async () => {
    expect(await refusalFor("CREATE TABLE tamper_check (i int)")).toMatch(
      /permission denied/i,
    );
  });
});

describe.skipIf(!reachable)("correcting a measurement", () => {
  test("writes the new value and exactly one log entry", async () => {
    const id = await seed("235");

    const result = await managed.updateRows(
      "measurements",
      [{ id, fields: { value: { from: "235", to: "23.5" } } }],
      ACTOR,
    );

    expect(result.ok).toBe(true);
    expect(result.ok && result.data.kind).toBe("saved");
    expect((await valueOf(id))?.value).toBe("23.5");

    const entries = await logFor(id);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.action).toBe("update");
    expect(entries[0]!.username).toBe(ACTOR.username);
    expect(entries[0]!.reason).toBe("Testlauf");
    expect(entries[0]!.changes).toEqual({
      fields: { value: { from: "235", to: "23.5" } },
    });
  });

  test("stores the entry as a queryable object, not as encoded text", async () => {
    const id = await seed("100");
    await managed.updateRows(
      "measurements",
      [{ id, fields: { value: { from: "100", to: "10.0" } } }],
      ACTOR,
    );

    // A jsonb column accepts a string holding JSON just as happily as an object,
    // and the difference only shows when the log is queried: -> and ->> return
    // nothing on the former.
    const [row] = await app`
      SELECT jsonb_typeof(changes) AS typ, changes -> 'fields' -> 'value' ->> 'to' AS new_value
      FROM audit_log WHERE row_id = ${id}::uuid
    `;
    expect((row as { typ: string }).typ).toBe("object");
    expect((row as { new_value: string }).new_value).toBe("10.0");
  });

  test("changes several fields of one row in one entry", async () => {
    const id = await seed("1", "Labor");

    await managed.updateRows(
      "measurements",
      [
        {
          id,
          fields: {
            value: { from: "1", to: "2" },
            location: { from: "Labor", to: "Gewächshaus" },
          },
        },
      ],
      ACTOR,
    );

    const row = await valueOf(id);
    expect(row?.value).toBe("2");
    expect(row?.location).toBe("Gewächshaus");
    expect(await logFor(id)).toHaveLength(1);
  });

  test("refuses to write without a reason", async () => {
    const id = await seed("7");

    const result = await managed.updateRows(
      "measurements",
      [{ id, fields: { value: { from: "7", to: "8" } } }],
      { ...ACTOR, reason: "   " },
    );

    expect(result.ok).toBe(false);
    expect((await valueOf(id))?.value).toBe("7");
    expect(await logFor(id)).toHaveLength(0);
  });

  test("timestamps the entry from the database, not from the caller", async () => {
    const id = await seed("50");
    const before = Date.now();

    await managed.updateRows(
      "measurements",
      [{ id, fields: { value: { from: "50", to: "51" } } }],
      ACTOR,
    );

    // occurred_at defaults to now() and is never part of the INSERT, so there is
    // no field through which a caller could suggest a different moment - which
    // is what makes "who changed what, when" worth reading.
    const [row] = await app`
      SELECT occurred_at FROM audit_log WHERE row_id = ${id}::uuid
    `;
    const occurred = (row as { occurred_at: Date }).occurred_at.getTime();
    expect(occurred).toBeGreaterThanOrEqual(before - 1000);
    expect(occurred).toBeLessThanOrEqual(Date.now() + 1000);
  });

  test("refuses a column that is not editable", async () => {
    const id = await seed("5");

    const result = await managed.updateRows(
      "measurements",
      [{ id, fields: { device_eui: { from: deviceEui, to: "0000000000000000" } } }],
      ACTOR,
    );

    expect(result.ok).toBe(false);
    expect((await valueOf(id))?.value).toBe("5");
  });
});

describe.skipIf(!reachable)("a row someone else changed first", () => {
  test("is reported as a conflict and nothing is written", async () => {
    const id = await seed("10");
    // Someone else gets there first.
    await app`UPDATE measurements SET value = '11' WHERE id = ${id}`;

    const result = await managed.updateRows(
      "measurements",
      [{ id, fields: { value: { from: "10", to: "99" } } }],
      ACTOR,
    );

    expect(result.ok).toBe(true);
    expect(result.ok && result.data.kind).toBe("conflict");
    expect((await valueOf(id))?.value).toBe("11");
    expect(await logFor(id)).toHaveLength(0);
  });

  test("aborts the whole batch, so no part of it is saved", async () => {
    const fresh = await seed("20");
    const stale = await seed("30");
    await app`UPDATE measurements SET value = '31' WHERE id = ${stale}`;

    const result = await managed.updateRows(
      "measurements",
      [
        { id: fresh, fields: { value: { from: "20", to: "21" } } },
        { id: stale, fields: { value: { from: "30", to: "33" } } },
      ],
      ACTOR,
    );

    expect(result.ok && result.data.kind).toBe("conflict");
    // The first row was updated inside the transaction and rolled back with it.
    expect((await valueOf(fresh))?.value).toBe("20");
    expect(await logFor(fresh)).toHaveLength(0);
  });
});

describe.skipIf(!reachable)("deleting measurements", () => {
  test("records every removed row with its full contents", async () => {
    const ids = [await seed("41"), await seed("42"), await seed("43")];

    const result = await managed.deleteRows("measurements", ids, ACTOR);

    expect(result.ok).toBe(true);
    expect(result.ok && result.data.deleted).toBe(3);

    const [remaining] = await app`
      SELECT count(*)::int AS n FROM measurements WHERE id = ANY(${`{${ids.join(",")}}`}::uuid[])
    `;
    expect((remaining as { n: number }).n).toBe(0);

    const entries = await logFor(ids[0]!);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.action).toBe("delete");
    const before = (entries[0]!.changes as { before: Record<string, unknown> }).before;
    expect(before.value).toBe("41");
    expect(before.device_eui).toBe(deviceEui);
  });

  test("ties one action together with a single batch id", async () => {
    const ids = [await seed("51"), await seed("52")];

    const result = await managed.deleteRows("measurements", ids, ACTOR);
    expect(result.ok).toBe(true);

    const batches = new Set(
      (await Promise.all(ids.map(logFor))).flat().map((entry) => entry.batch_id),
    );
    expect(batches.size).toBe(1);
    expect(result.ok && batches.has(result.data.batchId)).toBe(true);
  });

  test("refuses to delete without a reason", async () => {
    const id = await seed("71");

    const result = await managed.deleteRows("measurements", [id], {
      ...ACTOR,
      reason: "",
    });

    expect(result.ok).toBe(false);
    expect((await valueOf(id))?.value).toBe("71");
  });

  test("counts what it actually removed, not what it was asked to", async () => {
    const id = await seed("61");
    const alreadyGone = crypto.randomUUID();

    const result = await managed.deleteRows("measurements", [id, alreadyGone], ACTOR);

    expect(result.ok && result.data.deleted).toBe(1);
  });
});

describe.skipIf(!reachable)("a deletion that runs in blocks", () => {
  test("stays one operation across every block", async () => {
    // Two blocks of one row, the way the route drives them: the first opens a
    // batch, the second is handed that batch and joins it.
    const first = await seed("81");
    const second = await seed("82");

    const opening = await managed.deleteRows("measurements", [first], ACTOR);
    expect(opening.ok).toBe(true);
    const batchId = opening.ok ? opening.data.batchId : "";

    const continuing = await managed.deleteRows(
      "measurements",
      [second],
      ACTOR,
      batchId,
    );
    expect(continuing.ok && continuing.data.batchId).toBe(batchId);

    // One batch, so the log shows one operation to look at and to take back -
    // not one per block.
    const batches = new Set(
      (await Promise.all([first, second].map(logFor)))
        .flat()
        .map((entry) => entry.batch_id),
    );
    expect(batches.size).toBe(1);
    expect(batches.has(batchId)).toBe(true);
  });

  test("still records every single row, block or no block", async () => {
    const first = await seed("83");
    const second = await seed("84");

    const opening = await managed.deleteRows("measurements", [first], ACTOR);
    const batchId = opening.ok ? opening.data.batchId : "";
    await managed.deleteRows("measurements", [second], ACTOR, batchId);

    for (const id of [first, second]) {
      const [entry] = await logFor(id);
      expect(entry?.action).toBe("delete");
      expect((entry?.changes as { before: { value: string } }).before.value).toBe(
        id === first ? "83" : "84",
      );
    }
  });

  test("refuses a batch that is not one, so nothing can be tacked onto a foreign operation", async () => {
    const id = await seed("85");

    const result = await managed.deleteRows(
      "measurements",
      [id],
      ACTOR,
      "not-a-uuid",
    );

    expect(result.ok).toBe(false);
    expect((await valueOf(id))?.value).toBe("85");
  });
});

describe.skipIf(!reachable)("counting what is left to delete", () => {
  test("is bounded by the preview, so rows arriving later are not counted in", async () => {
    const { measurements } = await import("./measurement");
    const filter = { device_eui: deviceEui, location: "Blockzaehlung" };

    await seed("91", "Blockzaehlung");
    await seed("92", "Blockzaehlung");
    const previewAt = new Date();

    // Arrives through the webhook a moment after the preview was taken.
    await new Promise((resolve) => setTimeout(resolve, 10));
    await seed("93", "Blockzaehlung");

    expect(await measurements.count(filter, previewAt)).toBe(2);
    expect(await measurements.count(filter)).toBe(3);
  });

  /**
   * The preview bound is a JavaScript Date and therefore only as fine as a
   * millisecond, while `created_at` is a `timestamptz` and holds microseconds. A
   * row written a few microseconds into the same millisecond as the preview was
   * once dropped from it by a plain `<=` - a row that was demonstrably already
   * there, since the preview happened after it. That made "shrinks by exactly
   * what a block removed" fail about one full test run in five.
   */
  test("counts a row written in the very millisecond of the preview", async () => {
    const { measurements } = await import("./measurement");
    const filter = { device_eui: deviceEui, location: "Mikrosekunde" };

    const id = await seed("97", "Mikrosekunde");
    // Exactly the boundary: the preview claims the millisecond the row carries,
    // but without the microseconds the row has on top of it.
    const [row] = await app`SELECT created_at FROM measurements WHERE id = ${id}`;
    const stored = new Date((row as { created_at: Date }).created_at);
    const previewAt = new Date(stored.getTime());

    expect(await measurements.count(filter, previewAt)).toBe(1);
    expect(await measurements.idsMatching(filter, 10, previewAt)).toContain(id);
  });

  test("shrinks by exactly what a block removed", async () => {
    const { measurements } = await import("./measurement");
    const filter = { device_eui: deviceEui, location: "Blockabbau" };

    await seed("94", "Blockabbau");
    await seed("95", "Blockabbau");
    await seed("96", "Blockabbau");
    const previewAt = new Date();

    // One block of two, exactly as the route asks for it.
    const block = await measurements.idsMatching(filter, 2, previewAt);
    expect(block.length).toBe(2);
    await managed.deleteRows("measurements", block, ACTOR);

    // The next call returns the next block rather than the same one: the set can
    // only shrink, which is what makes the loop resumable.
    expect(await measurements.count(filter, previewAt)).toBe(1);
    const next = await measurements.idsMatching(filter, 2, previewAt);
    expect(next.length).toBe(1);
    expect(block).not.toContain(next[0]!);
  });
});

describe.skipIf(!reachable)("log entries go through the same path", () => {
  test("a corrected message is written and recorded as its own table", async () => {
    const id = await seedLog("Batterie schwach");

    const result = await managed.updateRows(
      "log_entries",
      [{ id, fields: { message: { from: "Batterie schwach", to: "Batterie schwach (Sensor 3)" } } }],
      ACTOR,
    );

    expect(result.ok).toBe(true);
    const [row] = await app`SELECT message FROM log_entries WHERE id = ${id}::uuid`;
    expect((row as { message: string }).message).toBe("Batterie schwach (Sensor 3)");

    const entries = await logFor(id);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.changes).toEqual({
      fields: { message: { from: "Batterie schwach", to: "Batterie schwach (Sensor 3)" } },
    });

    const [logged] = await app`
      SELECT table_name FROM audit_log WHERE row_id = ${id}::uuid
    `;
    expect((logged as { table_name: string }).table_name).toBe("log_entries");
  });

  test("the origin of an entry is not editable", async () => {
    const id = await seedLog("Gerät gestartet");

    const result = await managed.updateRows(
      "log_entries",
      [{ id, fields: { device_eui: { from: deviceEui, to: "0000000000000000" } } }],
      ACTOR,
    );

    expect(result.ok).toBe(false);
    const [row] = await app`SELECT device_eui FROM log_entries WHERE id = ${id}::uuid`;
    expect((row as { device_eui: string }).device_eui).toBe(deviceEui);
  });

  test("a stale starting value writes nothing here either", async () => {
    const id = await seedLog("erste Fassung");
    await app`UPDATE log_entries SET message = 'jemand war schneller' WHERE id = ${id}::uuid`;

    const result = await managed.updateRows(
      "log_entries",
      [{ id, fields: { message: { from: "erste Fassung", to: "meine Fassung" } } }],
      ACTOR,
    );

    expect(result.ok && result.data.kind).toBe("conflict");
    const [row] = await app`SELECT message FROM log_entries WHERE id = ${id}::uuid`;
    expect((row as { message: string }).message).toBe("jemand war schneller");
    expect(await logFor(id)).toHaveLength(0);
  });

  test("a deleted entry leaves its full contents behind", async () => {
    const id = await seedLog("Testlauf Halle");

    const result = await managed.deleteRows("log_entries", [id], ACTOR);
    expect(result.ok && result.data.deleted).toBe(1);

    const entries = await logFor(id);
    expect(entries[0]!.action).toBe("delete");
    const before = (entries[0]!.changes as { before: Record<string, unknown> }).before;
    expect(before.message).toBe("Testlauf Halle");
    expect(before.device_eui).toBe(deviceEui);
  });
});

/** The log entries of a row, newest last, with the id of whatever undid them. */
const chainFor = async (id: string) => {
  const rows = (await app`
    SELECT id, action, reverts_id, changes
    FROM audit_log WHERE row_id = ${id}::uuid ORDER BY occurred_at, id
  `) as unknown as {
    id: string;
    action: string;
    reverts_id: string | null;
    changes: unknown;
  }[];
  return rows.map((row) => ({
    ...row,
    changes: typeof row.changes === "string" ? JSON.parse(row.changes) : row.changes,
  }));
};

describe.skipIf(!reachable)("taking a change back", () => {
  test("restores the old value and leaves the original entry standing", async () => {
    const id = await seed("235");
    await managed.updateRows(
      "measurements",
      [{ id, fields: { value: { from: "235", to: "23.5" } } }],
      ACTOR,
    );
    const [original] = await chainFor(id);

    const result = await managed.revertEntries([original!.id], {
      ...ACTOR,
      reason: "war doch richtig",
    });

    expect(result.ok).toBe(true);
    expect(result.ok && result.data.kind).toBe("reverted");
    expect((await valueOf(id))?.value).toBe("235");

    const chain = await chainFor(id);
    expect(chain).toHaveLength(2);
    // The first entry is untouched - undoing appends, it never rewrites.
    expect(chain[0]!.id).toBe(original!.id);
    expect(chain[0]!.changes).toEqual({ fields: { value: { from: "235", to: "23.5" } } });
    expect(chain[1]!.reverts_id).toBe(original!.id);
    expect(chain[1]!.changes).toEqual({ fields: { value: { from: "23.5", to: "235" } } });
  });

  test("puts a deleted row back with the id it had", async () => {
    const id = await seed("41", "Feldrand");
    await managed.deleteRows("measurements", [id], ACTOR);
    expect(await valueOf(id)).toBeUndefined();
    const [deletion] = await chainFor(id);

    const result = await managed.revertEntries([deletion!.id], {
      ...ACTOR,
      reason: "versehentlich gelöscht",
    });

    expect(result.ok).toBe(true);
    const restored = await valueOf(id);
    expect(restored?.value).toBe("41");
    expect(restored?.location).toBe("Feldrand");

    const chain = await chainFor(id);
    expect(chain.map((entry) => entry.action)).toEqual(["delete", "insert"]);
    expect(chain[1]!.reverts_id).toBe(deletion!.id);
  });

  test("can be taken back again - the chain never breaks", async () => {
    const id = await seed("7");
    await managed.updateRows(
      "measurements",
      [{ id, fields: { value: { from: "7", to: "8" } } }],
      ACTOR,
    );
    const [first] = await chainFor(id);

    await managed.revertEntries([first!.id], { ...ACTOR, reason: "zurück" });
    const undo = (await chainFor(id))[1]!;
    expect((await valueOf(id))?.value).toBe("7");

    const again = await managed.revertEntries([undo.id], { ...ACTOR, reason: "doch nicht" });

    expect(again.ok).toBe(true);
    expect((await valueOf(id))?.value).toBe("8");
    const chain = await chainFor(id);
    expect(chain).toHaveLength(3);
    expect(chain[2]!.reverts_id).toBe(undo.id);
    // All three are still there; nothing was ever removed.
    expect(new Set(chain.map((entry) => entry.id)).size).toBe(3);
  });

  test("refuses when the row no longer holds what the entry left behind", async () => {
    const id = await seed("50");
    await managed.updateRows(
      "measurements",
      [{ id, fields: { value: { from: "50", to: "51" } } }],
      ACTOR,
    );
    const [entry] = await chainFor(id);
    // Someone else moves it on before the undo happens.
    await app`UPDATE measurements SET value = '52' WHERE id = ${id}::uuid`;

    const result = await managed.revertEntries([entry!.id], { ...ACTOR, reason: "zurück" });

    expect(result.ok && result.data.kind).toBe("conflict");
    expect((await valueOf(id))?.value).toBe("52");
    expect(await chainFor(id)).toHaveLength(1);
  });

  test("needs a reason of its own", async () => {
    const id = await seed("60");
    await managed.updateRows(
      "measurements",
      [{ id, fields: { value: { from: "60", to: "61" } } }],
      ACTOR,
    );
    const [entry] = await chainFor(id);

    const result = await managed.revertEntries([entry!.id], { ...ACTOR, reason: "  " });

    expect(result.ok).toBe(false);
    expect((await valueOf(id))?.value).toBe("61");
  });
});
