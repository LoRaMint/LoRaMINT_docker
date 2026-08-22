import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { logger } from "hono/logger";
import { serveStatic } from "hono/bun";
import { routes } from "@valentinkolb/ssr/hono";
import { config as ssrConfig } from "./config/ssr";
import { describeRoute, generateSpecs } from "hono-openapi";
import { Scalar } from "@scalar/hono-api-reference";
import { createMarkdownFromOpenApi } from "@scalar/openapi-to-markdown";
import { z } from "zod";
import { getCookie } from "hono/cookie";
import { config, auth, setupAccount, validateConfig, verifyAppKey } from "./config";
import { loadSettings, refreshSettingsIfStale } from "./services/settings";
import {
  openApiMeta,
  jsonResponse,
  v,
  parsePagination,
  createPagination,
  PaginationResponseSchema,
  hasRole,
  readSession,
  readThemeCookie,
  requestContext,
  SESSION_COOKIE,
  THEME_COOKIE,
} from "./lib";
import { measurements, logEntries } from "./services";
import type { Scope } from "./services/connections";
import { declaredNames } from "./services/data-groups";
import {
  TtnPayloadSchema,
  MeasurementSchema,
  LogEntrySchema,
  PaginationQuerySchema,
  MeasurementListQuerySchema,
  MeasurementFilterSchema,
  MeasurementMetadataQuerySchema,
  MeasurementMetadataSchema,
} from "./types";

const app = new Hono();

app.use(logger());

/**
 * The webhook's key check, as middleware so it runs *before* the body validator.
 *
 * Order matters here. With the check inside the handler, Zod ran first and an
 * unauthenticated caller got a 400 naming the fields it had got wrong - enough
 * to work out the expected payload without ever holding the key, and a parse of
 * whatever they sent on top. Authorisation belongs in front of anything that
 * reads the request.
 */
const requireAppKey = createMiddleware(async (c, next) => {
  if (!verifyAppKey(c.req.header("X-Downlink-Apikey"))) {
    return c.json({ ok: false, error: "Unauthorized" }, 401);
  }
  await next();
});

// Catch any unhandled error in the API routes and return a consistent JSON 500
// instead of leaking internals (e.g. a database outage in a service call).
app.onError((err, c) => {
  console.error("Unhandled error:", err);
  return c.json({ ok: false, error: "Internal server error" }, 500);
});

//====================================
// SCHEMAS
//====================================

const WebhookResponseSchema = z.object({
  ok: z.boolean(),
  id: z.string().uuid().optional(),
  ignored: z.boolean().optional(),
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
      "Receives uplink messages from The Things Network and stores measurements or log entries. " +
      "Uplinks without a decoded payload (empty MAC-only frames, undecodable payloads) are " +
      "acknowledged with `ignored: true` instead of being rejected.",
    responses: {
      200: jsonResponse(WebhookResponseSchema, "Stored, or acknowledged and ignored"),
      400: jsonResponse(WebhookResponseSchema, "Validation error"),
      401: jsonResponse(WebhookResponseSchema, "Unauthorized"),
    },
  }),
  requireAppKey,
  v("json", TtnPayloadSchema),
  async (c) => {
    const body = c.req.valid("json");
    const deviceEui = body.end_device_ids.dev_eui;
    const payload = body.uplink_message.decoded_payload;

    // Not every uplink carries application data: empty MAC-only frames (ADR
    // answers) and payloads the formatter could not decode arrive without a
    // decoded_payload. Acknowledge them so TTN does not count them as delivery
    // failures and eventually disable the webhook.
    if (!payload) {
      return c.json({ ok: true, ignored: true });
    }

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
      "Returns a paginated list of stored measurements, ordered by most recent first. " +
      "Optionally filtered by device_eui, measurand, sensor, location, datatype, group_name, " +
      "public_read, and/or a from/to time range. Pass group_name=__none__ for the rows "  +
      "that belong to no group.",
    responses: {
      200: jsonResponse(
        MeasurementListResponseSchema,
        "Paginated list of measurements",
      ),
    },
  }),
  v("query", MeasurementListQuerySchema),
  async (c) => {
    const { page, per_page, ...filter } = c.req.valid("query");
    const pagination = parsePagination({ page, per_page });
    const { items, total } = await measurements.list(pagination, filter);
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
    description:
      "Returns stored measurements as a CSV file download, optionally filtered by " +
      "device_eui, measurand, sensor, location, datatype, group_name, public_read, and/or a " +
      "from/to time range. Pass group_name=__none__ for the rows that belong to no group.",
    responses: {
      200: {
        description: "CSV file",
        content: { "text/csv": { schema: { type: "string" } } },
      },
    },
  }),
  v("query", MeasurementFilterSchema),
  (c) => {
    const filter = c.req.valid("query");
    const stream = measurements.exportCsvStream(filter);
    c.header("Content-Type", "text/csv");
    c.header("Content-Disposition", "attachment; filename=measurements.csv");
    return c.body(stream);
  },
);

