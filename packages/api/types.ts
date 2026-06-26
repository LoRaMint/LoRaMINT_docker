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
