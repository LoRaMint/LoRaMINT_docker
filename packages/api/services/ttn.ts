import { ttn } from "../config";
import type { NormalisedDevice } from "../lib/ttn-ids";
import type { MutationResult } from "../types";

/**
 * The Things Stack, as far as this application needs it: list the devices of the
 * application, look one up, register one, rename one.
 *
 * Registering a device is four calls to four servers, and they are not one
 * transaction. The Identity Server learns that the device exists, the Join
 * Server gets its root key, the Network Server its MAC settings, the Application
 * Server its payload side - and any of the four can fail on its own. The console
 * does the same thing and leaves the half-registered device behind when it goes
 * wrong; `createDevice` below cleans up instead, and when even that fails it
 * says so rather than reporting a plain failure and leaving a ruin nobody knows
 * about.
 *
 * Reading is deliberately not cached. A dozen devices cost one request, and a
 * cache would be a second truth that goes stale the moment somebody uses the TTN
 * console - which they may, and for deleting a device they still have to.
 */

//====================================
// TYPES
//====================================

/** One device as the overview needs it. */
export type TtnDevice = {
  deviceId: string;
  name: string | null;
  devEui: string | null;
  joinEui: string | null;
  createdAt: string | null;
};

/** The same, plus what only the Network Server knows. */
export type TtnDeviceDetail = TtnDevice & {
  description: string | null;
  frequencyPlan: string | null;
  lorawanVersion: string | null;
  regionalParameters: string | null;
};

/**
 * The four servers a registration touches, in the order they are called. The
 * order matters twice: `is` has to come first because the others refuse a device
 * the Identity Server does not know, and the cleanup walks this list backwards.
 */
export type RegistrationStep = "is" | "js" | "ns" | "as";

const STEPS: RegistrationStep[] = ["is", "js", "ns", "as"];

/** What each step is called on a page someone has to read under pressure. */
export const STEP_LABELS: Record<RegistrationStep, string> = {
  is: "Gerät angelegt (Identity Server)",
  js: "Schlüssel hinterlegt (Join Server)",
  ns: "Funkeinstellungen gesetzt (Network Server)",
  as: "Anwendungsseite eingerichtet (Application Server)",
};

export type CreateOutcome = {
  deviceId: string;
  /** The steps that went through, in order. */
  done: RegistrationStep[];
  /** The step that did not, and what TTN said about it. Null when all four went. */
  failed: { step: RegistrationStep; error: string } | null;
  /**
   * Steps whose cleanup also failed. Anything in here is still registered in TTN
   * although the registration as a whole did not succeed - the one case where
   * somebody has to go into the console and tidy up by hand, so the page has to
   * say it out loud.
   */
  leftovers: RegistrationStep[];
};

//====================================
// REQUESTS
//====================================

const NOT_CONFIGURED =
  "Die Geräteverwaltung ist auf diesem Server nicht eingerichtet.";

/**
 * The path prefix of one server. The Identity Server sits at the root; the other
 * three each have their own segment.
 */
const base = (step: RegistrationStep) => {
  const prefix = step === "is" ? "" : `/${step}`;
  return `${ttn.url}/api/v3${prefix}/applications/${ttn.applicationId}/devices`;
};

/**
 * What went wrong, in words that can be shown.
 *
 * The Things Stack answers a failure with a JSON body carrying a `message`. That
 * message is meant for developers - it starts with things like
 * `error:pkg/identityserver:...` - but it is the only account of what happened,
 * and a page that swallows it leaves the person who has to fix the problem with
 * nothing. The API key never appears here: it only ever travels in a header, and
 * nothing from the request is echoed into this string.
 */
const failureText = async (response: Response) => {
  let detail = "";
  try {
    const body = (await response.json()) as { message?: unknown };
    if (typeof body.message === "string") detail = body.message;
  } catch {
    // A non-JSON body (a proxy's error page, say) leaves just the status.
  }
  return detail ? `${response.status}: ${detail}` : `HTTP ${response.status}`;
};

