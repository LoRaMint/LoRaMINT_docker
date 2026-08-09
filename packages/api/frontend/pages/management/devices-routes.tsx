import type { Hono, MiddlewareHandler } from "hono";
import { ssr } from "../../../config/ssr";
import { auth, manage, ttn } from "../../../config";
import { deviceLog, devices, measurements } from "../../../services";
import { currentScope, currentUser, hasRole, parsePage, parseReason } from "../../../lib";
import {
  deviceProblems,
  nextDeviceId,
  normaliseDevice,
  type DeviceInput,
} from "../../../lib/ttn-ids";
import ManageDevicesPage, { type DeviceRow } from "./devices-page";
import DeviceNewPage from "./device-new-page";
import DeviceCreatedPage from "./device-created-page";
import DevicePage from "./device-page";
import DeviceLogPage from "./device-log-page";

/**
 * The device pages: the overview, registering one, one device, and the log.
 *
 * Two rules run through all of them.
 *
 * Nothing is written without a reason and without a log entry. `manage.writable`
 * gates every writing route, because the connection it stands for is the one the
 * device log is appended through - and an operation in somebody else's system
 * that leaves no trace here is worse than one that does not happen.
 *
 * The AppKey is never on a page that was not explicitly asked for it. It is
 * fetched from the Join Server in its own request, by administrators only, and
 * lands in exactly one response.
 */

const PATH = "/management/devices";

/** Rows per page in the log. */
const PER_PAGE = 25;

/**
 * How long a registered device may stay quiet before the overview calls it
 * stumm. A day, because these are classroom sensors that report every few
 * minutes: anything that has said nothing since yesterday is worth a look, and
 * anything shorter would flag a device over a single missed uplink.
 */
const ACTIVE_WINDOW_MS = 24 * 60 * 60 * 1000;

//====================================
// HELPERS
//====================================

const actorFrom = (reason: string) => {
  const user = currentUser()!;
  return {
    username: user.username,
    displayName: user.displayName ?? null,
    scope: currentScope(),
    reason,
  };
};

/** An empty form, and what a submitted one carries. */
const inputFrom = (body: Record<string, unknown>): DeviceInput => {
  const text = (key: string) =>
    typeof body[key] === "string" ? (body[key] as string) : "";
  return {
    deviceId: text("deviceId"),
    name: text("name"),
    devEui: text("devEui"),
    joinEui: text("joinEui"),
    appKey: text("appKey"),
  };
};

const RADIO = {
  frequencyPlan: ttn.frequencyPlan,
  lorawanVersion: ttn.lorawanVersion,
  regionalParameters: ttn.regionalParameters,
};

//====================================
// REGISTRATION
//====================================

