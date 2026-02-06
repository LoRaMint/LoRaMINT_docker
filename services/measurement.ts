import { sql } from "bun";
import type { PaginationParams } from "../lib/pagination";
import type {
  Datatype,
  Measurement,
  MutationResult,
  TimeMethod,
  TtnDecodedPayload,
  ValidatedMeasurement,
} from "../types";

//====================================
// CONSTANTS
//====================================

const VALID_DATATYPES = new Set<string>(["float", "integer", "string"]);
const VALID_TIME_METHODS = new Set<string>(["server", "custom", "none"]);
const HEX_PATTERN = /^[0-9A-Fa-f]{16}$/;

//====================================
// VALIDATION
//====================================

const validateStringField = (name: string, value: unknown, maxLength: number) => {
  if (typeof value !== "string" || value.trim().length === 0) return `${name} must be a non-empty string`;
  if (value.length > maxLength) return `${name} must be at most ${maxLength} characters`;
  return null;
};

const validateValue = (datatype: Datatype, value: unknown) => {
  if (value === undefined || value === null) return "value is required";

  if (datatype === "integer") {
    const num = Number(value);
    if (!Number.isFinite(num)) return "value must be a valid number for integer datatype";
    return null;
  }

  if (datatype === "float") {
    const num = Number(value);
    if (!Number.isFinite(num)) return "value must be a valid number for float datatype";
    return null;
  }

  // string
  const str = String(value);
  if (str.length > 20) return "string value must be at most 20 characters";
  return null;
};

const coerceValue = (datatype: Datatype, value: unknown) => {
  if (datatype === "integer") return String(Math.trunc(Number(value)));
  if (datatype === "float") return String(Number(value));
  return String(value);
};

const resolveTimestamp = (method: TimeMethod, timevalue: unknown): MutationResult<Date | null> => {
  if (method === "server") return { ok: true, data: new Date() };
  if (method === "none") return { ok: true, data: null };

  // custom
  const ts = Number(timevalue);
  if (!Number.isFinite(ts) || ts < 0)
    return { ok: false, error: "timevalue must be a positive number for custom time method" };
  return { ok: true, data: new Date(ts * 1000) };
};

const validate = (payload: TtnDecodedPayload, deviceEui: string): MutationResult<ValidatedMeasurement> => {
  // Device EUI
  if (!HEX_PATTERN.test(deviceEui)) return { ok: false, error: "device_eui must be exactly 16 hex characters" };

  // Datatype
  const rawDatatype = typeof payload.datatype === "string" ? payload.datatype.toLowerCase() : "";
  if (!VALID_DATATYPES.has(rawDatatype)) return { ok: false, error: `datatype must be one of: float, integer, string` };
  const datatype = rawDatatype as Datatype;

  // String fields
  for (const [name, value] of [
    ["location", payload.location],
    ["measurand", payload.measurand],
    ["sensor", payload.sensor],
    ["unit", payload.unit],
  ] as const) {
    const err = validateStringField(name, value, 40);
    if (err) return { ok: false, error: err };
  }

  // Value
  const valueErr = validateValue(datatype, payload.value);
  if (valueErr) return { ok: false, error: valueErr };

  // Time method
  const rawTimeMethod = payload.timemethode ?? "";
  if (!VALID_TIME_METHODS.has(rawTimeMethod))
    return { ok: false, error: `timemethode must be one of: server, custom, none` };
  const timeMethod = rawTimeMethod as TimeMethod;

  // Timestamp
  const timestampResult = resolveTimestamp(timeMethod, payload.timevalue);
  if (!timestampResult.ok) return timestampResult;

  return {
    ok: true,
    data: {
      deviceEui,
      measurand: payload.measurand!,
      unit: payload.unit!,
      datatype,
      sensor: payload.sensor!,
      location: payload.location!,
      value: coerceValue(datatype, payload.value),
      timeMethod,
      recordedAt: timestampResult.data,
    },
  };
};

//====================================
// STORAGE
//====================================

const store = async (data: ValidatedMeasurement): Promise<MutationResult<Measurement>> => {
  const [row] = await sql`
    INSERT INTO measurements (device_eui, measurand, unit, datatype, sensor, location, value, time_method, recorded_at)
    VALUES (${data.deviceEui}, ${data.measurand}, ${data.unit}, ${data.datatype}, ${data.sensor}, ${data.location}, ${data.value}, ${data.timeMethod}, ${data.recordedAt})
    RETURNING id, device_eui, measurand, unit, datatype, sensor, location, value, time_method, recorded_at, created_at
  `;

  return {
    ok: true,
    data: {
      id: row.id,
      deviceEui: row.device_eui,
      measurand: row.measurand,
      unit: row.unit,
      datatype: row.datatype,
      sensor: row.sensor,
      location: row.location,
      value: row.value,
      timeMethod: row.time_method,
      recordedAt: row.recorded_at,
      createdAt: row.created_at,
    },
  };
};

//====================================
// QUERIES
//====================================

const mapRow = (row: Record<string, unknown>): Measurement => ({
  id: row.id as string,
  deviceEui: row.device_eui as string,
  measurand: row.measurand as string,
  unit: row.unit as string,
  datatype: row.datatype as Datatype,
  sensor: row.sensor as string,
  location: row.location as string,
  value: row.value as string,
  timeMethod: row.time_method as TimeMethod,
  recordedAt: row.recorded_at as Date | null,
  createdAt: row.created_at as Date,
});

const list = async (pagination: PaginationParams) => {
  const rows = await sql`
    SELECT id, device_eui, measurand, unit, datatype, sensor, location, value, time_method, recorded_at, created_at
    FROM measurements
    ORDER BY created_at DESC
    LIMIT ${pagination.perPage} OFFSET ${pagination.offset}
  `;
  const [{ count }] = await sql`SELECT count(*)::int AS count FROM measurements`;
  return { items: rows.map(mapRow), total: count as number };
};

//====================================
// PUBLIC API
//====================================

/** Validate + store a measurement in one call. */
const ingest = async (payload: TtnDecodedPayload, deviceEui: string): Promise<MutationResult<Measurement>> => {
  const validated = validate(payload, deviceEui);
  if (!validated.ok) return validated;
  return store(validated.data);
};

/** Returns all measurements as CSV string. */
const exportCsv = async () => {
  const rows = await sql`
    SELECT id, device_eui, measurand, unit, datatype, sensor, location, value, time_method, recorded_at, created_at
    FROM measurements
    ORDER BY created_at DESC
  `;

  const header = "id,device_eui,measurand,unit,datatype,sensor,location,value,time_method,recorded_at,created_at";
  const csvRows = rows.map((r: Record<string, unknown>) => {
    const fields = [
      r.id,
      r.device_eui,
      r.measurand,
      r.unit,
      r.datatype,
      r.sensor,
      r.location,
      r.value,
      r.time_method,
      r.recorded_at ? (r.recorded_at as Date).toISOString() : "",
      (r.created_at as Date).toISOString(),
    ];
    return fields.map((f) => `"${String(f ?? "").replace(/"/g, '""')}"`).join(",");
  });

  return [header, ...csvRows].join("\n");
};

export const measurements = { validate, store, ingest, list, exportCsv };
