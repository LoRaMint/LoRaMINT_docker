import type { Hono, MiddlewareHandler } from "hono";
import { ssr } from "../../../config/ssr";
import { currentUser, PAGES } from "../../../lib";
import {
  createEntry,
  deleteEntry,
  knownTriples,
  listEntries,
  updateEntry,
  type RangeMode,
} from "../../../services/dashboard";
import BoardManagePage from "./board-page";

/**
 * Curating the public /board page: which measurements it shows and how each
 * one's gauge is scaled. Board role only (or admin, via the "admin contains
 * the others" rule in lib/roles.ts) - see lib/roles.ts's fourth group.
 *
 * One page, like /management/groups: a table with each entry editable in
 * place, plus a form to add another. There is no separate "new" or "edit"
 * route - device_eui, sensor and measurand are an entry's identity and are not
 * editable once set, the same way a data group's name is not; getting one
 * wrong means removing the entry and adding it again.
 */

const PATH = "/management/board";

const back = (message: { saved?: string; error?: string }) => {
  const params = new URLSearchParams();
  if (message.saved) params.set("saved", message.saved);
  if (message.error) params.set("error", message.error);
  return `${PATH}?${params.toString()}`;
};

const text = (form: Record<string, unknown>, key: string) =>
  typeof form[key] === "string" ? (form[key] as string) : "";

const number = (form: Record<string, unknown>, key: string): number | null => {
  const raw = text(form, key).trim();
  if (raw === "") return null;
  const value = Number(raw.replace(",", "."));
  return Number.isFinite(value) ? value : null;
};

export const registerBoardRoutes = (
  pages: Hono,
  guards: { requireRole: MiddlewareHandler; sameOrigin: MiddlewareHandler },
) => {
  pages.get(
    PATH,
    guards.requireRole,
    ...ssr(async (c) => {
      c.get("page").title = PAGES.boardManage.label;
      const [entries, triples] = await Promise.all([listEntries(), knownTriples()]);
      return (
        <BoardManagePage
          entries={entries}
          triples={triples}
          {...(c.req.query("saved") ? { saved: c.req.query("saved")! } : {})}
          {...(c.req.query("error") ? { error: c.req.query("error")! } : {})}
        />
      );
    }),
  );

  pages.post(PATH, guards.requireRole, guards.sameOrigin, async (c) => {
    const form = await c.req.parseBody();
    const rangeMode = (text(form, "range_mode") === "dynamic" ? "dynamic" : "fixed") as RangeMode;

    const result = await createEntry(
      {
        name: text(form, "name"),
        deviceEui: text(form, "device_eui"),
        sensor: text(form, "sensor"),
        measurand: text(form, "measurand"),
        rangeMode,
        minValue: rangeMode === "fixed" ? number(form, "min_value") : null,
        maxValue: rangeMode === "fixed" ? number(form, "max_value") : null,
      },
      currentUser()!.username,
    );

    return c.redirect(
      back(
        result.ok
          ? { saved: `„${text(form, "name")}“ wurde angelegt.` }
          : { error: result.error },
      ),
      303,
    );
  });

  pages.post(`${PATH}/:id/update`, guards.requireRole, guards.sameOrigin, async (c) => {
    const id = c.req.param("id");
    const form = await c.req.parseBody();
    const rangeMode = (text(form, "range_mode") === "dynamic" ? "dynamic" : "fixed") as RangeMode;
    // The identity (device_eui/sensor/measurand) is not editable here - see the
    // module comment - so the existing entry supplies it via hidden fields.
    const result = await updateEntry(id, {
      name: text(form, "name"),
      deviceEui: text(form, "device_eui"),
      sensor: text(form, "sensor"),
      measurand: text(form, "measurand"),
      rangeMode,
      minValue: rangeMode === "fixed" ? number(form, "min_value") : null,
      maxValue: rangeMode === "fixed" ? number(form, "max_value") : null,
    });

    return c.redirect(
      back(
        result.ok
          ? { saved: `„${text(form, "name")}“ wurde gespeichert.` }
          : { error: result.error },
      ),
      303,
    );
  });

  pages.post(`${PATH}/:id/delete`, guards.requireRole, guards.sameOrigin, async (c) => {
    const id = c.req.param("id");
    const result = await deleteEntry(id);
    return c.redirect(
      back(result.ok ? { saved: "Eintrag entfernt." } : { error: result.error }),
      303,
    );
  });
};