export const registerDeviceRoutes = (
  pages: Hono,
  guards: {
    requireRole: MiddlewareHandler;
    requireAdmin: MiddlewareHandler;
    sameOrigin: MiddlewareHandler;
  },
) => {
  /**
   * The overview: what TTN has registered, joined with what has actually
   * arrived. The join is on the upper-cased DevEUI, and it is a full outer one
   * in spirit - a device only TTN knows and an EUI only the measurements know
   * are both rows here, because those are the two interesting cases.
   */
  pages.get(
    PATH,
    guards.requireRole,
    ...ssr(async (c) => {
      c.get("page").title = "Geräte verwalten";
      const message = c.req.query("msg") ?? null;

      if (!ttn.enabled) {
        return (
          <ManageDevicesPage enabled={false} writable={false} rows={[]} />
        );
      }

      const [listed, activity] = await Promise.all([
        devices.listDevices(),
        measurements.deviceActivity(),
      ]);

      if (!listed.ok) {
        return (
          <ManageDevicesPage
            enabled
            writable={manage.writable}
            rows={[]}
            error={listed.error}
            message={message}
          />
        );
      }

      const now = Date.now();
      const seen = new Set<string>();
      const rows: DeviceRow[] = listed.data.map((device) => {
        const eui = device.devEui?.toUpperCase() ?? null;
        if (eui) seen.add(eui);
        const stats = eui ? activity.get(eui) : undefined;
        const lastSeen = stats?.lastSeen ?? null;
        return {
          deviceId: device.deviceId,
          name: device.name,
          devEui: eui,
          state:
            lastSeen && now - lastSeen.getTime() <= ACTIVE_WINDOW_MS
              ? "active"
              : "silent",
          count: stats?.count ?? 0,
          lastSeen,
        };
      });

      // Measurements arriving under an EUI TTN does not know. Invisible from
      // either side on its own, which is the whole reason for this page.
      for (const [eui, stats] of activity) {
        if (seen.has(eui)) continue;
        rows.push({
          deviceId: null,
          name: null,
          devEui: eui,
          state: "orphan",
          count: stats.count,
          lastSeen: stats.lastSeen,
        });
      }

      // Trouble first: orphans, then the silent ones, then by activity.
      const rank = { orphan: 0, silent: 1, active: 2 };
      rows.sort(
        (a, b) =>
          rank[a.state] - rank[b.state] ||
          (b.lastSeen?.getTime() ?? 0) - (a.lastSeen?.getTime() ?? 0),
      );

      return (
        <ManageDevicesPage
          enabled
          writable={manage.writable}
          rows={rows}
          message={message}
        />
      );
    }),
  );

  //====================================
  // REGISTERING A DEVICE
  //====================================

  /**
   * The next id in the `device-N` series, asked of TTN rather than remembered.
   *
   * TTN is the only place that knows which ids are taken - this application
   * keeps no device table - and somebody may well have registered one through
   * the console since the last look. An empty string when the list cannot be
   * fetched: a proposal counted from an incomplete list is worse than none,
   * because it would suggest a name that is already in use.
   */
  const proposedId = async () => {
    const listed = await devices.listDevices();
    return listed.ok
      ? nextDeviceId(listed.data.map((device) => device.deviceId))
      : "";
  };

  pages.get(
    `${PATH}/new`,
    guards.requireRole,
    ...ssr(async (c) => {
      if (!ttn.enabled || !manage.writable) return c.redirect(PATH, 303);
      c.get("page").title = "Gerät anlegen";
      // Awaited before the JSX: Solid compiles props into getters, and a getter
      // cannot be async. Same reason as in ./routes.tsx.
      const deviceId = await proposedId();
      return (
        <DeviceNewPage
          values={{ deviceId, name: "", devEui: "", joinEui: "", appKey: "" }}
          reason=""
          problems={{}}
          radio={RADIO}
        />
      );
    }),
  );

  /**
   * Registering. Every value is checked before a single call goes out, and the
   * form comes back filled in with one sentence per bad field rather than
   * sending somebody round the loop once per mistake.
   *
   * What comes back is not a redirect but the step-by-step result: registering
   * is four calls to four servers, and "es hat nicht geklappt" would hide
   * whether nothing happened or whether three quarters of a device is now
   * sitting in TTN.
   */
  pages.post(
    `${PATH}/new`,
    guards.requireRole,
    guards.sameOrigin,
    ...ssr(async (c) => {
      if (!ttn.enabled) return c.redirect(PATH, 303);
      if (!manage.writable) return c.redirect(`${PATH}?msg=nowrite`, 303);

      const body = await c.req.parseBody();
      const values = inputFrom(body);
      const reason = parseReason(body);

      // Someone who cleared the field gets the proposal anyway, counted again
      // here rather than trusted from the form: between opening the page and
      // submitting it, another device may have taken the number.
      if (values.deviceId.trim().length === 0) {
        values.deviceId = await proposedId();
      }

      const problems = deviceProblems(values);
      const normalised = normaliseDevice(values);

      if (!reason || !normalised) {
        c.get("page").title = "Gerät anlegen";
        return (
          <DeviceNewPage
            values={values}
            reason={reason ?? ""}
            problems={problems}
            reasonProblem={
              reason
                ? null
                : "Ohne Grund geht es nicht – er steht später im Geräteprotokoll."
            }
            radio={RADIO}
          />
        );
      }

      const result = await devices.createDevice(normalised);
      if (!result.ok) {
        c.get("page").title = "Gerät anlegen";
        return (
          <DeviceNewPage
            values={values}
            reason={reason}
            problems={{}}
            error={result.error}
            radio={RADIO}
          />
        );
      }

      const logged = await deviceLog.recordCreate(
        result.data,
        normalised.devEui,
        actorFrom(reason),
      );

      c.get("page").title =
        result.data.failed === null ? "Gerät angelegt" : "Gerät nicht angelegt";
      return (
        <DeviceCreatedPage
          outcome={result.data}
          logError={logged.ok ? null : logged.error}
        />
      );
    }),
  );

  //====================================
  // THE LOG
  //====================================

  pages.get(
    `${PATH}/log`,
    guards.requireRole,
    ...ssr(async (c) => {
      c.get("page").title = "Geräteprotokoll";
      const page = parsePage(c.req.query("page"));
      const { rows, total } = await deviceLog.list({
        page,
        perPage: PER_PAGE,
        offset: (page - 1) * PER_PAGE,
      });
      return (
        <DeviceLogPage
          entries={rows}
          total={total}
          page={page}
          perPage={PER_PAGE}
        />
      );
    }),
  );

  //====================================
  // ONE DEVICE
  //====================================

  /**
   * Everything the detail page needs. The activity comes from the same query the
   * overview uses, so both pages count a device the same way.
   */
  const load = async (deviceId: string) => {
    const [device, activity] = await Promise.all([
      devices.getDevice(deviceId),
      measurements.deviceActivity(),
    ]);
    if (!device.ok) return null;
    const stats = device.data.devEui
      ? activity.get(device.data.devEui.toUpperCase())
      : undefined;
    return {
      device: device.data,
      activity: {
        count: stats?.count ?? 0,
        lastSeen: stats?.lastSeen ?? null,
      },
    };
  };

  pages.get(
    `${PATH}/:deviceId`,
    guards.requireRole,
    ...ssr(async (c) => {
      if (!ttn.enabled) return c.redirect(PATH, 303);
      const loaded = await load(c.req.param("deviceId"));
      if (!loaded) return c.notFound();

      c.get("page").title = loaded.device.name ?? loaded.device.deviceId;
      return (
        <DevicePage
          device={loaded.device}
          activity={loaded.activity}
          writable={manage.writable}
          // The button is only offered to administrators; the route behind it
          // checks again, which is what makes this line merely cosmetic.
          maySeeKey={hasRole(currentUser(), "admin", auth)}
          message={c.req.query("msg") ?? null}
        />
      );
    }),
  );

  /**
   * Renaming. One call to the Identity Server, so unlike registering it cannot
   * end up half done - but it is still a change in somebody else's system, so it
   * needs a reason and it is logged either way. What TTN said about a failure
   * goes into the log rather than onto the page: the page shows fixed sentences
   * only, and the log is where the detail belongs.
   */
  pages.post(
    `${PATH}/:deviceId/rename`,
    guards.requireRole,
    guards.sameOrigin,
    ...ssr(async (c) => {
      const deviceId = c.req.param("deviceId");
      const back = (msg: string) =>
        c.redirect(`${PATH}/${encodeURIComponent(deviceId)}?msg=${msg}`, 303);

      if (!ttn.enabled) return c.redirect(PATH, 303);
      if (!manage.writable) return back("nowrite");

      const body = await c.req.parseBody();
      const name = typeof body.name === "string" ? body.name.trim() : "";
      const reason = parseReason(body);
      if (!reason) return back("noreason");
      if (name.length === 0) return back("badrequest");

      const current = await devices.getDevice(deviceId);
      if (!current.ok) return c.notFound();
      if (current.data.name === name) return back("nochange");

      const renamed = await devices.renameDevice(deviceId, name);
      await deviceLog.recordRename(
        deviceId,
        current.data.devEui,
        { from: current.data.name, to: name },
        renamed.ok ? null : renamed.error,
        actorFrom(reason),
      );

      return back(renamed.ok ? "renamed" : "renamefailed");
    }),
  );

  /**
   * Revealing the AppKey. Administrators only, and a POST rather than a link:
   * the key would otherwise sit in the browser history and in every proxy log
   * that records URLs, and a link is something one follows by accident.
   *
   * The answer is a fresh render of the detail page with the key in it. Nothing
   * is stored, so leaving the page is all it takes to put it away again.
   */
  pages.post(
    `${PATH}/:deviceId/key`,
    guards.requireAdmin,
    guards.sameOrigin,
    ...ssr(async (c) => {
      const deviceId = c.req.param("deviceId");
      if (!ttn.enabled) return c.redirect(PATH, 303);

      const loaded = await load(deviceId);
      if (!loaded) return c.notFound();
      const key = await devices.appKeyOf(deviceId);

      c.get("page").title = loaded.device.name ?? loaded.device.deviceId;
      return (
        <DevicePage
          device={loaded.device}
          activity={loaded.activity}
          writable={manage.writable}
          maySeeKey
          appKey={key.ok ? key.data : null}
          keyError={key.ok ? null : key.error}
        />
      );
    }),
  );
};