/** A parsed answer, plus what the list endpoints say about the whole result. */
type Answer = {
  body: Record<string, unknown>;
  /**
   * `x-total-count`, which every list answer carries: how many devices exist,
   * regardless of how many this page holds. It is what lets `listDevices` know
   * it has them all instead of guessing from the page size.
   */
  total: number | null;
};

/**
 * One call to TTN. Returns the parsed body, or a sentence about why not.
 *
 * Network failures and timeouts are turned into the same shape as an HTTP error,
 * so no caller has to deal with both a rejected promise and a failure value.
 */
const call = async (
  url: string,
  init: { method: string; body?: unknown },
): Promise<MutationResult<Answer>> => {
  try {
    const response = await fetch(url, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${ttn.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(ttn.timeoutMs),
    });

    if (!response.ok) return { ok: false, error: await failureText(response) };

    const header = response.headers.get("x-total-count");
    const parsed = header === null ? Number.NaN : Number.parseInt(header, 10);
    const total = Number.isFinite(parsed) ? parsed : null;

    // A successful DELETE answers with an empty object, and some responses have
    // no body at all.
    const text = await response.text();
    if (text.trim().length === 0) return { ok: true, data: { body: {}, total } };
    return {
      ok: true,
      data: { body: JSON.parse(text) as Record<string, unknown>, total },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`ttn: ${init.method} ${url} failed:`, message);
    return {
      ok: false,
      error:
        err instanceof Error && err.name === "TimeoutError"
          ? `The Things Network hat nicht innerhalb von ${ttn.timeoutMs} ms geantwortet.`
          : `The Things Network war nicht erreichbar: ${message}`,
    };
  }
};

/** The same, for the callers that only want the body. */
const request = async (
  url: string,
  init: { method: string; body?: unknown },
): Promise<MutationResult<Record<string, unknown>>> => {
  const result = await call(url, init);
  return result.ok ? { ok: true, data: result.data.body } : result;
};

//====================================
// READING
//====================================

/**
 * Which fields to ask for. Without a field mask The Things Stack answers with
 * little more than the identifiers, so every read has to name what it wants.
 */
const LIST_FIELDS = ["name", "ids.dev_eui", "ids.join_eui", "created_at"];
const DETAIL_FIELDS = [...LIST_FIELDS, "description"];
const NS_FIELDS = ["frequency_plan_id", "lorawan_version", "lorawan_phy_version"];

const withFields = (url: string, fields: string[]) =>
  `${url}?field_mask=${encodeURIComponent(fields.join(","))}`;

const str = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

const toDevice = (raw: Record<string, unknown>): TtnDevice => {
  const ids = (raw.ids ?? {}) as Record<string, unknown>;
  return {
    deviceId: String(ids.device_id ?? ""),
    name: str(raw.name),
    // TTN writes the EUIs upper case, which is also how normaliseEui hands them
    // over and how the measurement rows hold them - so the overview can compare
    // them directly.
    devEui: str(ids.dev_eui),
    joinEui: str(ids.join_eui),
    createdAt: str(raw.created_at),
  };
};

/** Devices per request. Pages are 1-based, as `page=1` is the first one. */
const PAGE_SIZE = 100;

/** So a misunderstanding about paging cannot turn into an endless loop. */
const MAX_PAGES = 50;

/**
 * Every device registered in the application - all of them, which is the whole
 * point of the paging below.
 *
 * The Things Stack caps a list answer at a server-side default when no `limit`
 * is given, and a truncated list here does not merely hide devices: the overview
 * classifies every DevEUI with measurements that is *not* in this answer as
 * "verwaist". A device beyond the cap would therefore not go missing, it would
 * appear as exactly the warning the page exists to raise. So this pages
 * explicitly and checks itself against `x-total-count`.
 *
 * A failing follow-up page aborts the whole thing rather than returning what
 * arrived so far, and for the same reason: half a list is not a smaller truth,
 * it is a page full of invented orphans.
 */
