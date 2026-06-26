import { resolver, type GenerateSpecOptions } from "hono-openapi";
import type { ZodType } from "zod";

// ==========================
// Response Helpers
// ==========================

/**
 * Helper to define JSON response schema for OpenAPI documentation.
 */
export const jsonResponse = <T extends ZodType>(schema: T, description: string) => ({
  description,
  content: {
    "application/json": {
      schema: resolver(schema),
    },
  },
});

// ==========================
// OpenAPI Specification
// ==========================

export const openApiMeta: Partial<GenerateSpecOptions> = {
  documentation: {
    info: {
      title: "LoRaMINT API",
      version: "1.0.0",
      description: "LoRaWAN measurement data collection API (TTN webhook receiver)",
    },
    servers: [{ url: "/api/v1", description: "API Server" }],
    tags: [
      { name: "Webhook", description: "TTN webhook receiver" },
      { name: "Measurements", description: "Query stored measurements" },
      { name: "Log Entries", description: "Query stored log entries" },
      { name: "Health", description: "Health check" },
    ],
  },
};
