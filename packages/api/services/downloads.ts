/**
 * Serving an uploaded file, and packing a folder of them.
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
 * **What changed when folders arrived.** `/downloads/:name` used to match a
 * single path segment, so a sub-directory was not forbidden but impossible -
 * a better guarantee than a check, and the one this file used to rest on. The
 * route is now a wildcard, so that guarantee is gone and has to be replaced.
 * Three checks stand in its place, and each fails differently on purpose:
 *
 *   `isSafePath` decides by **shape** - every segment has to be in the allowed
 *   character set, which rules out `..`, a leading dot, a backslash and every
 *   percent-encoded spelling of them.
 *
 *   `resolve()` against the upload directory decides by **location** - where
 *   the string actually points, whatever it looks like.
 *
 *   `lstat` decides by **kind** - a symlink is not a regular file, so a link
 *   placed in the volume by hand cannot smuggle a path that passes both of the
 *   above.
 *
 * This single point is what turns "folders are allowed" into "the file system
 * is public" if it gives way, which is why there are three of them and a test
 * for each.
 *
 * **The package is its own route, not `/downloads/x.zip`.** `loramint.zip` is a
 * real uploaded file, and a folder called `loramint` would otherwise share an
 * address with it. `/paket/<ordner>` cannot collide with anything that is
 * served.
 */

import type { Context } from "hono";
import { zipSync, type Zippable } from "fflate";
import { lstat } from "node:fs/promises";
import { isSafePath, typeOf } from "../lib/uploads";
import { releasedUnder, resolveInUploads } from "./uploads";

/**
 * The most a package may weigh before it is refused, uncompressed.
 *
 * `zipSync` builds the whole archive in memory, and so does reading the files
 * into it - so one click on a folder of videos is a spike of twice its size on
 * a server that is also answering everything else. Fifty megabytes is well
 * above a term's worth of worksheets and sketches and far below anything that
 * would hurt.
 *
 * Refused with a sentence rather than trimmed silently: a ZIP that is missing
 * the file somebody came for, without saying so, is worse than no ZIP.
 */
export const MAX_PACKET_BYTES = 50 * 1024 * 1024;

/**
 * What comes after the prefix, exactly as it was requested.
 *
 * Taken from `c.req.path` rather than from a route parameter, and **not
 * decoded** - both on purpose. A `*` route in Hono captures nothing that
 * `c.req.param` can return, and the named alternative (`:pfad{.*}`) hands the
 * value back percent-decoded, which would turn `..%2f..%2fetc` into a real
 * `../../etc` before anything had looked at it.
 *
 * Undecoded, that same request is one segment containing `%`, which is not in
 * the allowed character set and fails on the spot. Decoding is a step this
 * route simply does not need: every servable path is made of `[a-z0-9._-]` and
 * `/`, and a browser following a link percent-encodes none of those.
 */
const pathUnder = (c: Context, prefix: string): string => {
  const path = c.req.path;
  return path.startsWith(prefix) ? path.slice(prefix.length) : "";
};

export const downloadHandler = async (c: Context): Promise<Response> => {
  const path = pathUnder(c, "/downloads/");

  // The same rule the listing applies, so the two cannot disagree about what
  // exists. Everything hostile fails here by not being in the allowed shape.
  // `resolveInUploads` applies it again and then checks the resolved location.
  const absolute = resolveInUploads(path);
  if (!absolute) return c.notFound();

  const name = path.slice(path.lastIndexOf("/") + 1);
  const type = typeOf(name);
  if (!type) return c.notFound();

  /*
   * `lstat` and not `stat`, and it is the third bolt rather than a detail.
   *
   * `stat` follows a symbolic link, so a link placed in the volume by hand and
   * named `hosts.txt` would be served with the contents of whatever it points
   * at - a path that passes both checks above, because as a *string* it is
   * entirely ordinary. `lstat` reports the link itself, which is not a regular
   * file, so it falls out here.
   *
   * It also makes this route agree with the listing again: `listFiles` skips a
   * symlink because `readdir` reports its own type, and the invariant those two
   * share is that neither shows what the other would refuse.
   */
  let info: Awaited<ReturnType<typeof lstat>>;
  try {
    info = await lstat(absolute);
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

  // Every segment is restricted to [a-z0-9._-], so the name cannot break out of
  // the quoted filename - asserted in the tests rather than trusted.
  const disposition =
    type.disposition === "inline" ? "inline" : `attachment; filename="${name}"`;

  return c.body(Bun.file(absolute).stream(), 200, {
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

/** The file name a package is offered under: `arbeitsblaetter.zip`. */
const packetName = (folder: string): string =>
  `${folder.slice(folder.lastIndexOf("/") + 1) || "dateien"}.zip`;

/**
 * A folder as one ZIP: everything released in it and below it.
 *
 * **Released, not present.** The download page is public and lists only what
 * has been released, so a package that took the whole folder would be a way
 * round the release with one extra click. The entries come from
 * `releasedUnder`, which is the same list the page renders.
 *
 * Paths inside the archive are relative to the folder, so unpacking it
 * reproduces the structure rather than a flat heap or an absolute path.
 */
export const packetHandler = async (c: Context): Promise<Response> => {
  const folder = pathUnder(c, "/paket/");
  if (!isSafePath(folder)) return c.notFound();
  if (!resolveInUploads(folder)) return c.notFound();

  const files = await releasedUnder(folder);
  if (files.length === 0) return c.notFound();

  const total = files.reduce((sum, file) => sum + file.bytes, 0);
  if (total > MAX_PACKET_BYTES) {
    const grenze = Math.round(MAX_PACKET_BYTES / 1024 / 1024);
    return c.text(
      `Dieser Ordner ist mit ${Math.round(total / 1024 / 1024)} MB zu gross zum ` +
        `Packen; erlaubt sind ${grenze} MB. Lade die Dateien einzeln herunter.`,
      413,
    );
  }

  const entries: Zippable = {};
  for (const file of files) {
    const absolute = resolveInUploads(file.path);
    // Belt and braces: the path came out of our own listing, so this cannot
    // fail - and if it ever does, the file is left out rather than reached for.
    if (!absolute) continue;
    entries[file.path.slice(folder.length === 0 ? 0 : folder.length + 1)] =
      new Uint8Array(await Bun.file(absolute).arrayBuffer());
  }

  const zip = zipSync(entries, { level: 6 });

  return c.body(zip as unknown as ArrayBuffer, 200, {
    "Content-Type": "application/zip",
    "Content-Length": String(zip.byteLength),
    "Content-Disposition": `attachment; filename="${packetName(folder)}"`,
    "X-Content-Type-Options": "nosniff",
    // Built on every request from files that can change underneath, and never
    // large. Caching it would mean handing out a package missing the worksheet
    // that was released a minute ago.
    "Cache-Control": "no-store",
  });
};