const listDevices = async (): Promise<MutationResult<TtnDevice[]>> => {
  if (!ttn.enabled) return { ok: false, error: NOT_CONFIGURED };

  const collected: TtnDevice[] = [];
  let total: number | null = null;

  for (let page = 1; page <= MAX_PAGES; page++) {
    const result = await call(
      `${withFields(base("is"), LIST_FIELDS)}&limit=${PAGE_SIZE}&page=${page}`,
      { method: "GET" },
    );
    if (!result.ok) return result;

    // An application without devices answers `{}` rather than an empty list.
    const raw = result.data.body.end_devices;
    const devices = Array.isArray(raw) ? raw : [];
    for (const device of devices) {
      collected.push(toDevice(device as Record<string, unknown>));
    }

    if (page === 1) total = result.data.total;
    // A short page is the last one. The count check below is the belt to this
    // pair of braces: it catches the case where TTN hands out full pages but
    // has more than MAX_PAGES of them.
    if (devices.length < PAGE_SIZE) break;
    if (total !== null && collected.length >= total) break;
  }

  if (total !== null && collected.length < total) {
    return {
      ok: false,
      error:
        `The Things Network meldet ${total} Geräte, es liessen sich aber nur ` +
        `${collected.length} abrufen. Die Liste wäre unvollständig und würde ` +
        `vorhandene Geräte fälschlich als verwaist ausweisen.`,
    };
  }

  return { ok: true, data: collected };
};

/**
 * One device, with the Network Server's settings alongside the Identity
 * Server's. The second call is what makes the detail page able to show the
 * frequency plan and the LoRaWAN version the device actually runs on, rather
 * than the ones this server would have configured.
 */
const getDevice = async (
  deviceId: string,
): Promise<MutationResult<TtnDeviceDetail>> => {
  if (!ttn.enabled) return { ok: false, error: NOT_CONFIGURED };

  const identity = await request(
    withFields(`${base("is")}/${encodeURIComponent(deviceId)}`, DETAIL_FIELDS),
    { method: "GET" },
  );
  if (!identity.ok) return identity;

  const network = await request(
    withFields(`${base("ns")}/${encodeURIComponent(deviceId)}`, NS_FIELDS),
    { method: "GET" },
  );

  const device = toDevice(identity.data);
  // A device whose Network Server entry is missing is not an error worth
  // refusing the page over - it is exactly the half-registered state the
  // registration below guards against, and the page should be able to show it.
  const ns = network.ok ? network.data : {};

  return {
    ok: true,
    data: {
      ...device,
      description: str(identity.data.description),
      frequencyPlan: str(ns.frequency_plan_id),
      lorawanVersion: str(ns.lorawan_version),
      regionalParameters: str(ns.lorawan_phy_version),
    },
  };
};

/**
 * The AppKey of a registered device, read back from the Join Server.
 *
 * A separate call on purpose: it is the one piece of this that is a secret, and
 * it is fetched only when somebody with the right to see it asks for it. It
 * never travels with the list or the detail page, so it cannot end up in a
 * response that was rendered for someone else.
 */
const appKeyOf = async (deviceId: string): Promise<MutationResult<string>> => {
  if (!ttn.enabled) return { ok: false, error: NOT_CONFIGURED };

  const result = await request(
    withFields(`${base("js")}/${encodeURIComponent(deviceId)}`, [
      "root_keys.app_key.key",
    ]),
    { method: "GET" },
  );
  if (!result.ok) return result;

  const rootKeys = (result.data.root_keys ?? {}) as Record<string, unknown>;
  const appKey = (rootKeys.app_key ?? {}) as Record<string, unknown>;
  const key = str(appKey.key);
  return key
    ? { ok: true, data: key }
    : { ok: false, error: "Für dieses Gerät ist kein AppKey hinterlegt." };
};

//====================================
// REGISTERING
//====================================

