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
    decoded_payload: TtnDecodedPayloadSchema,
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
  from: z.union([z.iso.date(), z.iso.datetime({ offset: true })]).optional(),
  to: z.union([z.iso.date(), z.iso.datetime({ offset: true })]).optional(),
});

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
