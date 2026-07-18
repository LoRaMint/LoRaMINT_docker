import { sql } from "bun";
import type { PaginationParams } from "../lib/pagination";
import type {
  Datatype,
  Measurement,
  MeasurementFilter,
  MutationResult,
  SensorStatus,
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

/**
 * Builds a `WHERE` fragment matching the given filter's fields; absent
 * fields don't constrain the result (each clause is a tautology when its
 * value is null). Safe from SQL injection: all values remain parameterized,
 * only the fragment structure is assembled dynamically.
 */
const filterClause = (filter: MeasurementFilter) => {
  const from = filter.from ? new Date(filter.from) : null;
  const to = filter.to ? new Date(filter.to) : null;
  return sql`
    WHERE (${filter.device_eui ?? null}::text IS NULL OR device_eui = ${filter.device_eui ?? null})
      AND (${filter.measurand ?? null}::text  IS NULL OR measurand  = ${filter.measurand  ?? null})
      AND (${filter.sensor ?? null}::text     IS NULL OR sensor     = ${filter.sensor     ?? null})
      AND (${filter.location ?? null}::text   IS NULL OR location   = ${filter.location   ?? null})
      AND (${filter.datatype ?? null}::text   IS NULL OR datatype   = ${filter.datatype   ?? null})
      AND (${from}::timestamptz IS NULL OR COALESCE(recorded_at, created_at) >= ${from})
      AND (${to}::timestamptz   IS NULL OR COALESCE(recorded_at, created_at) <= ${to})
  `;
};

/**
 * Distinct values present in the measurements table, for populating the
 * filter dropdowns on the /plots page. An optional `device_eui` filter narrows
 * the measurands/sensors/locations to those of a single device (cascading
 * dropdowns); all other filter fields are ignored via `filterClause`'s
 * null-tautology clauses.
 */
const metadata = async (filter: MeasurementFilter = {}) => {
  const where = filterClause({ device_eui: filter.device_eui });
  const [devices, measurands, sensors, locations] = await Promise.all([
    sql`SELECT DISTINCT device_eui AS v FROM measurements ${where} ORDER BY v`,
    sql`SELECT DISTINCT measurand  AS v FROM measurements ${where} ORDER BY v`,
    sql`SELECT DISTINCT sensor     AS v FROM measurements ${where} ORDER BY v`,
    sql`SELECT DISTINCT location   AS v FROM measurements ${where} ORDER BY v`,
  ]);
  const values = (rows: Record<string, unknown>[]) =>
    rows.map((r) => r.v as string).filter((v) => v != null);
  return {
    devices: values(devices),
    measurands: values(measurands),
    sensors: values(sensors),
    locations: values(locations),
  };
};

/**
 * Status board data: the latest measurement per (device_eui, sensor), together
 * with how many measurements that pair has sent, ordered by most recent
 * activity first. Uses window functions so the newest row and the count come
 * from a single scan.
 */
const status = async (): Promise<SensorStatus[]> => {
  const rows = await sql`
    SELECT device_eui, sensor, location, measurand, unit, value, last_seen, n
    FROM (
      SELECT device_eui, sensor, location, measurand, unit, value,
             COALESCE(recorded_at, created_at) AS last_seen,
             count(*) OVER (PARTITION BY device_eui, sensor) AS n,
             row_number() OVER (
               PARTITION BY device_eui, sensor
               ORDER BY COALESCE(recorded_at, created_at) DESC
             ) AS rn
      FROM measurements
    ) t
    WHERE rn = 1
    ORDER BY last_seen DESC
  `;
  return (rows as Record<string, unknown>[]).map((r) => ({
    deviceEui: r.device_eui as string,
    sensor: r.sensor as string,
    location: r.location as string,
    measurand: r.measurand as string,
    unit: r.unit as string,
    value: r.value as string,
    lastSeen: r.last_seen as Date,
    count: Number(r.n),
  }));
};

const list = async (pagination: PaginationParams, filter: MeasurementFilter = {}) => {
  const where = filterClause(filter);
  const rows = await sql`
    SELECT id, device_eui, measurand, unit, datatype, sensor, location, value, time_method, recorded_at, created_at
    FROM measurements
    ${where}
    ORDER BY created_at DESC
    LIMIT ${pagination.perPage} OFFSET ${pagination.offset}
  `;
  const [{ count }] = await sql`SELECT count(*)::int AS count FROM measurements ${where}`;
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

/**
 * Escape a value for CSV output: wrap in quotes and double internal quotes, and
 * neutralize spreadsheet formula injection by prefixing a leading =, +, -, @,
 * tab or CR with a single quote.
 */
export const escapeCsvField = (value: unknown) => {
  let s = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
};

/** Streams measurements matching the given filter as CSV using chunked transfer encoding. */
const exportCsvStream = (filter: MeasurementFilter = {}) => {
  const encoder = new TextEncoder();
  const header = "id,device_eui,measurand,unit,datatype,sensor,location,value,time_method,recorded_at,created_at\n";

  return new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(header));
      const rows = await sql`
        SELECT id, device_eui, measurand, unit, datatype, sensor, location, value, time_method, recorded_at, created_at
        FROM measurements
        ${filterClause(filter)}
        ORDER BY created_at DESC
      `;
      for (const r of rows as Record<string, unknown>[]) {
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
        const line = fields.map(escapeCsvField).join(",") + "\n";
        controller.enqueue(encoder.encode(line));
      }
      controller.close();
    },
  });
};

export const measurements = { validate, store, ingest, list, metadata, status, exportCsvStream, filterClause };
