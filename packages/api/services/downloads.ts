/**
 * Serving an uploaded file.
 *
 * Its own handler rather than `serveStatic`, and the reason is not path
 * traversal - Hono's middleware already rejects `..` segments before it joins
 * anything. It is the **content type**. `serveStatic` answers with whatever the
 * extension suggests, so an uploaded `evil.html` would be served as `text/html`,
 * *inline*, *from this origin* - which is stored cross-site scripting against
 * the administrators who trust this site, executed the moment somebody follows
 * the link. It also offers no `Content-Disposition`, no `nosniff` and no way to
 * refuse an extension.
 *
 * So the type comes from our own table and never from the file, and only the
 * extensions in that table are served at all. A file that reached the directory
 * some other way - copied into the volume by hand - is a 404 rather than a
 * surprise.
 *
 * `/downloads/:name` is a single path segment. Sub-directories are therefore not
 * forbidden but impossible, which is a better guarantee than a check.
 */

import type { Context } from "hono";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { uploads } from "../config";
import { isSafeStoredName, typeOf } from "../lib/uploads";

export const downloadHandler = async (c: Context): Promise<Response> => {
  const name = c.req.param("name");

  // The same rule the listing applies, so the two cannot disagree about what
  // exists. Everything hostile fails here by not being in the allowed shape.
  if (!name || !isSafeStoredName(name)) return c.notFound();

  const type = typeOf(name);
  if (!type) return c.notFound();

  const path = join(uploads.dir, name);
  let info: Awaited<ReturnType<typeof stat>>;
  try {
    info = await stat(path);
  } catch {
    return c.notFound();
  }
  if (!info.isFile()) return c.notFound();

  /*
   * A weak validator from size and modification time. Weak because the body is
   * not byte-identical across replacements of the same name - which is exactly
   * the case this has to get right: a file replaced under its old name must not
   * keep being served from a cache.
   */
  const etag = `W/"${info.size}-${info.mtimeMs}"`;
  if (c.req.header("If-None-Match") === etag) {
    return c.body(null, 304, { ETag: etag });
  }

  // The name is restricted to [a-z0-9._-], so it cannot break out of the quoted
  // filename - asserted in the tests rather than trusted.
  const disposition =
    type.disposition === "inline" ? "inline" : `attachment; filename="${name}"`;

  return c.body(Bun.file(path).stream(), 200, {
    "Content-Type": type.mime,
    "Content-Length": String(info.size),
    "Content-Disposition": disposition,
    // Our type is the only type. Without this a browser may sniff the body and
    // decide better, which is the whole hole we just closed.
    "X-Content-Type-Options": "nosniff",
    ETag: etag,
    /*
     * A minute, and revalidate after it. Names are not content-addressed: the
     * same address can be given new contents from the edit page, and a long
     * max-age would leave every proxy between here and a workshop serving
     * yesterday's worksheet with no way to say otherwise.
     */
    "Cache-Control": "public, max-age=60, must-revalidate",
  });
};
