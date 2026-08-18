import { reading, writing } from "./connections";
import { HEX_PATTERN } from "./measurement";

/**
 * Curated entries for the public /board page.
 *
 * An entry names a (device_eui, sensor, measurand) triple and how to scale its
 * gauge - it holds no measurement data itself. Board membership (see
 * lib/roles.ts) decides who may write here; /board itself reads without any
 * role at all, the same connection every anonymous visitor gets, so a triple
 * whose measurements are not `public_read` simply renders without a value.
 */

//====================================
// TYPES
//====================================

export type RangeMode = "fixed" | "dynamic";

export type DashboardEntry = {
  id: string;
  name: string;
  deviceEui: string;
  sensor: string;
  measurand: string;
  rangeMode: RangeMode;
  minValue: number | null;
  maxValue: number | null;
  createdAt: Date;
  createdBy: string | null;
};

export type EntryInput = {
  name: string;
  deviceEui: string;
  sensor: string;
  measurand: string;
  rangeMode: RangeMode;
  minValue: number | null;
  maxValue: number | null;
};

/** One tile on the board: an entry, its latest value, and its resolved range. */
export type BoardTile = {
  entry: DashboardEntry;
  unit: string | null;
  value: number | null;
  /** When the latest value was recorded, or null with no matching measurement yet. */
  lastSeen: Date | null;
  min: number;
  max: number;
  /** False when a dynamic entry has no (or degenerate) measurement history yet. */
  hasRange: boolean;
};

export type DashboardResult = { ok: true } | { ok: false; error: string };

//====================================
// VALIDATION
//====================================

/**
 * Checks an entry's shape before it reaches the database.
 *
 * Exported and pure so the fixed/dynamic rule - the one thing here that must
 * not be got wrong - can be tested without a connection. The database repeats
 * the same check (migrations/008-dashboard-entries.ts) because the SQL console
 * can write this table directly; this is the message a form gets to show.
 */
export const validateEntry = (input: EntryInput): string | null => {
  if (input.name.trim().length === 0) return "Der Name darf nicht leer sein.";
  if (input.name.length > 100) return "Der Name ist zu lang (höchstens 100 Zeichen).";
  if (!HEX_PATTERN.test(input.deviceEui)) {
    return "Die Device-EUI muss aus genau 16 Hex-Zeichen bestehen.";
  }
  if (input.sensor.trim().length === 0) return "Der Sensor darf nicht leer sein.";
  if (input.measurand.trim().length === 0) return "Die Messgröße darf nicht leer sein.";

  if (input.rangeMode === "fixed") {
    if (input.minValue === null || input.maxValue === null) {
      return "Bei fester Spanne müssen Minimal- und Maximalwert gesetzt sein.";
    }
    if (!(input.minValue < input.maxValue)) {
      return "Der Minimalwert muss kleiner als der Maximalwert sein.";
    }
  } else if (input.minValue !== null || input.maxValue !== null) {
    return "Bei dynamischer Spanne dürfen keine festen Werte gesetzt sein.";
  }

  return null;
};

/**
 * The fraction of the gauge's arc that `value` should fill, clamped to [0, 1].
 *
 * Exported and pure for the same reason as `validateEntry`: this is the one
 * piece of gauge math that must not silently drift.
 */
export const fillFraction = (value: number, min: number, max: number): number => {
  if (!(max > min)) return 0;
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
};

//====================================
// READING
//====================================

const mapEntry = (row: Record<string, unknown>): DashboardEntry => ({
  id: row.id as string,
  name: row.name as string,
  deviceEui: row.device_eui as string,
  sensor: row.sensor as string,
  measurand: row.measurand as string,
  rangeMode: row.range_mode as RangeMode,
  minValue: row.min_value === null ? null : Number(row.min_value),
  maxValue: row.max_value === null ? null : Number(row.max_value),
  createdAt: row.created_at as Date,
  createdBy: (row.created_by as string | null) ?? null,
});

export const listEntries = async (): Promise<DashboardEntry[]> => {
  const rows = await reading()`
    SELECT id, name, device_eui, sensor, measurand, range_mode, min_value, max_value,
           created_at, created_by
    FROM dashboard_entries
    ORDER BY name
  `;
  return (rows as Record<string, unknown>[]).map(mapEntry);
};

export type Triple = { deviceEui: string; sensor: string; measurand: string };

/**
 * The (device_eui, sensor, measurand) triples that have actually occurred
 * together in the measurements table.
 *
 * Not three independent lists: a device, a sensor and a measurand each drawn
 * from their own distinct values can name a combination that never happened -
 * this device with a sensor it does not have, say - and an entry for it would
 * silently show no value forever. The "new entry" form embeds this list and
 * keeps its device/sensor/measurand selects in step with each other from it
 * (board-page.tsx); `createEntry` below checks the same rule again server-side,
 * since that script is what a "no JS" visitor or a direct POST does not run.
 */
export const knownTriples = async (): Promise<Triple[]> => {
  const rows = await reading()`
    SELECT DISTINCT device_eui, sensor, measurand
    FROM measurements
    ORDER BY device_eui, sensor, measurand
  `;
  return (rows as Record<string, unknown>[]).map((row) => ({
    deviceEui: row.device_eui as string,
    sensor: row.sensor as string,
    measurand: row.measurand as string,
  }));
};

const tripleExists = async (deviceEui: string, sensor: string, measurand: string): Promise<boolean> => {
  const rows = await reading()`
    SELECT 1 FROM measurements
    WHERE device_eui = ${deviceEui} AND sensor = ${sensor} AND measurand = ${measurand}
    LIMIT 1
  `;
  return rows.length > 0;
};

