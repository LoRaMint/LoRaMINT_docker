import { ingesting, reading } from "./connections";
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

/**
 * Writes one measurement, through the connection that may do nothing else.
 *
 * Id and arrival time are made here rather than read back, and that is not a
 * detail: `INSERT ... RETURNING` needs SELECT on the columns it returns, which
 * would mean granting the webhook's role the right to read the whole table. The
 * route reachable from the internet would then be able to read every
 * measurement this application has ever stored. Generating both is what lets the
 * role hold `INSERT` and nothing else - it was measured, not assumed: with
 * RETURNING the insert fails with "permission denied for table measurements".
 *
 * Both values are also written explicitly rather than left to the column
 * defaults, so what comes back describes the row that is actually there.
 */
const store = async (data: ValidatedMeasurement): Promise<MutationResult<Measurement>> => {
  const id = crypto.randomUUID();
  const createdAt = new Date();

  await ingesting()`
    INSERT INTO measurements (id, device_eui, measurand, unit, datatype, sensor, location, value, time_method, recorded_at, created_at)
    VALUES (${id}::uuid, ${data.deviceEui}, ${data.measurand}, ${data.unit}, ${data.datatype}, ${data.sensor}, ${data.location}, ${data.value}, ${data.timeMethod}, ${data.recordedAt}, ${createdAt})
  `;

  return {
    ok: true,
    data: {
      id,
      deviceEui: data.deviceEui,
      measurand: data.measurand,
      unit: data.unit,
      datatype: data.datatype,
      sensor: data.sensor,
      location: data.location,
      value: data.value,
      timeMethod: data.timeMethod,
      recordedAt: data.recordedAt,
      createdAt,
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
  return reading()`
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
    reading()`SELECT DISTINCT device_eui AS v FROM measurements ${where} ORDER BY v`,
    reading()`SELECT DISTINCT measurand  AS v FROM measurements ${where} ORDER BY v`,
    reading()`SELECT DISTINCT sensor     AS v FROM measurements ${where} ORDER BY v`,
    reading()`SELECT DISTINCT location   AS v FROM measurements ${where} ORDER BY v`,
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
 * How much has arrived per device, and when the last of it did.
 *
 * The device overview joins this against what The Things Network has registered,
 * which is the only way to tell the three interesting cases apart: a device that
 * is registered and sending, one that is registered and silent, and measurements
 * arriving under an EUI that TTN no longer knows. That last one is invisible from
 * either side alone.
 *
 * Keyed by the upper-case EUI, because TTN writes them upper case and the rows
 * hold whatever the webhook was sent - a device that matched only in case would
 * otherwise appear twice.
 */
const deviceActivity = async (): Promise<
  Map<string, { count: number; lastSeen: Date | null }>
> => {
  const rows = await reading()`
    SELECT upper(device_eui) AS eui,
           count(*)::int AS n,
           max(COALESCE(recorded_at, created_at)) AS last_seen
      FROM measurements
     GROUP BY upper(device_eui)
  `;
  return new Map(
    (rows as Record<string, unknown>[]).map((r) => [
      r.eui as string,
      { count: Number(r.n), lastSeen: (r.last_seen as Date | null) ?? null },
    ]),
  );
};

/**
 * Status board data: the latest measurement per (device_eui, sensor), together
 * with how many measurements that pair has sent, ordered by most recent
 * activity first. Uses window functions so the newest row and the count come
 * from a single scan.
 */
const status = async (): Promise<SensorStatus[]> => {
  const rows = await reading()`
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
  const rows = await reading()`
    SELECT id, device_eui, measurand, unit, datatype, sensor, location, value, time_method, recorded_at, created_at
    FROM measurements
    ${where}
    ORDER BY created_at DESC
    LIMIT ${pagination.perPage} OFFSET ${pagination.offset}
  `;
  const [{ count }] = await reading()`SELECT count(*)::int AS count FROM measurements ${where}`;
  return { items: rows.map(mapRow), total: count as number };
};

//====================================
// MANAGEMENT
//====================================

/**
 * What the management table may sort by, each mapped to the expression it orders
 * by.
 *
 * A whitelist rather than a parameter, because an identifier cannot be
 * parameterised: nothing a caller sends ever reaches the statement, only the key
 * it matched. `recorded_at` sorts by the same COALESCE the time filter uses, so
 * a measurement without its own timestamp still lands where it belongs.
 */
const SORT_EXPRESSIONS: Record<string, string> = {
  recorded_at: "COALESCE(recorded_at, created_at)",
  created_at: "created_at",
  value: "value",
  measurand: "measurand",
  sensor: "sensor",
  location: "location",
  device_eui: "device_eui",
};

/**
 * Rows for the management table, with the database's own column names.
 *
 * Unlike `list`, this does not map to camelCase: the table builds its form
 * fields from these keys, and they have to be the names the update statement
 * uses. One spelling, from the column to the input and back.
 */
const listRows = async (
  pagination: PaginationParams,
  filter: MeasurementFilter = {},
  sort: { column: string; direction: "asc" | "desc" } = {
    column: "recorded_at",
    direction: "desc",
  },
) => {
  const where = filterClause(filter);
  const expression = SORT_EXPRESSIONS[sort.column] ?? SORT_EXPRESSIONS.recorded_at!;
  // Appending id keeps the order total: rows sharing a timestamp would otherwise
  // be free to swap places between two pages and hide one of themselves.
  const order = reading().unsafe(
    `${expression} ${sort.direction === "asc" ? "ASC" : "DESC"}, id`,
  );
  const rows = await reading()`
    SELECT id, device_eui, measurand, unit, datatype, sensor, location, value, time_method, recorded_at, created_at
    FROM measurements
    ${where}
    ORDER BY ${order}
    LIMIT ${pagination.perPage} OFFSET ${pagination.offset}
  `;
  const [{ count }] = await reading()`SELECT count(*)::int AS count FROM measurements ${where}`;
  return {
    rows: rows as unknown as Record<string, unknown>[],
    total: count as number,
  };
};

/**
 * The ids matching a filter, for a deletion that was previewed by filter.
 *
 * `createdBefore` is the moment the preview was taken. Bounding on `created_at`
 * rather than on the filter's own time range is what keeps a measurement that
 * arrived through the webhook in the seconds since then out of a deletion that
 * never showed it: the set can shrink between preview and confirmation, but it
 * cannot grow.
 *
 * The bound covers the whole millisecond `createdBefore` names, and that is not
 * sloppiness. A JavaScript Date holds milliseconds, `timestamptz` holds
 * microseconds, so a row written 7 µs into the same millisecond as the preview
 * would fall outside a plain `<=` - a row that was demonstrably already there
 * when the preview was taken, since the preview is what happened afterwards.
 * `< bound + 1ms` includes it, and keeps the column bare so an index on it is
 * still usable, which `date_trunc(...) <= bound` would not.
 */
const idsMatching = async (
  filter: MeasurementFilter,
  limit: number,
  createdBefore: Date | null = null,
) => {
  const rows = await reading()`
    SELECT id FROM measurements
    ${filterClause(filter)}
      AND (${createdBefore}::timestamptz IS NULL
           OR created_at < ${createdBefore}::timestamptz + interval '1 millisecond')
    ORDER BY created_at
    LIMIT ${limit}
  `;
  return (rows as unknown as { id: string }[]).map((row) => row.id);
};

/** The current state of specific rows, for previewing and for validation. */
const byIds = async (ids: string[]) => {
  if (ids.length === 0) return [];
  const rows = await reading()`
    SELECT id, device_eui, measurand, unit, datatype, sensor, location, value, time_method, recorded_at, created_at
    FROM measurements WHERE id = ANY(${`{${ids.join(",")}}`}::uuid[])
    ORDER BY COALESCE(recorded_at, created_at) DESC, id
  `;
  return rows as unknown as Record<string, unknown>[];
};

/**
 * Whether a corrected field may be stored, checked against the row's *stored*
 * datatype rather than anything the form claimed.
 *
 * Returns a German sentence naming the problem, or null when the value is fine.
 * The rules are the ones an incoming measurement already has to satisfy, so a
 * correction cannot produce a row the webhook could never have written.
 */
const validateField = (
  datatype: Datatype,
  column: string,
  value: string | null,
): string | null => {
  if (column === "value") {
    if (value === null) return "Der Wert darf nicht leer sein.";
    return validateValue(datatype, value)
      ? datatype === "string"
        ? "Der Wert darf höchstens 20 Zeichen haben."
        : `Der Wert muss eine Zahl sein (Datentyp ${datatype}).`
      : null;
  }
  if (column === "recorded_at") {
    // Empty is allowed: a measurement may legitimately carry no time of its own.
    if (value === null) return null;
    return Number.isNaN(Date.parse(value))
      ? "Der Zeitpunkt muss ein Datum sein, z. B. 2026-07-31T14:23:00Z."
      : null;
  }
  if (value === null) return "Das Feld darf nicht leer sein.";
  if (value.length > 40) return "Das Feld darf höchstens 40 Zeichen haben.";
  return null;
};

/**
 * How many rows match, optionally bounded like `idsMatching`.
 *
 * `createdBefore` exists for the same reason it does there: a deletion that runs
 * in blocks asks after every block how much is left, and that question has to be
 * about the set that was previewed - not about one that has grown through the
 * webhook in the meantime.
 */
const count = async (
  filter: MeasurementFilter = {},
  createdBefore: Date | null = null,
) => {
  const [row] = await reading()`
    SELECT count(*)::int AS count FROM measurements
    ${filterClause(filter)}
      AND (${createdBefore}::timestamptz IS NULL
           OR created_at < ${createdBefore}::timestamptz + interval '1 millisecond')
  `;
  return (row as { count: number }).count;
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
      const rows = await reading()`
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

export const measurements = {
  validate,
  store,
  ingest,
  list,
  metadata,
  deviceActivity,
  status,
  exportCsvStream,
  filterClause,
  listRows,
  idsMatching,
  byIds,
  count,
  validateField,
};
