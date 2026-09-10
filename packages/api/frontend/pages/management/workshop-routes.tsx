import type { Hono, MiddlewareHandler } from "hono";
import { ssr } from "../../../config/ssr";
import { currentUser, PAGES } from "../../../lib";
import { content, uploads } from "../../../config";
import { MAX_UPLOAD_FILES } from "../../../lib/uploads";
import { saveSetting } from "../../../services/settings";
import {
  deleteFile,
  listFiles,
  setHidden,
  setNote,
  storeFile,
} from "../../../services/uploads";
import WorkshopManagePage from "./workshop-page";

/**
 * Writing the workshop page and looking after the files offered on it.
 *
 * Editor role, which an administrator holds as well through the "admin contains
 * the others" rule in lib/roles.ts. It is the one area of this application that
 * is neither about measurements nor about devices, which is exactly why it got a
 * role of its own: somebody who keeps the workshop material up to date has no
 * business correcting a reading.
 *
 * Redirect after every POST, with the outcome in the query string - the same
 * shape as the configuration page, and the reason is the same: a reload must not
 * upload the file again.
 */

const PATH = PAGES.workshopManage.href;
const KEY = "CONTENT_WORKSHOP";

const back = (params: { msg?: string; error?: string }) => {
  const query = new URLSearchParams();
  if (params.msg) query.set("msg", params.msg);
  if (params.error) query.set("error", params.error);
  const suffix = query.toString();
  return suffix ? `${PATH}?${suffix}` : PATH;
};

const text = (form: Record<string, unknown>, key: string) =>
  typeof form[key] === "string" ? (form[key] as string) : "";