export const getEntry = async (id: string): Promise<DashboardEntry | null> => {
  const rows = await reading()`
    SELECT id, name, device_eui, sensor, measurand, range_mode, min_value, max_value,
           created_at, created_by
    FROM dashboard_entries
    WHERE id = ${id}
  `;
  const [row] = rows as Record<string, unknown>[];
  return row ? mapEntry(row) : null;
};

/**
 * Every entry, joined with its latest measurement value and its resolved
 * gauge range - one query for the whole board, not one per tile.
 *
 * The two LATERAL subqueries mirror measurement.ts's `status()` window-function
 * idiom (latest row per partition) but scoped to only the triples the board
 * actually names. The historical MIN/MAX is computed only for `dynamic`
 * entries and only over numeric datatypes, so a string-typed measurand cannot
 * fail the `::double precision` cast.
 */
export const boardTiles = async (): Promise<BoardTile[]> => {
  const rows = await reading()`
    SELECT e.id, e.name, e.device_eui, e.sensor, e.measurand,
           e.range_mode, e.min_value, e.max_value, e.created_at, e.created_by,
           latest.value AS latest_value, latest.unit AS latest_unit,
           latest.seen_at AS latest_seen_at,
           agg.min_value AS hist_min, agg.max_value AS hist_max
    FROM dashboard_entries e
    LEFT JOIN LATERAL (
      SELECT value, unit, COALESCE(recorded_at, created_at) AS seen_at
      FROM measurements m
      WHERE m.device_eui = e.device_eui AND m.sensor = e.sensor AND m.measurand = e.measurand
      ORDER BY COALESCE(m.recorded_at, m.created_at) DESC
      LIMIT 1
    ) latest ON true
    LEFT JOIN LATERAL (
      SELECT MIN(value::double precision) AS min_value, MAX(value::double precision) AS max_value
      FROM measurements m
      WHERE m.device_eui = e.device_eui AND m.sensor = e.sensor AND m.measurand = e.measurand
        AND m.datatype IN ('float', 'integer')
        AND e.range_mode = 'dynamic'
    ) agg ON true
    ORDER BY e.name
  `;

  return (rows as Record<string, unknown>[]).map((row) => {
    const entry = mapEntry(row);
    const rawValue = row.latest_value as string | null;
    const parsed = rawValue === null ? NaN : Number(rawValue);
    const value = Number.isFinite(parsed) ? parsed : null;
    const unit = (row.latest_unit as string | null) ?? null;
    const lastSeen = (row.latest_seen_at as Date | null) ?? null;

    if (entry.rangeMode === "fixed") {
      return {
        entry,
        unit,
        value,
        lastSeen,
        min: entry.minValue!,
        max: entry.maxValue!,
        hasRange: true,
      };
    }

    const histMin = row.hist_min === null ? null : Number(row.hist_min);
    const histMax = row.hist_max === null ? null : Number(row.hist_max);
    const hasRange = histMin !== null && histMax !== null && histMin < histMax;
    return {
      entry,
      unit,
      value,
      lastSeen,
      min: histMin ?? 0,
      max: histMax ?? 0,
      hasRange,
    };
  });
};

//====================================
// WRITING
//====================================

export const createEntry = async (input: EntryInput, by: string): Promise<DashboardResult> => {
  const error = validateEntry(input);
  if (error) return { ok: false, error };

  // The form's cascading selects (board-page.tsx) already rule this out for
  // anyone with JavaScript; this is the check for anyone without it, and for a
  // POST made directly.
  const exists = await tripleExists(input.deviceEui.toUpperCase(), input.sensor.trim(), input.measurand.trim());
  if (!exists) {
    return {
      ok: false,
      error:
        `„${input.deviceEui}“ hat mit Sensor „${input.sensor}“ und Messgröße ` +
        `„${input.measurand}“ noch nie zusammen gesendet.`,
    };
  }

  try {
    await writing()`
      INSERT INTO dashboard_entries
        (name, device_eui, sensor, measurand, range_mode, min_value, max_value, created_by)
      VALUES (
        ${input.name.trim()}, ${input.deviceEui.toUpperCase()}, ${input.sensor.trim()},
        ${input.measurand.trim()}, ${input.rangeMode}, ${input.minValue}, ${input.maxValue}, ${by}
      )
    `;
    return { ok: true };
  } catch (err) {
    console.error("dashboard: could not create entry", input.name, err);
    return { ok: false, error: "Der Eintrag konnte nicht angelegt werden." };
  }
};

export const updateEntry = async (id: string, input: EntryInput): Promise<DashboardResult> => {
  const error = validateEntry(input);
  if (error) return { ok: false, error };

  try {
    const rows = await writing()`
      UPDATE dashboard_entries
      SET name = ${input.name.trim()},
          device_eui = ${input.deviceEui.toUpperCase()},
          sensor = ${input.sensor.trim()},
          measurand = ${input.measurand.trim()},
          range_mode = ${input.rangeMode},
          min_value = ${input.minValue},
          max_value = ${input.maxValue}
      WHERE id = ${id}
      RETURNING id
    `;
    if (rows.length === 0) return { ok: false, error: "Der Eintrag wurde nicht gefunden." };
    return { ok: true };
  } catch (err) {
    console.error("dashboard: could not update entry", id, err);
    return { ok: false, error: "Der Eintrag konnte nicht gespeichert werden." };
  }
};

export const deleteEntry = async (id: string): Promise<DashboardResult> => {
  try {
    await writing()`DELETE FROM dashboard_entries WHERE id = ${id}`;
    return { ok: true };
  } catch (err) {
    console.error("dashboard: could not delete entry", id, err);
    return { ok: false, error: "Der Eintrag konnte nicht entfernt werden." };
  }
};
