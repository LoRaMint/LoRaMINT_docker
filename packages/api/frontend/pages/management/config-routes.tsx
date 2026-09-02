import type { Hono, MiddlewareHandler } from "hono";
import { ssr } from "../../../config/ssr";
import { manage } from "../../../config";
import {
  saveSetting,
  settingsDetail,
  type StoredSetting,
} from "../../../services/settings";
import { currentUser, PAGES } from "../../../lib";
import {
  CATALOG,
  displayValue,
  effectiveValue,
  featureStates,
  GROUP_LABELS,
  GROUP_ORDER,
  originOf,
  settingFor,
  strandedInEnv,
  warningsFor,
  type Env,
} from "../../../lib/config-catalog";
import ConfigPage, { type ConfigGroup } from "./config-page";

/**
 * The configuration overview.
 *
 * Administrators only, and not because the values are interesting: the page
 * lists directory bind accounts, database roles and the shape of every secret.
 * That is deployment knowledge, one rung above the management section it sits
 * in.
 *
 * Everything is read from `Bun.env` rather than from the `config` module. Both
 * would give the same answer for the value, but only the raw environment can say
 * where it came from - `config.ts` has already collapsed "set to 8090" and
 * "defaulted to 8090" into one number by the time anybody can look.
 */

const PATH = "/management/config";

/** The live environment, which is the whole subject of this page. */
const currentEnv = (): Env => Bun.env as Env;

const rowsFor = (env: Env, detail: Map<string, StoredSetting>) =>
  GROUP_ORDER.map((group): ConfigGroup => ({
    group,
    label: GROUP_LABELS[group],
    rows: CATALOG.filter((setting) => setting.group === group).map((setting) => ({
      key: setting.key,
      meaning: setting.meaning,
      display: displayValue(setting, env),
      origin: originOf(setting, env),
      required: setting.required === true,
      // Only a value that exists can be revealed, and only one that is hidden in
      // the first place.
      revealable:
        (setting.kind === "secret" || setting.kind === "dsn") &&
        effectiveValue(setting, env) !== null,
      warnings: warningsFor(setting, env),
      editable: setting.tier === "movable",
      // Never prefilled for a secret: the page does not receive one, and an
      // input that showed it would put it back on the screen the reveal button
      // is careful to keep it off.
      editValue:
        setting.kind === "secret"
          ? ""
          : setting.kind === "markdown"
            ? (effectiveValue(setting, env) ?? "").replace(/\\n/g, "\n")
            : (effectiveValue(setting, env) ?? ""),
      // A text box rather than a one-line field, and the legacy backslash-n from
      // the environment file shown as the line break it stands for - otherwise
      // the first save would store the escape sequence as literal characters.
      multiline: setting.kind === "markdown",
      stranded: strandedInEnv(setting, env),
      note: detail.get(setting.key)?.note ?? "",
      updatedBy: detail.get(setting.key)?.updatedBy ?? null,
      updatedAt: detail.get(setting.key)?.updatedAt ?? null,
    })),
  })).filter((group) => group.rows.length > 0);

export const registerConfigRoutes = (
  pages: Hono,
  guards: { requireAdmin: MiddlewareHandler; sameOrigin: MiddlewareHandler },
) => {
  pages.get(
    PATH,
    guards.requireAdmin,
    ...ssr(async (c) => {
      c.get("page").title = PAGES.config.label;
      const env = currentEnv();
      const detail = await settingsDetail();
      const codes: Record<string, { text: string; tone: "success" | "error" }> = {
        saved: { text: "Einstellung gespeichert.", tone: "success" },
        nochange: { text: "Der Wert war schon so.", tone: "success" },
        failed: { text: "Die Einstellung wurde nicht gespeichert.", tone: "error" },
      };
      const msg = c.req.query("msg");
      return (
        <ConfigPage
          features={featureStates(env)}
          groups={rowsFor(env, detail)}
          writable={manage.writable}
          message={msg ? (codes[msg] ?? null) : null}
        />
      );
    }),
  );

  /**
   * Revealing one secret.
   *
   * A POST rather than a link, for the same reasons as the AppKey on the device
   * page: a link is something one follows by accident, and the value would
   * otherwise sit in the browser history and in every proxy log that records
   * URLs. The answer is a fresh render of this page with that single value in
   * it; nothing is stored, so leaving the page puts it away again.
   */
  pages.post(
    `${PATH}/reveal`,
    guards.requireAdmin,
    guards.sameOrigin,
    ...ssr(async (c) => {
      c.get("page").title = PAGES.config.label;
      const env = currentEnv();
      const detail = await settingsDetail();
      const body = await c.req.parseBody();
      const key = typeof body.key === "string" ? body.key : "";

      // Resolved through the catalogue rather than read out of the environment
      // directly: a submitted name can then only ever name a setting this
      // application knows, not any variable the process happens to carry.
      const setting = settingFor(key);
      const value = setting ? effectiveValue(setting, env) : null;
      const allowed =
        setting !== undefined &&
        (setting.kind === "secret" || setting.kind === "dsn") &&
        value !== null;

      return (
        <ConfigPage
          features={featureStates(env)}
          groups={rowsFor(env, detail)}
          writable={manage.writable}
          // So the page comes back on the category the button was pressed in.
          openGroup={setting?.group ?? null}
          revealed={allowed ? { key: setting.key, value: value! } : null}
          revealError={allowed ? null : "Diese Einstellung lässt sich nicht anzeigen."}
        />
      );
    }),
  );

  /**
   * Saving one setting.
   *
   * No reason is asked for and nothing is logged, unlike everywhere else in this
   * application. A configuration change is not a correction to somebody's data,
   * and a justification typed while saving would end up buried in a list; the
   * note travels with the value instead and stays where it explains something.
   * `updated_by` and `updated_at` on the row answer the rest.
   *
   * A blank value for a secret means "leave it alone" rather than "clear it":
   * the input is never prefilled, so submitting the form without touching that
   * field must not wipe a key.
   */
  pages.post(
    `${PATH}/save`,
    guards.requireAdmin,
    guards.sameOrigin,
    ...ssr(async (c) => {
      const body = await c.req.parseBody();
      const key = typeof body.key === "string" ? body.key : "";

      // Back to the category the change was made in. The fragment is what the
      // island reads, so the page comes back where it was left rather than at
      // the top - which after a save is the whole point.
      const group = settingFor(key)?.group;
      const back = (msg: string) =>
        c.redirect(
          `${PATH}?msg=${msg}${group ? `#bereich-${group}` : ""}`,
          303,
        );
      if (!manage.writable) return back("failed");
      const raw = typeof body.value === "string" ? body.value : "";
      const note = typeof body.note === "string" ? body.note : "";

      const setting = settingFor(key);
      if (setting === undefined || setting.tier !== "movable") {
        return back("failed");
      }
      // A secret whose field was left alone keeps its value; the note may still
      // have changed, so this is not a reason to do nothing.
      const value = setting.kind === "secret" && raw.trim().length === 0 ? null : raw;

      const result = await saveSetting(key, value, note, currentUser()!.username);
      return back(result.ok ? "saved" : "failed");
    }),
  );
};