export const registerWorkshopRoutes = (
  pages: Hono,
  guards: { requireEditor: MiddlewareHandler; sameOrigin: MiddlewareHandler },
) => {
  pages.get(
    PATH,
    guards.requireEditor,
    ...ssr(async (c) => {
      c.get("page").title = PAGES.workshopManage.label;
      // Loaded before the element: Solid's SSR transform makes a getter of every
      // dynamic prop, and `await` cannot live inside one.
      const files = await listFiles();
      return (
        <WorkshopManagePage
          text={content.workshop ?? ""}
          files={files}
          maxBytes={uploads.maxBytes}
          {...(c.req.query("msg") ? { msg: c.req.query("msg")! } : {})}
          {...(c.req.query("error") ? { error: c.req.query("error")! } : {})}
        />
      );
    }),
  );

  pages.post(PATH, guards.requireEditor, guards.sameOrigin, async (c) => {
    const form = await c.req.parseBody();
    const value = text(form, "value");

    if (value === (content.workshop ?? "")) {
      return c.redirect(back({ msg: "nochange" }), 303);
    }

    const result = await saveSetting(KEY, value, null, currentUser()!.username);
    return c.redirect(
      result.ok ? back({ msg: "saved" }) : back({ error: result.error }),
      303,
    );
  });

  /**
   * The preview: renders what is in the box without saving it.
   *
   * A POST because the text travels in the body - it is longer than a query
   * string should carry - and it renders the page itself rather than redirecting,
   * since the whole point is to show something that is not stored anywhere.
   */
  pages.post(
    `${PATH}/preview`,
    guards.requireEditor,
    guards.sameOrigin,
    ...ssr(async (c) => {
      const form = await c.req.parseBody();
      c.get("page").title = PAGES.workshopManage.label;
      const files = await listFiles();
      return (
        <WorkshopManagePage
          text={text(form, "value")}
          preview={text(form, "value")}
          files={files}
          maxBytes={uploads.maxBytes}
        />
      );
    }),
  );

  /**
   * Uploading. One file or twenty - the form allows several, and each is judged
   * on its own: a name that is already taken does not stop the rest, it is
   * named in the message afterwards. Anything else would make a batch of ten an
   * all-or-nothing affair over a single duplicate.
   */
  pages.post(`${PATH}/upload`, guards.requireEditor, guards.sameOrigin, async (c) => {
    /*
     * The size is checked before the body is parsed, because parsing buffers all
     * of it: `parseBody` on a two-gigabyte upload has already cost the memory by
     * the time anything can look at the file. Content-Length is a hint - chunked
     * requests send none - so `storeFile` checks the real size of each file
     * afterwards. This is the only limit that exists: Traefik imposes none by
     * default and Bun's own ceiling is far above anything meant here.
     *
     * The ceiling is the per-file limit times the number of files allowed,
     * because several files legitimately add up past the single-file limit. It
     * is a guard against an absurd body, not the check that decides a file.
     */
    const declared = Number(c.req.header("Content-Length") ?? "");
    const slack = 8 * 1024;
    if (
      Number.isFinite(declared) &&
      declared > uploads.maxBytes * MAX_UPLOAD_FILES + slack
    ) {
      const grenze = Math.round(uploads.maxBytes / 1024 / 1024);
      return c.redirect(
        back({
          error:
            `Zu viel auf einmal. Erlaubt sind höchstens ${MAX_UPLOAD_FILES} ` +
            `Dateien mit je ${grenze} MB.`,
        }),
        303,
      );
    }

    // `all: true` is what turns repeated fields into an array; without it only
    // the last file of a multiple selection would arrive.
    const form = await c.req.parseBody({ all: true });
    const sent = form.file;
    const files = (Array.isArray(sent) ? sent : [sent]).filter(
      (entry): entry is File => entry instanceof File && entry.size > 0,
    );

    if (files.length === 0) {
      return c.redirect(back({ error: "Es war keine Datei dabei." }), 303);
    }
    if (files.length > MAX_UPLOAD_FILES) {
      return c.redirect(
        back({
          error:
            `${files.length} Dateien auf einmal sind zu viele. Erlaubt sind ` +
            `${MAX_UPLOAD_FILES} pro Vorgang.`,
        }),
        303,
      );
    }

    const replace = text(form, "replace") === "1";
    const refused: string[] = [];
    let stored = 0;

    // In order and one after another, not in parallel: two uploads of the same
    // name would otherwise both find it free and the second would win silently,
    // and `uniqueName` counts against a listing that must not move underneath.
    for (const file of files) {
      const result = await storeFile(file, { replace });
      if (result.ok) stored += 1;
      else refused.push(`${file.name}: ${result.error}`);
    }

    if (refused.length === 0) {
      return c.redirect(back({ msg: stored > 1 ? "uploadedmany" : "uploaded" }), 303);
    }

    const prefix =
      stored > 0
        ? `${stored} von ${files.length} Dateien hochgeladen. Nicht hochgeladen: `
        : refused.length > 1
          ? "Keine der Dateien wurde hochgeladen. "
          : "";
    return c.redirect(back({ error: prefix + refused.join(" – ") }), 303);
  });

  /** Hides a file from the public list, or puts it back. */
  pages.post(`${PATH}/visibility`, guards.requireEditor, guards.sameOrigin, async (c) => {
    const form = await c.req.parseBody();
    const hidden = text(form, "hidden") === "1";
    const result = await setHidden(text(form, "name"), hidden);
    return c.redirect(
      result.ok
        ? back({ msg: hidden ? "hidden" : "shown" })
        : back({ error: result.error }),
      303,
    );
  });

  /**
   * The note beside a download. An empty field removes it, which is why the
   * outcome is two different codes: "gespeichert" for a sentence nobody typed
   * would be a lie, and silence would leave somebody wondering.
   */
  pages.post(`${PATH}/note`, guards.requireEditor, guards.sameOrigin, async (c) => {
    const form = await c.req.parseBody();
    const note = text(form, "note").trim();
    const result = await setNote(text(form, "name"), note);
    return c.redirect(
      result.ok
        ? back({ msg: note.length > 0 ? "noted" : "unnoted" })
        : back({ error: result.error }),
      303,
    );
  });

  pages.post(`${PATH}/delete`, guards.requireEditor, guards.sameOrigin, async (c) => {
    const form = await c.req.parseBody();
    const result = await deleteFile(text(form, "name"));
    return c.redirect(
      result.ok ? back({ msg: "deleted" }) : back({ error: result.error }),
      303,
    );
  });
};
