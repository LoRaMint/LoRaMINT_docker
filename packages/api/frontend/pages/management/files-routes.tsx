import type { Hono, MiddlewareHandler } from "hono";
import { ssr } from "../../../config/ssr";
import { PAGES } from "../../../lib";
import { uploads } from "../../../config";
import { isSafePath, MAX_UPLOAD_FILES } from "../../../lib/uploads";
import {
  createFolder,
  deleteFile,
  deleteFolder,
  listFiles,
  listFolders,
  moveFile,
  renameFile,
  renameFolder,
  setNote,
  setReleased,
  storeFile,
} from "../../../services/uploads";
import FilesPage from "./files-page";

/**
 * Looking after the files: uploading, releasing, annotating, renaming, moving,
 * and the folders they live in.
 *
 * Editor role, which an administrator holds as well through the "admin contains
 * the others" rule in lib/roles.ts.
 *
 * Redirect after every POST, with the outcome in the query string - the same
 * shape as every other management page here, and the reason is the same: a
 * reload must not upload the file again.
 *
 * **Every form says where it came from.** The browser these routes serve is
 * shown on two pages - here and at the foot of each guide editor - so the
 * destination cannot be a constant. It arrives in a hidden `back` field and is
 * checked before it is used: an open redirect is exactly what a "where did you
 * come from" field becomes if nobody looks at it.
 */

const PATH = PAGES.filesManage.href;

/**
 * Where to return to, as the form said - or this page, if it said anything
 * suspicious.
 *
 * The rule is narrow on purpose: it has to start with `/management/`, which is
 * behind the role check, and it may not begin with `//` - a protocol-relative
 * address that browsers read as another host, and the one spelling a
 * `startsWith("/")` test lets through.
 */
const safeBack = (typed: string): string =>
  typed.startsWith("/management/") && !typed.startsWith("//") ? typed : PATH;

const back = (to: string, params: { msg?: string; error?: string }) => {
  const [base, existing] = to.split("?");
  const query = new URLSearchParams(existing ?? "");
  query.delete("msg");
  query.delete("error");
  if (params.msg) query.set("msg", params.msg);
  if (params.error) query.set("error", params.error);
  const suffix = query.toString();
  return suffix ? `${base}?${suffix}` : base!;
};

const text = (form: Record<string, unknown>, key: string) =>
  typeof form[key] === "string" ? (form[key] as string) : "";

/** The folder the browser is showing, from `?ordner=`. Unknown means the root. */
export const folderFrom = (raw: string | undefined): string =>
  raw && isSafePath(raw) ? raw : "";

export const registerFileRoutes = (
  pages: Hono,
  guards: { requireEditor: MiddlewareHandler; sameOrigin: MiddlewareHandler },
) => {
  pages.get(
    PATH,
    guards.requireEditor,
    ...ssr(async (c) => {
      c.get("page").title = PAGES.filesManage.label;
      const folder = folderFrom(c.req.query("ordner"));
      // Loaded before the element: Solid's SSR transform makes a getter of every
      // dynamic prop, and `await` cannot live inside one.
      const [files, folders] = await Promise.all([listFiles(), listFolders()]);
      return (
        <FilesPage
          files={files}
          folders={folders}
          folder={folder}
          maxBytes={uploads.maxBytes}
          back={folder ? `${PATH}?ordner=${encodeURIComponent(folder)}` : PATH}
          {...(c.req.query("msg") ? { msg: c.req.query("msg")! } : {})}
          {...(c.req.query("error") ? { error: c.req.query("error")! } : {})}
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
        back(PATH, {
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
    const to = safeBack(text(form, "back"));
    const folder = folderFrom(text(form, "folder"));
    const sent = form.file;
    const files = (Array.isArray(sent) ? sent : [sent]).filter(
      (entry): entry is File => entry instanceof File && entry.size > 0,
    );

    if (files.length === 0) {
      return c.redirect(back(to, { error: "Es war keine Datei dabei." }), 303);
    }
    if (files.length > MAX_UPLOAD_FILES) {
      return c.redirect(
        back(to, {
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
      const result = await storeFile(file, { replace, folder });
      if (result.ok) stored += 1;
      else refused.push(`${file.name}: ${result.error}`);
    }

    if (refused.length === 0) {
      return c.redirect(
        back(to, { msg: stored > 1 ? "uploadedmany" : "uploaded" }),
        303,
      );
    }

    const prefix =
      stored > 0
        ? `${stored} von ${files.length} Dateien hochgeladen. Nicht hochgeladen: `
        : refused.length > 1
          ? "Keine der Dateien wurde hochgeladen. "
          : "";
    return c.redirect(back(to, { error: prefix + refused.join(" – ") }), 303);
  });

  /**
   * One helper for every route that takes a form, does one thing and reports
   * it. They differ only in the action and in what the success message is
   * called, and writing each of them out was six copies of the same four lines.
   */
  const action = (
    suffix: string,
    run: (
      form: Record<string, unknown>,
    ) => Promise<{ ok: true; path: string } | { ok: false; error: string }>,
    message: (form: Record<string, unknown>) => string,
  ) => {
    pages.post(`${PATH}${suffix}`, guards.requireEditor, guards.sameOrigin, async (c) => {
      const form = await c.req.parseBody();
      const to = safeBack(text(form, "back"));
      const result = await run(form);
      return c.redirect(
        result.ok ? back(to, { msg: message(form) }) : back(to, { error: result.error }),
        303,
      );
    });
  };

  /** Puts a file on the public download page, or takes it off again. */
  action(
    "/release",
    (form) => setReleased(text(form, "path"), text(form, "released") === "1"),
    (form) => (text(form, "released") === "1" ? "released" : "withdrawn"),
  );

  /**
   * The note beside a download. An empty field removes it, which is why the
   * outcome is two different codes: "gespeichert" for a sentence nobody typed
   * would be a lie, and silence would leave somebody wondering.
   */
  action(
    "/note",
    (form) => setNote(text(form, "path"), text(form, "note").trim()),
    (form) => (text(form, "note").trim().length > 0 ? "noted" : "unnoted"),
  );

  action("/rename", (form) => renameFile(text(form, "path"), text(form, "to")), () => "renamed");
  action("/delete", (form) => deleteFile(text(form, "path")), () => "deleted");

  /*
   * The destination is passed on as it arrived, not through `folderFrom`.
   * That helper answers "which folder is the browser showing" and turns
   * anything it does not like into the root - the right answer for a query
   * string, and the wrong one here, where it would quietly move a file
   * somewhere nobody chose. `moveFile` and `createFolder` refuse instead.
   */
  action("/move", (form) => moveFile(text(form, "path"), text(form, "folder")), () => "moved");

  action(
    "/folder",
    (form) => createFolder(text(form, "parent"), text(form, "name")),
    () => "foldercreated",
  );
  action(
    "/folder/rename",
    (form) => renameFolder(text(form, "path"), text(form, "name")),
    () => "folderrenamed",
  );
  action(
    "/folder/delete",
    (form) => deleteFolder(text(form, "path")),
    () => "folderdeleted",
  );
};
