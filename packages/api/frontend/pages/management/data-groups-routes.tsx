import type { Hono, MiddlewareHandler } from "hono";
import { ssr } from "../../../config/ssr";
import { auth } from "../../../config";
import { currentUser } from "../../../lib";
import {
  declareDataGroup,
  describeDataGroup,
  listDataGroups,
  withdrawDataGroup,
} from "../../../services/data-groups";
import DataGroupsPage from "./data-groups-page";

/**
 * Maintaining the declaration of which directory groups count as data groups.
 *
 * Administrators only. Not because the page is dangerous today - nothing is
 * restricted by these groups yet - but because it will decide who may read which
 * measurements, and a page that grows into an authorisation control should not
 * have to be locked down later, once people are used to reaching it.
 */

const PATH = "/management/groups";

/** Redirect after POST, so a refresh never repeats the write. */
const back = (message: { saved?: string; error?: string }) => {
  const params = new URLSearchParams();
  if (message.saved) params.set("saved", message.saved);
  if (message.error) params.set("error", message.error);
  return `${PATH}?${params.toString()}`;
};

export const registerDataGroupRoutes = (
  pages: Hono,
  guards: { requireAdmin: MiddlewareHandler; sameOrigin: MiddlewareHandler },
) => {
  pages.get(
    PATH,
    guards.requireAdmin,
    ...ssr(async (c) => {
      c.get("page").title = "Datengruppen";
      // Awaited before the JSX: Solid compiles props into getters, and a getter
      // cannot be async.
      const groups = await listDataGroups();
      return (
        <DataGroupsPage
          groups={groups}
          ownGroups={currentUser()?.groups ?? []}
          {...(c.req.query("saved") ? { saved: c.req.query("saved")! } : {})}
          {...(c.req.query("error") ? { error: c.req.query("error")! } : {})}
        />
      );
    }),
  );

  pages.post(PATH, guards.requireAdmin, guards.sameOrigin, async (c) => {
    const form = await c.req.parseBody();
    const text = (key: string) =>
      typeof form[key] === "string" ? (form[key] as string) : "";

    const result = await declareDataGroup(
      { name: text("name"), label: text("label"), note: text("note") },
      currentUser()!.username,
      auth,
    );

    return c.redirect(
      back(
        result.ok
          ? { saved: `„${text("name")}“ gilt jetzt als Datengruppe.` }
          : { error: result.error },
      ),
      303,
    );
  });

  /**
   * Correcting a group's label or note.
   *
   * The name is the key and stays put - it has to match the directory exactly,
   * and measurements point at it. Only what the label says about it changes.
   */
  pages.post(
    `${PATH}/describe`,
    guards.requireAdmin,
    guards.sameOrigin,
    async (c) => {
      const form = await c.req.parseBody();
      const text = (key: string) =>
        typeof form[key] === "string" ? (form[key] as string) : "";
      const name = text("name");

      const result = await describeDataGroup(name, {
        label: text("label"),
        note: text("note"),
      });
      return c.redirect(
        back(
          result.ok
            ? { saved: `Beschreibung von „${name}“ gespeichert.` }
            : { error: result.error },
        ),
        303,
      );
    },
  );

  pages.post(
    `${PATH}/withdraw`,
    guards.requireAdmin,
    guards.sameOrigin,
    async (c) => {
      const form = await c.req.parseBody();
      const name = typeof form.name === "string" ? form.name : "";
      const result = await withdrawDataGroup(name);

      return c.redirect(
        back(
          result.ok
            ? {
                saved:
                  `„${name}“ gilt nicht mehr als Datengruppe. Im Verzeichnis ` +
                  "hat sich nichts geändert.",
              }
            : { error: result.error },
        ),
        303,
      );
    },
  );
};
