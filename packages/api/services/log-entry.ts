import { sql } from "bun";
import type { PaginationParams } from "../lib/pagination";
import type { LogEntry, LogStatus, MutationResult, TtnDecodedPayload, ValidatedLogEntry } from "../types";

//====================================
// CONSTANTS
//====================================

const HEX_PATTERN = /^[0-9A-Fa-f]{16}$/;

//====================================
// VALIDATION
//====================================

const validate = (payload: TtnDecodedPayload, deviceEui: string): MutationResult<ValidatedLogEntry> => {
  if (!HEX_PATTERN.test(deviceEui)) return { ok: false, error: "device_eui must be exactly 16 hex characters" };

  if (typeof payload.message !== "string" || payload.message.trim().length === 0)
    return { ok: false, error: "message must be a non-empty string" };

  if (payload.message.length > 200) return { ok: false, error: "message must be at most 200 characters" };

  return {
    ok: true,
    data: { deviceEui, message: payload.message },
  };
};

//====================================
// STORAGE
//====================================

const store = async (data: ValidatedLogEntry): Promise<MutationResult<LogEntry>> => {
  const [row] = await sql`
    INSERT INTO log_entries (device_eui, message)
    VALUES (${data.deviceEui}, ${data.message})
    RETURNING id, device_eui, message, created_at
  `;

  return {
    ok: true,
    data: {
      id: row.id,
      deviceEui: row.device_eui,
      message: row.message,
      createdAt: row.created_at,
    },
  };
};

//====================================
// QUERIES
//====================================

const mapRow = (row: Record<string, unknown>): LogEntry => ({
  id: row.id as string,
  deviceEui: row.device_eui as string,
  message: row.message as string,
  createdAt: row.created_at as Date,
});

const list = async (pagination: PaginationParams) => {
  const rows = await sql`
    SELECT id, device_eui, message, created_at
    FROM log_entries
    ORDER BY created_at DESC
    LIMIT ${pagination.perPage} OFFSET ${pagination.offset}
  `;
  const [{ count }] = await sql`SELECT count(*)::int AS count FROM log_entries`;
  return { items: rows.map(mapRow), total: count as number };
};

/**
 * Status board data: the latest log entry per device_eui, plus how many log
 * entries that device has sent, ordered by most recent activity first.
 */
const status = async (): Promise<LogStatus[]> => {
  const rows = await sql`
    SELECT device_eui, message, last_seen, n
    FROM (
      SELECT device_eui, message, created_at AS last_seen,
             count(*) OVER (PARTITION BY device_eui) AS n,
             row_number() OVER (
               PARTITION BY device_eui
               ORDER BY created_at DESC
             ) AS rn
      FROM log_entries
    ) t
    WHERE rn = 1
    ORDER BY last_seen DESC
  `;
  return (rows as Record<string, unknown>[]).map((r) => ({
    deviceEui: r.device_eui as string,
    message: r.message as string,
    lastSeen: r.last_seen as Date,
    count: Number(r.n),
  }));
};

//====================================
// PUBLIC API
//====================================

/** Validate + store a log entry in one call. */
const ingest = async (payload: TtnDecodedPayload, deviceEui: string): Promise<MutationResult<LogEntry>> => {
  const validated = validate(payload, deviceEui);
  if (!validated.ok) return validated;
  return store(validated.data);
};

export const logEntries = { validate, store, ingest, list, status };
