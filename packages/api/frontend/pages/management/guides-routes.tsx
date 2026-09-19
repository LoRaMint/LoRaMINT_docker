import type { Hono, MiddlewareHandler } from "hono";
import { ssr } from "../../../config/ssr";
import { currentUser, PAGES } from "../../../lib";
import { uploads } from "../../../config";
import { flatten, pathOf } from "../../../lib/guide-tree";
import {
  allGuides,
  createGuide,
  deleteGuide,
  forgetPath,
  forwardings,
  guideBody,
  guidePath,
  guideTree,
  moveGuide,
  renameGuide,
  reorderGuide,
  saveGuide,
} from "../../../services/guides";
import { listFiles, listFolders } from "../../../services/uploads";
import GuidesPage, { type GuideRowView } from "./guides-page";
import GuideEditPage from "./guide-edit-page";
import { folderFrom } from "./files-routes";

/**
 * Writing the guides: the tree, and the editor for one page.
 *
 * Editor role, the same one the workshop page used to need, and for the same
 * reason: looking after teaching material is neither measurements nor devices,
 * and somebody who keeps a guide up to date has no business correcting a
 * reading.
 *
 * **The order the routes are registered in matters here too.** `/:id` is a
 * parameter and would swallow `/new`, `/move`, `/order`, `/delete` and
 * `/forget` if it came first. Hono takes the first matching route, so the fixed
 * paths go above it - the same trap `devices-routes.test.ts` exists for, and
 * `guides-routes.test.ts` checks this one.
 */

const PATH = PAGES.guidesManage.href;

const back = (params: { msg?: string; error?: string }) => {
  const query = new URLSearchParams();
  if (params.msg) query.set("msg", params.msg);
  if (params.error) query.set("error", params.error);
  const suffix = query.toString();
  return suffix ? `${PATH}?${suffix}` : PATH;
};

const toEditor = (id: string, params: { msg?: string; error?: string }) => {
  const query = new URLSearchParams();
  if (params.msg) query.set("msg", params.msg);
  if (params.error) query.set("error", params.error);
  const suffix = query.toString();
  return suffix ? `${PATH}/${id}?${suffix}` : `${PATH}/${id}`;
};

const text = (form: Record<string, unknown>, key: string) =>
  typeof form[key] === "string" ? (form[key] as string) : "";

/**
 * Every page as one option, labelled with its whole address.
 *
 * Indented by depth would be prettier and is a trap: the address is what makes
 * two pages called „Aufbau" tellable apart, and that is exactly the moment
 * somebody is choosing a parent.
 */
const parentOptions = () => {
  const all = allGuides();
  return flatten(guideTree({ drafts: true })).map(({ node, depth }) => ({
    id: node.id,
    label: `${"— ".repeat(depth - 1)}${node.title} (/${pathOf(node, all).join("/")})`,
  }));
};

