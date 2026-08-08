import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { devices } from "./ttn";
import { replaceSettings } from "../lib/settings-store";

/**
 * The TTN client against a stubbed `fetch`.
 *
 * The configuration is placed in the settings store, which is where the TTN
 * settings live now - config.ts reads them from there on every access. Writing
 * to the config object would not work and should not: these are exactly the
 * values a deployment keeps in the database.
 */
replaceSettings([
  ["TTN_API_KEY", "NNSXS.testkey.testsecret"],
  ["TTN_APPLICATION_ID", "loramint-test"],
  ["TTN_URL", "https://eu1.example.test"],
  ["TTN_FREQUENCY_PLAN", "EU_863_870_TTN"],
  ["TTN_LORAWAN_VERSION", "MAC_V1_0_3"],
  ["TTN_REGIONAL_PARAMETERS", "PHY_V1_0_3_REV_A"],
]);

const DEVICE = {
  deviceId: "device-1",
  name: "Fenster 8b",
  devEui: "A84041D6C184DB82",
  joinEui: "A840410000000101",
  appKey: "11223344556677881122334455667788",
};

const APP = "https://eu1.example.test/api/v3";

type Call = { method: string; url: string; body: Record<string, unknown> | null };

let calls: Call[] = [];
let respond: (call: Call) => Response;
const realFetch = globalThis.fetch;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

beforeEach(() => {
  calls = [];
  respond = () => json({});
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const call: Call = {
      method: init?.method ?? "GET",
      url: String(url),
      body: typeof init?.body === "string" ? JSON.parse(init.body) : null,
    };
    calls.push(call);
    return respond(call);
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

/** The `field_mask.paths` a recorded call carried. */
const paths = (call: Call) =>
  ((call.body?.field_mask as { paths?: string[] })?.paths ?? []).sort();

describe("listDevices", () => {
  test("asks the Identity Server, with a field mask", async () => {
    respond = () => json({ end_devices: [] });
    await devices.listDevices();

    expect(calls).toHaveLength(1);
    expect(calls[0]!.method).toBe("GET");
    expect(calls[0]!.url).toStartWith(`${APP}/applications/loramint-test/devices?`);
    // Without a field mask TTN answers with little more than the ids, so the
    // overview would have neither names nor EUIs to show.
    const mask = new URL(calls[0]!.url).searchParams.get("field_mask");
    expect(mask?.split(",")).toContain("ids.dev_eui");
    expect(mask?.split(",")).toContain("name");
  });

  test("reads the devices out of the answer", async () => {
    respond = () =>
      json({
        end_devices: [
          {
            ids: {
              device_id: "device-1",
              dev_eui: "A84041D6C184DB82",
              join_eui: "A840410000000101",
            },
            name: "Fenster 8b",
            created_at: "2023-03-27T12:24:48Z",
          },
        ],
      });

    const result = await devices.listDevices();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toEqual([
      {
        deviceId: "device-1",
        name: "Fenster 8b",
        devEui: "A84041D6C184DB82",
        joinEui: "A840410000000101",
        createdAt: "2023-03-27T12:24:48Z",
      },
    ]);
  });

  test("an application without devices answers {} and that is not an error", async () => {
    respond = () => json({});
    const result = await devices.listDevices();
    expect(result).toEqual({ ok: true, data: [] });
  });

  test("asks for an explicit page, so nothing is left off by a server default", async () => {
    respond = () => json({ end_devices: [] });
    await devices.listDevices();

    const query = new URL(calls[0]!.url).searchParams;
    expect(query.get("limit")).toBe("100");
    expect(query.get("page")).toBe("1");
  });

  /** A full page plus a short one, the shape a real second page has. */
  const page = (from: number, count: number) => ({
    end_devices: Array.from({ length: count }, (_, i) => ({
      ids: { device_id: `device-${from + i}`, dev_eui: "A84041D6C184DB82" },
      name: `Gerät ${from + i}`,
    })),
  });

  const withTotal = (body: unknown, total: number) =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json", "x-total-count": String(total) },
    });

  test("keeps paging until it has them all", async () => {
    respond = (call) => {
      const p = new URL(call.url).searchParams.get("page");
      return withTotal(p === "1" ? page(1, 100) : page(101, 3), 103);
    };

    const result = await devices.listDevices();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toHaveLength(103);
    expect(calls).toHaveLength(2);
    expect(new URL(calls[1]!.url).searchParams.get("page")).toBe("2");
  });

  test("stops after the last page instead of asking for an empty one", async () => {
    respond = () => withTotal(page(1, 4), 4);
    await devices.listDevices();
    expect(calls).toHaveLength(1);
  });

  /**
   * The important one. A partial list is not a smaller truth: the overview marks
   * every DevEUI with measurements that is missing from it as "verwaist", so
   * returning the first page would invent orphans out of perfectly healthy
   * devices.
   */
  test("a failing follow-up page is an error, not a partial list", async () => {
    respond = (call) => {
      const p = new URL(call.url).searchParams.get("page");
      if (p === "1") return withTotal(page(1, 100), 150);
      return json({ message: "error:pkg/identityserver: unavailable" }, 503);
    };

    const result = await devices.listDevices();
    expect(result.ok).toBe(false);
  });

  test("refuses a list that is short of what TTN says exists", async () => {
    // A full first page, a short second one, but the count claims more: rather
    // than quietly hand back 101 of 150, say the list would be wrong.
    respond = (call) => {
      const p = new URL(call.url).searchParams.get("page");
      return withTotal(p === "1" ? page(1, 100) : page(101, 1), 150);
    };

    const result = await devices.listDevices();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("verwaist");
  });

  test("passes the API key as a bearer token", async () => {
    const seen: (string | null)[] = [];
    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      seen.push(new Headers(init?.headers).get("Authorization"));
      return json({ end_devices: [] });
    }) as typeof fetch;

    await devices.listDevices();
    expect(seen).toEqual(["Bearer NNSXS.testkey.testsecret"]);
  });
});

