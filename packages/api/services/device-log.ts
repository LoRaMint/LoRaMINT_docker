import { SQL } from "bun";
import { reading } from "./connections";
import { manage } from "../config";
import type { PaginationParams } from "../lib/pagination";
import type { Actor } from "./manage";
import type { CreateOutcome } from "./ttn";
import type { MutationResult } from "../types";

/**
 * The record of what the device pages did in The Things Network.
 *
 * Split the same way the change log is: reading runs on the application's own
 * connection like every other query, appending goes through DATABASE_URL_MANAGE,
 * a role that holds SELECT and INSERT on this table and nothing else. So "the
 * pages cannot tidy up their own log" is a fact about the database rather than a
 * claim about this file.
 *
 * Why not `audit_log`: see migrations/004-device-log.ts. In short, every entry
 * there is a database row that can be written back, and a device in TTN is not.
 */

//====================================
// TYPES
//====================================

export type DeviceAction = "create" | "rename";

/** Whether the operation went through, went half through, or did not. */
export type DeviceOutcome = "ok" | "partial" | "failed";

export type DeviceLogEntry = {
  id: string;
  occurred_at: Date;
  username: string;
  display_name: string | null;
  action: DeviceAction;
  device_id: string;
  device_eui: string | null;
  outcome: DeviceOutcome;
  details: Record<string, unknown>;
  reason: string | null;
};

//====================================
// READING
//====================================

/** The log, newest first. */
const list = async (pagination: PaginationParams) => {
  const [rows, counted] = await Promise.all([
    reading()`
      SELECT id, occurred_at, username, display_name, action, device_id,
             device_eui, outcome, details, reason
        FROM device_log
       ORDER BY occurred_at DESC, id DESC
       LIMIT ${pagination.perPage} OFFSET ${pagination.offset}
    `,
    reading()`SELECT count(*)::int AS count FROM device_log`,
  ]);

  const entries = (rows as unknown as Record<string, unknown>[]).map((row) => ({
    ...row,
    // jsonb comes back as a string from some driver paths and as an object from
    // others; the page should not have to know which.
    details:
      typeof row.details === "string"
        ? (JSON.parse(row.details) as Record<string, unknown>)
        : ((row.details ?? {}) as Record<string, unknown>),
  })) as DeviceLogEntry[];

  const total = (counted as unknown as { count: number }[])[0]?.count ?? 0;
  return { rows: entries, total };
};

//====================================
// APPENDING
//====================================

/**
 * Created on first use, so importing this module opens no connection - the
 * feature is optional and the tests import it for the pure parts.
 */
let client: SQL | null = null;
const writeClient = () => {
  if (!manage.databaseUrl) return null;
  if (!client) client = new SQL(manage.databaseUrl);
  return client;
};

const NOT_CONFIGURED =
  "Das Protokollieren von Gerätevorgängen ist auf diesem Server nicht eingerichtet.";

const append = async (
  entry: {
    action: DeviceAction;
    deviceId: string;
    devEui: string | null;
    outcome: DeviceOutcome;
    details: Record<string, unknown>;
  },
  actor: Actor,
): Promise<MutationResult<null>> => {
  const write = writeClient();
  if (!write) return { ok: false, error: NOT_CONFIGURED };

  try {
    // ::text::jsonb rather than ::jsonb: against a jsonb parameter the driver
    // encodes the string a second time and the details arrive as a jsonb
    // *string* holding JSON - readable, useless to query. Same detour as in
    // services/manage.ts.
    await write`
      INSERT INTO device_log
        (username, display_name, action, device_id, device_eui, outcome, details, reason)
      VALUES (
        ${actor.username}, ${actor.displayName}, ${entry.action}, ${entry.deviceId},
        ${entry.devEui}, ${entry.outcome},
        ${JSON.stringify(entry.details)}::text::jsonb, ${actor.reason}
      )
    `;
    return { ok: true, data: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("device-log: append failed:", message);
    return { ok: false, error: message.split("\n")[0]! };
  }
};

//====================================
// THE TWO OPERATIONS
//====================================

/**
 * Turns a registration attempt into a log entry.
 *
 * The outcome is read off the attempt rather than passed in, so no caller can
 * record a half-finished registration as a clean one:
 *
 *   ok       all four servers took the device.
 *   failed   one refused, and everything already registered was removed again -
 *            nothing is left in TTN.
 *   partial  one refused *and* the cleanup did not get everything back. This is
 *            the state somebody has to go into the console for, so it is worth a
 *            word of its own in the log rather than being folded into "failed".
 */
const recordCreate = (
  outcome: CreateOutcome,
  devEui: string,
  actor: Actor,
): Promise<MutationResult<null>> =>
  append(
    {
      action: "create",
      deviceId: outcome.deviceId,
      devEui,
      outcome:
        outcome.failed === null
          ? "ok"
          : outcome.leftovers.length > 0
            ? "partial"
            : "failed",
      details: {
        done: outcome.done,
        failed: outcome.failed,
        leftovers: outcome.leftovers,
      },
    },
    actor,
  );

/** A rename is one call and either happened or did not. */
const recordRename = (
  deviceId: string,
  devEui: string | null,
  change: { from: string | null; to: string },
  error: string | null,
  actor: Actor,
): Promise<MutationResult<null>> =>
  append(
    {
      action: "rename",
      deviceId,
      devEui,
      outcome: error === null ? "ok" : "failed",
      details: error === null ? { name: change } : { name: change, error },
    },
    actor,
  );

//====================================
// PUBLIC API
//====================================

export const deviceLog = {
  list,
  recordCreate,
  recordRename,
};