// Measurements - metadata (distinct filter values for dropdowns)
app.get(
  "/measurements/metadata",
  describeRoute({
    tags: ["Measurements"],
    summary: "List available filter values",
    description:
      "Returns the distinct device_euis, measurands, sensors, locations and groups present in the " +
      "stored measurements, for populating the filter dropdowns on the /plots page, plus the " +
      "combinations that actually occurred together - the flat lists alone are a cross product " +
      "and would offer pairings no row ever carried. " +
      "Optionally narrowed to a single device_eui for cascading dropdowns.",
    responses: {
      200: jsonResponse(MeasurementMetadataSchema, "Distinct filter values"),
    },
  }),
  v("query", MeasurementMetadataQuerySchema),
  async (c) => {
    const filter = c.req.valid("query");
    return c.json(await measurements.metadata(filter));
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

// Resolve the session once per request and expose it for the whole request tree,
// so the shared Layout can render the signed-in user. Kept outside the /api/v1
// routes: the API authenticates with the TTN key, not with a browser cookie.
/**
 * Keeps the settings in memory close to the table.
 *
 * Saving on the configuration page updates them directly; this covers every
 * other way they can change - the SQL console, psql, a restore, or a second
 * instance behind the same database. See services/settings.ts for the cost.
 */
root.use(async (c, next) => {
  await refreshSettingsIfStale();
  await next();
});

root.use(async (c, next) => {
  // The same condition the login routes are registered under: a session can
  // exist as soon as *either* way in is configured. Reading it only when LDAP is
  // set up would sign the setup account in and then forget it on the next
  // request - which is precisely when it is needed, since it exists to configure
  // a server that has no directory yet.
  const user =
    auth.enabled || setupAccount.enabled
      ? readSession(getCookie(c, SESSION_COOKIE), auth.session.secret!)
      : null;

  // The session wins over the cookie where both speak, because the session is
  // the signed copy of what the user actually saved. The cookie is what covers
  // the case the session cannot: a visitor who is not signed in at all, on one
  // of the many public pages here.
  const fromCookie = readThemeCookie(getCookie(c, THEME_COOKIE));
  const darkMode = user?.darkMode ?? fromCookie ?? false;

  // Worked out once here so no service has to be handed it: the data role and
  // administrators see every group, everybody else the declared groups they are
  // in, and an anonymous visitor only what is released publicly.
  //
  // The intersection with the declared names costs nothing after the first
  // request - services/data-groups.ts caches them - and it buys the menu an
  // answer it cannot query for itself, because rendering is synchronous.
  const scope: Scope = !user
    ? []
    : hasRole(user, "data", auth)
      ? "all"
      : await (async () => {
          const declared = new Set(await declaredNames());
          return user.groups.filter((group) => declared.has(group));
        })();

  return requestContext.run(
    { user, darkMode, timezone: user?.timezone ?? null, scope },
    next,
  );
});

root.route("/_ssr", routes(ssrConfig));
root.use("/public/*", serveStatic({ root: "./" }));
root.route("/api/v1", app);
/**
 * The settings table decides which routes exist at all - `auth.enabled` and
 * `ttn.enabled` now answer out of it - so it has to be read before the pages
 * module is evaluated, and the pages module is therefore imported here rather
 * than at the top of the file.
 *
 * The configuration is checked immediately afterwards, once and before the first
 * request: a deployment that cannot work should fail at startup, not on every
 * sign-in attempt.
 */
await loadSettings();
validateConfig();

const pages = (await import("./frontend/pages")).default;
root.route("/", pages);

console.log(`LoRaMINT listening on port ${config.port}`);

export default {
  port: config.port,
  fetch: root.fetch,
};