export const registerGuideRoutes = (
  pages: Hono,
  guards: { requireEditor: MiddlewareHandler; sameOrigin: MiddlewareHandler },
) => {
  //---- Der Baum ----

  pages.get(
    PATH,
    guards.requireEditor,
    ...ssr(async (c) => {
      c.get("page").title = PAGES.guidesManage.label;
      const all = allGuides();
      const tree = guideTree({ drafts: true });

      const rows: GuideRowView[] = flatten(tree).map(({ node, depth }) => {
        const siblings = all
          .filter((entry) => entry.parentId === node.parentId)
          .sort((a, b) => a.position - b.position || a.slug.localeCompare(b.slug));
        const index = siblings.findIndex((entry) => entry.id === node.id);
        return {
          entry: node,
          depth,
          path: pathOf(node, all).join("/"),
          canRaise: index > 0,
          canLower: index < siblings.length - 1,
        };
      });

      // Awaited before the element: Solid compiles props into getters, and a
      // getter cannot be async.
      const paths = await forwardings();
      return (
        <GuidesPage
          rows={rows}
          options={parentOptions()}
          forwardings={paths}
          {...(c.req.query("msg") ? { msg: c.req.query("msg")! } : {})}
          {...(c.req.query("error") ? { error: c.req.query("error")! } : {})}
        />
      );
    }),
  );

  pages.post(`${PATH}/new`, guards.requireEditor, guards.sameOrigin, async (c) => {
    const form = await c.req.parseBody();
    const parent = text(form, "parent");
    const result = await createGuide(
      {
        title: text(form, "title"),
        slug: text(form, "slug"),
        parentId: parent.length > 0 ? parent : null,
      },
      currentUser()!.username,
    );

    // Straight into the editor on success: somebody who just named a page wants
    // to write it, and the list would make them find it again first.
    return c.redirect(
      result.ok ? toEditor(result.data.id, { msg: "created" }) : back({ error: result.error }),
      303,
    );
  });

  pages.post(`${PATH}/move`, guards.requireEditor, guards.sameOrigin, async (c) => {
    const form = await c.req.parseBody();
    const parent = text(form, "parent");
    const result = await moveGuide(
      text(form, "id"),
      parent.length > 0 ? parent : null,
    );
    return c.redirect(
      result.ok ? back({ msg: "moved" }) : back({ error: result.error }),
      303,
    );
  });

  pages.post(`${PATH}/order`, guards.requireEditor, guards.sameOrigin, async (c) => {
    const form = await c.req.parseBody();
    const direction = text(form, "direction") === "up" ? "up" : "down";
    const result = await reorderGuide(text(form, "id"), direction);
    return c.redirect(
      result.ok ? back({ msg: "reordered" }) : back({ error: result.error }),
      303,
    );
  });

  pages.post(`${PATH}/delete`, guards.requireEditor, guards.sameOrigin, async (c) => {
    const form = await c.req.parseBody();
    const result = await deleteGuide(text(form, "id"));
    return c.redirect(
      result.ok ? back({ msg: "deleted" }) : back({ error: result.error }),
      303,
    );
  });

  pages.post(`${PATH}/forget`, guards.requireEditor, guards.sameOrigin, async (c) => {
    const form = await c.req.parseBody();
    const result = await forgetPath(text(form, "path"));
    return c.redirect(
      result.ok ? back({ msg: "forgotten" }) : back({ error: result.error }),
      303,
    );
  });

  //---- Eine Seite ----
  //
  // Everything with a fixed path stands above this line. `/:id` matches any
  // single segment and would otherwise look for a guide called "new".

  /**
   * The editor, and the preview of it.
   *
   * `unsaved` is what makes the preview usable rather than a trap: without it
   * the box would be refilled from the database while the rendering underneath
   * showed the new text, so pressing "Speichern" after a preview would save the
   * *old* version. The box shows what was typed; only the database is behind.
   */
  const renderEditor = async (
    id: string,
    query: {
      folder: string;
      msg?: string;
      error?: string;
      preview?: string;
      unsaved?: { title: string; body: string; published: boolean };
    },
  ) => {
    const stored = await guideBody(id);
    if (!stored) return null;
    const guide = query.unsaved ? { ...stored, ...query.unsaved } : stored;
    const [files, folders] = await Promise.all([listFiles(), listFolders()]);
    const self = query.folder
      ? `${PATH}/${id}?ordner=${encodeURIComponent(query.folder)}`
      : `${PATH}/${id}`;

    return (
      <GuideEditPage
        guide={guide}
        path={guidePath(guide)}
        files={files}
        folders={folders}
        folder={query.folder}
        maxBytes={uploads.maxBytes}
        back={self}
        {...(query.preview !== undefined ? { preview: query.preview } : {})}
        {...(query.msg ? { msg: query.msg } : {})}
        {...(query.error ? { error: query.error } : {})}
      />
    );
  };

  pages.get(
    `${PATH}/:id`,
    guards.requireEditor,
    ...ssr(async (c) => {
      const page = await renderEditor(c.req.param("id"), {
        folder: folderFrom(c.req.query("ordner")),
        ...(c.req.query("msg") ? { msg: c.req.query("msg")! } : {}),
        ...(c.req.query("error") ? { error: c.req.query("error")! } : {}),
      });
      if (!page) return c.notFound();
      c.get("page").title = PAGES.guidesManage.label;
      return page;
    }),
  );

  pages.post(`${PATH}/:id`, guards.requireEditor, guards.sameOrigin, async (c) => {
    const id = c.req.param("id");
    const form = await c.req.parseBody();
    const result = await saveGuide(
      id,
      {
        title: text(form, "title"),
        body: text(form, "body"),
        // An unchecked box sends nothing at all, which is how a checkbox says
        // false - and how a page gets taken back to being a draft.
        published: form.published === "1",
      },
      currentUser()!.username,
    );
    return c.redirect(
      result.ok ? toEditor(id, { msg: "saved" }) : toEditor(id, { error: result.error }),
      303,
    );
  });

  /**
   * The preview: renders what is in the box without saving it.
   *
   * A POST because the text travels in the body - it is far longer than a query
   * string should carry - and it renders the page itself rather than
   * redirecting, since the whole point is to show something that is not stored
   * anywhere.
   */
  pages.post(
    `${PATH}/:id/preview`,
    guards.requireEditor,
    guards.sameOrigin,
    ...ssr(async (c) => {
      const form = await c.req.parseBody();
      const page = await renderEditor(c.req.param("id"), {
        folder: folderFrom(c.req.query("ordner")),
        preview: text(form, "body"),
        unsaved: {
          title: text(form, "title"),
          body: text(form, "body"),
          published: form.published === "1",
        },
      });
      if (!page) return c.notFound();
      c.get("page").title = PAGES.guidesManage.label;
      return page;
    }),
  );

  pages.post(`${PATH}/:id/slug`, guards.requireEditor, guards.sameOrigin, async (c) => {
    const id = c.req.param("id");
    const form = await c.req.parseBody();
    const result = await renameGuide(id, text(form, "slug"));
    return c.redirect(
      result.ok ? toEditor(id, { msg: "renamed" }) : toEditor(id, { error: result.error }),
      303,
    );
  });
};