describe("createDevice", () => {
  test("registers on all four servers, in order", async () => {
    const result = await devices.createDevice(DEVICE);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.done).toEqual(["is", "js", "ns", "as"]);
    expect(result.data.failed).toBeNull();
    expect(result.data.leftovers).toEqual([]);

    expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual([
      `POST ${APP}/applications/loramint-test/devices`,
      `PUT ${APP}/js/applications/loramint-test/devices/device-1`,
      `PUT ${APP}/ns/applications/loramint-test/devices/device-1`,
      `PUT ${APP}/as/applications/loramint-test/devices/device-1`,
    ]);
  });

  test("each step names exactly the fields it sets", async () => {
    await devices.createDevice(DEVICE);

    expect(paths(calls[0]!)).toContain("ids.dev_eui");
    expect(paths(calls[0]!)).toContain("join_server_address");
    // The root key belongs to the Join Server and to no other call.
    expect(paths(calls[1]!)).toContain("root_keys.app_key.key");
    expect(paths(calls[2]!)).toContain("frequency_plan_id");
    expect(paths(calls[2]!)).toContain("supports_join");
  });

  test("the AppKey travels only to the Join Server", async () => {
    await devices.createDevice(DEVICE);

    const carrying = calls.filter((call) =>
      JSON.stringify(call.body).includes(DEVICE.appKey),
    );
    expect(carrying).toHaveLength(1);
    expect(carrying[0]!.url).toContain("/js/");
  });

  test("sets the configured radio parameters on the Network Server", async () => {
    await devices.createDevice(DEVICE);

    const end = calls[2]!.body!.end_device as Record<string, unknown>;
    expect(end.supports_join).toBe(true);
    expect(end.frequency_plan_id).toBe("EU_863_870_TTN");
    expect(end.lorawan_version).toBe("MAC_V1_0_3");
    expect(end.lorawan_phy_version).toBe("PHY_V1_0_3_REV_A");
  });

  test("undoes the earlier steps when one fails, newest first", async () => {
    respond = (call) =>
      call.url.includes("/ns/") && call.method === "PUT"
        ? json({ message: "error:pkg/networkserver: invalid frequency plan" }, 400)
        : json({});

    const result = await devices.createDevice(DEVICE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.done).toEqual(["is", "js"]);
    expect(result.data.failed?.step).toBe("ns");
    expect(result.data.failed?.error).toContain("invalid frequency plan");
    // Nothing left behind: both completed steps were removed again.
    expect(result.data.leftovers).toEqual([]);

    const deletes = calls.filter((call) => call.method === "DELETE");
    expect(deletes.map((call) => call.url)).toEqual([
      `${APP}/js/applications/loramint-test/devices/device-1`,
      `${APP}/applications/loramint-test/devices/device-1`,
    ]);
  });

  test("says which steps it could not undo, so the ruin is not a surprise", async () => {
    respond = (call) => {
      if (call.url.includes("/js/") && call.method === "PUT") {
        return json({ message: "error:pkg/joinserver: already exists" }, 409);
      }
      // The Identity Server refuses the cleanup too.
      if (call.method === "DELETE") return json({ message: "nope" }, 500);
      return json({});
    };

    const result = await devices.createDevice(DEVICE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.failed?.step).toBe("js");
    expect(result.data.leftovers).toEqual(["is"]);
    expect(result.data.deviceId).toBe("device-1");
  });

  test("a failure on the very first step leaves nothing to undo", async () => {
    respond = () => json({ message: "error:pkg/identityserver: id taken" }, 409);

    const result = await devices.createDevice(DEVICE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.done).toEqual([]);
    expect(result.data.leftovers).toEqual([]);
    expect(calls.filter((call) => call.method === "DELETE")).toHaveLength(0);
  });

  test("the reported error never contains the API key", async () => {
    respond = () => json({ message: "error:pkg/identityserver: id taken" }, 409);

    const result = await devices.createDevice(DEVICE);
    if (!result.ok) return;
    expect(result.data.failed?.error).not.toContain("NNSXS");
  });
});

