import { Hono } from "hono";
import { logger } from "hono/logger";
import { serveStatic } from "hono/bun";
import { routes } from "@valentinkolb/ssr/hono";
import { config as ssrConfig } from "./config/ssr";
import pages from "./frontend/pages";
import { describeRoute, generateSpecs } from "hono-openapi";
import { Scalar } from "@scalar/hono-api-reference";
import { createMarkdownFromOpenApi } from "@scalar/openapi-to-markdown";
import { z } from "zod";
import { config } from "./config";
import {
  openApiMeta,
  jsonResponse,
  v,
  parsePagination,
  createPagination,
  PaginationResponseSchema,
} from "./lib";
import { measurements, logEntries } from "./services";
import {
  TtnPayloadSchema,
  MeasurementSchema,
  LogEntrySchema,
  PaginationQuerySchema,
} from "./types";

const app = new Hono();

app.use(logger());

//====================================
// SCHEMAS
//====================================

const WebhookResponseSchema = z.object({
  ok: z.boolean(),
  id: z.string().uuid().optional(),
  error: z.string().optional(),
});

const MeasurementListResponseSchema = z.object({
  data: z.array(MeasurementSchema),
  pagination: PaginationResponseSchema,
});

const LogEntryListResponseSchema = z.object({
  data: z.array(LogEntrySchema),
  pagination: PaginationResponseSchema,
});

//====================================
// ROUTES
//====================================

// Health
app.get("/health", (c) => c.json({ status: "ok" }));

// Webhook
app.post(
  "/webhook",
  describeRoute({
    tags: ["Webhook"],
    summary: "Receive TTN webhook",
    description:
      "Receives uplink messages from The Things Network and stores measurements or log entries.",
    responses: {
      200: jsonResponse(WebhookResponseSchema, "Successfully stored"),
      400: jsonResponse(WebhookResponseSchema, "Validation error"),
      401: jsonResponse(WebhookResponseSchema, "Unauthorized"),
    },
  }),
  v("json", TtnPayloadSchema),
  async (c) => {
    const apiKey = c.req.header("X-Downlink-Apikey");
    if (apiKey !== config.appKey) {
      return c.json({ ok: false, error: "Unauthorized" }, 401);
    }

    const body = c.req.valid("json");
    const deviceEui = body.end_device_ids.dev_eui;
    const payload = body.uplink_message.decoded_payload;
    const messageType = payload.messagetyp;

    if (messageType === "Messwert") {
      const result = await measurements.ingest(payload, deviceEui);
      if (!result.ok) return c.json({ ok: false, error: result.error }, 400);
      console.log(
        `Measurement stored: ${payload.measurand}=${payload.value} from ${deviceEui}`,
      );
      return c.json({ ok: true, id: result.data.id });
    }

    if (messageType === "LogEintrag") {
      const result = await logEntries.ingest(payload, deviceEui);
      if (!result.ok) return c.json({ ok: false, error: result.error }, 400);
      console.log(`Log entry stored from ${deviceEui}: ${payload.message}`);
      return c.json({ ok: true, id: result.data.id });
    }

    return c.json(
      { ok: false, error: `Unknown message type: ${messageType}` },
      400,
    );
  },
);

// Measurements - list
app.get(
  "/measurements",
  describeRoute({
    tags: ["Measurements"],
    summary: "List measurements",
    description:
      "Returns a paginated list of stored measurements, ordered by most recent first.",
    responses: {
      200: jsonResponse(
        MeasurementListResponseSchema,
        "Paginated list of measurements",
      ),
    },
  }),
  v("query", PaginationQuerySchema),
  async (c) => {
    const query = c.req.valid("query");
    const pagination = parsePagination(query);
    const { items, total } = await measurements.list(pagination);
    return c.json({
      data: items,
      pagination: createPagination(pagination, total),
    });
  },
);

// Measurements - CSV export
app.get(
  "/measurements/export",
  describeRoute({
    tags: ["Measurements"],
    summary: "Export measurements as CSV",
    description: "Returns all stored measurements as a CSV file download.",
    responses: {
      200: {
        description: "CSV file",
        content: { "text/csv": { schema: { type: "string" } } },
      },
    },
  }),
  async (c) => {
    const csv = await measurements.exportCsv();
    c.header("Content-Type", "text/csv");
    c.header("Content-Disposition", "attachment; filename=measurements.csv");
    return c.body(csv);
  },
);

// Log entries - list
app.get(
  "/log-entries",
  describeRoute({
    tags: ["Log Entries"],
    summary: "List log entries",
    description:
      "Returns a paginated list of stored log entries, ordered by most recent first.",
    responses: {
      200: jsonResponse(
        LogEntryListResponseSchema,
        "Paginated list of log entries",
      ),
    },
  }),
  v("query", PaginationQuerySchema),
  async (c) => {
    const query = c.req.valid("query");
    const pagination = parsePagination(query);
    const { items, total } = await logEntries.list(pagination);
    return c.json({
      data: items,
      pagination: createPagination(pagination, total),
    });
  },
);

//====================================
// OPENAPI DOCS
//====================================

const spec = await generateSpecs(app, openApiMeta);
const llmsTxt = await createMarkdownFromOpenApi(JSON.stringify(spec));

app.get("/openapi.json", (c) => c.json(spec));
app.get("/llms.txt", (c) => c.text(llmsTxt));
app.get(
  "/docs",
  Scalar({
    theme: "saturn",
    url: "/api/v1/openapi.json",
    hideClientButton: true,
  }),
);

//====================================
// MOUNT & EXPORT
//====================================

const root = new Hono();
root.route("/_ssr", routes(ssrConfig));
root.use("/public/*", serveStatic({ root: "./" }));
root.route("/api/v1", app);
root.route("/", pages);

console.log(`LoRaMINT listening on port ${config.port}`);

export default {
  port: config.port,
  fetch: root.fetch,
};
