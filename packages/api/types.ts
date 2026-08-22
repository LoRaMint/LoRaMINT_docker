import { z } from "zod";

//====================================
// RESULT TYPES
//====================================

export type MutationResult<T> = { ok: true; data: T } | { ok: false; error: string };

//====================================
// DOMAIN TYPES
//====================================

export type Datatype = "float" | "integer" | "string";

export type TimeMethod = "server" | "custom" | "none";

export type Measurement = {
  id: string;
  deviceEui: string;
  measurand: string;
  unit: string;
  datatype: Datatype;
  sensor: string;
  location: string;
  value: string;
  timeMethod: TimeMethod;
  recordedAt: Date | null;
  createdAt: Date;
};

export type LogEntry = {
  id: string;
  deviceEui: string;
  message: string;
  createdAt: Date;
};

/** One row of the status board: the latest measurement per device + sensor. */
export type SensorStatus = {
  deviceEui: string;
  sensor: string;
  location: string;
  measurand: string;
  unit: string;
  value: string;
  lastSeen: Date;
  count: number;
};

/** One row of the log status board: the latest log entry per device. */
export type LogStatus = {
  deviceEui: string;
  message: string;
  lastSeen: Date;
  count: number;
};

//====================================
// ZOD SCHEMAS
//====================================

export const TtnDecodedPayloadSchema = z.object({
  messagetyp: z.string(),
  datatype: z.string().optional(),
  location: z.string().optional(),
  measurand: z.string().optional(),
  sensor: z.string().optional(),
  unit: z.string().optional(),
  value: z.unknown().optional(),
  timemethode: z.string().optional(),
  timevalue: z.unknown().optional(),
  message: z.string().optional(),
});

export const TtnPayloadSchema = z.object({
  end_device_ids: z.object({
    dev_eui: z.string(),
  }),
  uplink_message: z.object({
    // Optional: TTN also forwards uplinks that carry no application payload at
    // all (empty MAC-only frames, ADR answers) or that the payload formatter
    // could not decode. Those have no decoded_payload and are acknowledged and
    // ignored rather than rejected - see the /webhook handler.
    decoded_payload: TtnDecodedPayloadSchema.optional(),
  }),
});

export type TtnDecodedPayload = z.infer<typeof TtnDecodedPayloadSchema>;
export type TtnPayload = z.infer<typeof TtnPayloadSchema>;

//====================================
// RESPONSE SCHEMAS (for OpenAPI)
//====================================

export const MeasurementSchema = z.object({
  id: z.string().uuid(),
  deviceEui: z.string(),
  measurand: z.string(),
  unit: z.string(),
  datatype: z.enum(["float", "integer", "string"]),
  sensor: z.string(),
  location: z.string(),
  value: z.string(),
  timeMethod: z.enum(["server", "custom", "none"]),
  recordedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});

export const LogEntrySchema = z.object({
  id: z.string().uuid(),
  deviceEui: z.string(),
  message: z.string(),
  createdAt: z.string().datetime(),
});

//====================================
// QUERY SCHEMAS
//====================================

export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  per_page: z.coerce.number().int().positive().max(100).optional().default(20),
});

/**
 * Optional filters for the measurement list and CSV export. All fields are
 * optional; an absent field means "do not filter on this column". String
 * fields match exactly; `from`/`to` bound the measurement time
 * (`recorded_at`, falling back to `created_at`) inclusively.
 */
export const MeasurementFilterSchema = z.object({
  device_eui: z
    .string()
    .regex(/^[0-9A-Fa-f]{16}$/, "device_eui must be exactly 16 hex characters")
    .optional(),
  measurand: z.string().optional(),
  sensor: z.string().optional(),
  location: z.string().optional(),
  datatype: z.enum(["float", "integer", "string"]).optional(),
  group_name: z.string().max(100).optional(),
  public_read: z.enum(["true", "false"]).optional(),
  from: z.union([z.iso.date(), z.iso.datetime({ offset: true })]).optional(),
  to: z.union([z.iso.date(), z.iso.datetime({ offset: true })]).optional(),
});

/**
 * The `group_name` value that means "no group at all" rather than a group of
 * that name.
 *
 * The column is nullable, and after the 1.8 migration the rows still waiting to
 * be assigned are exactly the ones with NULL - so being able to ask for them is
 * what makes the assignment work reviewable. A sentinel is needed because an
 * absent filter already means "do not narrow"; the double underscores keep it
 * out of the way of anything `data_groups` would accept as a name.
 *
 * Defined in lib/facets.ts and only re-exported here: the browser islands need
 * it too and cannot import this module, which would pull zod into their bundle.
 * It used to be copied by hand into each of them.
 */
export { NO_GROUP } from "./lib/facets";

export type MeasurementFilter = z.infer<typeof MeasurementFilterSchema>;

/** Query schema for `GET /measurements`: pagination + optional filters. */
export const MeasurementListQuerySchema = PaginationQuerySchema.merge(
  MeasurementFilterSchema,
);

/**
 * Query schema for `GET /measurements/metadata`: only `device_eui` narrows the
 * result (e.g. to list the sensors/measurands of a single device); all other
 * filters are irrelevant for distinct-value listings.
 */
export const MeasurementMetadataQuerySchema = MeasurementFilterSchema.pick({
  device_eui: true,
});

/** Response schema for `GET /measurements/metadata`: distinct values for dropdowns. */
export const MeasurementMetadataSchema = z.object({
  devices: z.array(z.string()),
  measurands: z.array(z.string()),
  sensors: z.array(z.string()),
  locations: z.array(z.string()),
  /** Only the groups the caller may see - the row-level rules decide that. */
  groups: z.array(z.string()),
  /**
   * The combinations that actually occurred together.
   *
   * The five lists above are independent `DISTINCT`s and therefore a cross
   * product: they offer a sensor and a measurand that no row ever carried at
   * once. This carries the real pairings, so a page can narrow each list by
   * what is already chosen - see lib/facets.ts.
   */
  combinations: z.array(
    z.object({
      measurand: z.string(),
      sensor: z.string(),
      location: z.string(),
      /** NO_GROUP for the rows that belong to none: NULL cannot be named. */
      group: z.string(),
      isPublic: z.boolean(),
    }),
  ),
});

//====================================
// VALIDATED INPUT TYPES
//====================================

export type ValidatedMeasurement = {
  deviceEui: string;
  measurand: string;
  unit: string;
  datatype: Datatype;
  sensor: string;
  location: string;
  value: string;
  timeMethod: TimeMethod;
  recordedAt: Date | null;
};

export type ValidatedLogEntry = {
  deviceEui: string;
  message: string;
};