describe("renameDevice", () => {
  test("is a single call to the Identity Server", async () => {
    const result = await devices.renameDevice("device-1", "Flur EG");

    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.method).toBe("PUT");
    expect(calls[0]!.url).toBe(`${APP}/applications/loramint-test/devices/device-1`);
    // Only the name: a wider mask would blank whatever it names and did not send.
    expect(paths(calls[0]!)).toEqual(["name"]);
    expect((calls[0]!.body!.end_device as Record<string, unknown>).name).toBe(
      "Flur EG",
    );
  });

  test("hands TTN's complaint back rather than swallowing it", async () => {
    respond = () => json({ message: "error:pkg/identityserver: not found" }, 404);

    const result = await devices.renameDevice("ghost", "egal");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("404");
    expect(result.error).toContain("not found");
  });
});

describe("appKeyOf", () => {
  test("asks the Join Server for the root key alone", async () => {
    respond = () => json({ root_keys: { app_key: { key: DEVICE.appKey } } });

    const result = await devices.appKeyOf("device-1");
    expect(result).toEqual({ ok: true, data: DEVICE.appKey });

    expect(calls[0]!.url).toStartWith(
      `${APP}/js/applications/loramint-test/devices/device-1?`,
    );
    expect(new URL(calls[0]!.url).searchParams.get("field_mask")).toBe(
      "root_keys.app_key.key",
    );
  });

  test("says so when there is no key rather than answering an empty one", async () => {
    respond = () => json({});
    const result = await devices.appKeyOf("device-1");
    expect(result.ok).toBe(false);
  });
});

describe("getDevice", () => {
  test("combines the Identity and Network Server answers", async () => {
    respond = (call) =>
      call.url.includes("/ns/")
        ? json({
            frequency_plan_id: "EU_863_870_TTN",
            lorawan_version: "MAC_V1_0_3",
            lorawan_phy_version: "PHY_V1_0_3_REV_A",
          })
        : json({
            ids: { device_id: "device-1", dev_eui: "A84041D6C184DB82" },
            name: "Fenster 8b",
          });

    const result = await devices.getDevice("device-1");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.name).toBe("Fenster 8b");
    expect(result.data.frequencyPlan).toBe("EU_863_870_TTN");
    expect(result.data.regionalParameters).toBe("PHY_V1_0_3_REV_A");
  });

  test("still shows a device the Network Server does not know", async () => {
    // Exactly the half-registered state createDevice guards against - the page
    // has to be able to show it, or nobody can see what went wrong.
    respond = (call) =>
      call.url.includes("/ns/")
        ? json({ message: "error:pkg/networkserver: not found" }, 404)
        : json({ ids: { device_id: "device-1" }, name: "Halbfertig" });

    const result = await devices.getDevice("device-1");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.name).toBe("Halbfertig");
    expect(result.data.frequencyPlan).toBeNull();
  });
});