/** The body of one registration step, field mask and all. */
const stepBody = (step: RegistrationStep, device: NormalisedDevice) => {
  const ids = {
    device_id: device.deviceId,
    dev_eui: device.devEui,
    join_eui: device.joinEui,
  };
  const host = new URL(ttn.url).host;

  switch (step) {
    case "is":
      return {
        end_device: {
          ids,
          name: device.name,
          join_server_address: host,
          network_server_address: host,
          application_server_address: host,
        },
        field_mask: {
          paths: [
            "name",
            "join_server_address",
            "network_server_address",
            "application_server_address",
            "ids.dev_eui",
            "ids.join_eui",
          ],
        },
      };
    case "js":
      return {
        end_device: {
          ids,
          network_server_address: host,
          application_server_address: host,
          root_keys: { app_key: { key: device.appKey } },
        },
        field_mask: {
          paths: [
            "network_server_address",
            "application_server_address",
            "ids.device_id",
            "ids.dev_eui",
            "ids.join_eui",
            "root_keys.app_key.key",
          ],
        },
      };
    case "ns":
      return {
        end_device: {
          ids,
          supports_join: true,
          lorawan_version: ttn.lorawanVersion,
          lorawan_phy_version: ttn.regionalParameters,
          frequency_plan_id: ttn.frequencyPlan,
        },
        field_mask: {
          paths: [
            "supports_join",
            "lorawan_version",
            "lorawan_phy_version",
            "frequency_plan_id",
            "ids.device_id",
            "ids.dev_eui",
            "ids.join_eui",
          ],
        },
      };
    case "as":
      return {
        end_device: { ids },
        field_mask: { paths: ["ids.device_id", "ids.dev_eui", "ids.join_eui"] },
      };
  }
};

const runStep = (step: RegistrationStep, device: NormalisedDevice) =>
  step === "is"
    ? request(base("is"), { method: "POST", body: stepBody("is", device) })
    : request(`${base(step)}/${encodeURIComponent(device.deviceId)}`, {
        method: "PUT",
        body: stepBody(step, device),
      });

const undoStep = (step: RegistrationStep, deviceId: string) =>
  request(`${base(step)}/${encodeURIComponent(deviceId)}`, { method: "DELETE" });

/**
 * Registers an OTAA device across all four servers, and undoes its own work when
 * one of them refuses.
 *
 * The cleanup runs backwards through the steps that did go through. It is
 * best-effort by nature - if the Network Server just refused a request, a
 * DELETE to it may fail for the same reason - so whatever could not be removed
 * is named in `leftovers` and travels back to the page. That is the whole point:
 * "registration failed" on its own would leave somebody with a device that is
 * half in TTN and no idea it is there, and the next attempt with the same id
 * would then fail with a conflict nobody can explain.
 */
const createDevice = async (
  device: NormalisedDevice,
): Promise<MutationResult<CreateOutcome>> => {
  if (!ttn.enabled) return { ok: false, error: NOT_CONFIGURED };

  const done: RegistrationStep[] = [];

  for (const step of STEPS) {
    const result = await runStep(step, device);
    if (result.ok) {
      done.push(step);
      continue;
    }

    const leftovers: RegistrationStep[] = [];
    for (const completed of [...done].reverse()) {
      const undone = await undoStep(completed, device.deviceId);
      if (!undone.ok) leftovers.push(completed);
    }

    return {
      ok: true,
      data: {
        deviceId: device.deviceId,
        done,
        failed: { step, error: result.error },
        leftovers,
      },
    };
  }

  return {
    ok: true,
    data: { deviceId: device.deviceId, done, failed: null, leftovers: [] },
  };
};

/**
 * Changes a device's name. The Identity Server alone holds it, so unlike
 * registering this is a single call and cannot end up half done.
 */
const renameDevice = async (
  deviceId: string,
  name: string,
): Promise<MutationResult<null>> => {
  if (!ttn.enabled) return { ok: false, error: NOT_CONFIGURED };

  const result = await request(`${base("is")}/${encodeURIComponent(deviceId)}`, {
    method: "PUT",
    body: {
      end_device: { ids: { device_id: deviceId }, name },
      field_mask: { paths: ["name"] },
    },
  });
  return result.ok ? { ok: true, data: null } : result;
};

//====================================
// PUBLIC API
//====================================

export const devices = {
  listDevices,
  getDevice,
  appKeyOf,
  createDevice,
  renameDevice,
};
