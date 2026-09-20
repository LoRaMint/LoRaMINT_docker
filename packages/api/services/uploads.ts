/**
 * The files: listing, storing, releasing, annotating, renaming, moving,
 * removing - and the folders they live in.
 *
 * **The directory is the truth.** There is no table of file metadata, and that
 * is a decision rather than an omission. Name, size and date come from `readdir`
 * and `stat`, where they are correct by definition; a table would be a second
 * copy in a system that is backed up and restored *separately* from this one, so
 * the two drifting apart would not be a rare race but the expected result of the
 * first restore.
 *
 * The same reasoning puts the state that is not in the files themselves - which
 * of them are released, and the note beside each - into files beside them rather
 * than into the database. `.released` and `.notes` travel with the volume, so
 * neither can describe a set of files that is no longer there. Both live in the
 * root directory and key on the **relative path**, so one pair of side files
 * describes the whole tree; a file carries its note and its release with it when
 * it moves, because moving it is what rewrites the key.
 *
 * **Released, not hidden - the default turned round.** Until folders arrived the
 * question was which files to *hide* from the public list, so anything uploaded
 * appeared there until somebody said otherwise. With a tree of working material
 * that is the wrong way round: an intermediate picture, a draft worksheet and a
 * photograph pasted into a guide are the common case, and a public shelf is the
 * exception. So nothing appears on /downloads until it is released, and the ZIP
 * of a folder contains exactly what the page lists.
 *
 * Reachability is a different question and has not changed: **a file that is not
 * released is still served under its address.** It has to be, or a picture
 * embedded in a guide would disappear from the text. Anyone who knows the
 * address can fetch it. This is presentation, never access control - the
 * management page says so in as many words, because "not released" invites the
 * other reading.
 *
 * One host, one directory: the volume is not shared between replicas, so two
 * instances behind the proxy would each answer from their own set of files. The
 * settings cache in services/settings.ts already anticipates a second instance;
 * this does not, and would need to be the next thing looked at.
 */

import type { Dirent } from "node:fs";
import {
  link,
  mkdir,
  readdir,
  readFile,
  rename,
  rmdir,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { uploads } from "../config";
import {
  isSafePath,
  isSafeStoredName,
  joinPath,
  sanitizeFileName,
  sanitizeFolderName,
  sanitizeNote,
  sanitizeRename,
  splitPath,
  typeOf,
  uniqueName,
} from "../lib/uploads";

//====================================
// TYPES
//====================================

export type StoredFile = {
  /** Relative to the upload root: `bilder/aufbau.png`, or `blatt.pdf`. */
  path: string;
  /** The last segment of the path. */
  name: string;
  /** The folder it sits in. `""` at the root. */
  folder: string;
  bytes: number;
  changed: Date;
  /** Listed on the public download page. Absent by default. */
  released: boolean;
  /** One line beside the download - where it came from, what to know. */
  note: string;
};

export type UploadResult =
  | { ok: true; path: string }
  | { ok: false; error: string };

//====================================
// THE BOOKKEEPING FILES
//====================================

/** Which paths appear on the public page. Never listed, never served. */
const RELEASED_FILE = ".released";

/**
 * Where the notes live. Beside the files for the same reason `.released` is: a
 * note describes a file, and a note kept in the database would survive a
 * restore that the file did not - leaving a sentence about a source next to
 * nothing, or worse, next to a different file uploaded later under that path.
 */
const NOTES_FILE = ".notes";

/** Prefix of a half-written upload. Cannot collide with a stored name. */
const TEMP_PREFIX = ".tmp-";

const ensureDir = async (folder = ""): Promise<void> => {
  await mkdir(folder.length === 0 ? uploads.dir : join(uploads.dir, folder), {
    recursive: true,
  });
};

/**
 * An absolute path inside the upload directory, or null.
 *
 * **The second of two independent bolts.** `isSafePath` decides by shape and
 * cannot be talked out of it; this one decides by asking the path module where
 * the string actually points and comparing that against the directory. They
 * fail differently, which is the point of having both: a mistake in the
 * allowlist does not open the file system, because the resolved path still has
 * to start inside it, and a symlink or a `..` that somehow survived the first
 * check does not survive the second.
 *
 * The separator is appended before the comparison. Without it `/data/uploads`
 * would be a prefix of `/data/uploads-alt`, and a sibling directory would count
 * as being inside.
 */
export const resolveInUploads = (relative: string): string | null => {
  if (!isSafePath(relative)) return null;
  const root = resolve(uploads.dir);
  const full = resolve(root, relative);
  return full.startsWith(root + sep) ? full : null;
};

/**
 * The paths marked as released.
 *
 * Unknown paths are kept rather than pruned: a file deleted and uploaded again
 * under the same path should come back released, which is what somebody who
 * released it once would expect. They cost a line each and confuse nothing,
 * because a path that matches no file simply never meets a row.
 */
const readReleased = async (): Promise<Set<string>> => {
  try {
    const text = await readFile(join(uploads.dir, RELEASED_FILE), "utf8");
    return new Set(
      text
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0),
    );
  } catch {
    // No file yet means nothing is released - not an error worth reporting.
    return new Set();
  }
};

const writeReleased = async (paths: Set<string>): Promise<void> => {
  await ensureDir();
  const text = [...paths].sort().join("\n");
  await writeFile(
    join(uploads.dir, RELEASED_FILE),
    text.length > 0 ? `${text}\n` : "",
  );
};

/**
 * The notes, by relative path.
 *
 * A JSON object rather than lines, because a note contains spaces and may
 * contain almost anything else; the path is the key and cannot be confused with
 * the text. A file that cannot be parsed is treated as no notes at all - the
 * alternative is a listing that fails entirely because one sentence in a side
 * file is malformed.
 */
const readNotes = async (): Promise<Map<string, string>> => {
  try {
    const text = await readFile(join(uploads.dir, NOTES_FILE), "utf8");
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return new Map();
    return new Map(
      Object.entries(parsed as Record<string, unknown>).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    );
  } catch {
    // No file yet, or one nobody can read. Neither is worth failing over.
    return new Map();
  }
};

const writeNotes = async (notes: Map<string, string>): Promise<void> => {
  await ensureDir();
  const sorted = [...notes.entries()].sort(([a], [b]) => a.localeCompare(b));
  await writeFile(
    join(uploads.dir, NOTES_FILE),
    `${JSON.stringify(Object.fromEntries(sorted), null, 2)}\n`,
  );
};

/**
 * Moves the bookkeeping of one path onto another, or off a path that is gone.
 *
 * One function for both side files, because they always move together and
 * forgetting one of them is the failure that shows up as a released file
 * quietly disappearing from the public page the moment it is renamed.
 */
const moveBookkeeping = async (from: string, to: string | null): Promise<void> => {
  const released = await readReleased();
  if (released.delete(from)) {
    if (to !== null) released.add(to);
    await writeReleased(released);
  }

  const notes = await readNotes();
  const note = notes.get(from);
  if (note !== undefined) {
    notes.delete(from);
    // Unlike the release mark, a note does not survive its file. A release is a
    // decision about an address and worth keeping for a file uploaded there
    // again; a note is about the file itself, and a sentence naming the source
    // of something that is gone would attach itself to whatever comes next.
    if (to !== null) notes.set(to, note);
    await writeNotes(notes);
  }
};

/** The same, for everything under a folder that was renamed or removed. */
const moveBookkeepingUnder = async (
  fromFolder: string,
  toFolder: string | null,
): Promise<void> => {
  const prefix = `${fromFolder}/`;
  const rekey = (path: string) =>
    toFolder === null ? null : `${toFolder}/${path.slice(prefix.length)}`;

  const released = await readReleased();
  const affected = [...released].filter((path) => path.startsWith(prefix));
  if (affected.length > 0) {
    for (const path of affected) {
      released.delete(path);
      const to = rekey(path);
      if (to !== null) released.add(to);
    }
    await writeReleased(released);
  }

  const notes = await readNotes();
  const noted = [...notes.keys()].filter((path) => path.startsWith(prefix));
  if (noted.length > 0) {
    for (const path of noted) {
      const note = notes.get(path)!;
      notes.delete(path);
      const to = rekey(path);
      if (to !== null) notes.set(to, note);
    }
    await writeNotes(notes);
  }
};

//====================================
// LISTING
//====================================

/**
 * Walks the tree, collecting files and folders.
 *
 * `withFileTypes` is what keeps a symlink out: `readdir` reports the type of the
 * entry itself rather than of what it points at, so neither `isFile()` nor
 * `isDirectory()` is true for one and it is skipped without a rule saying so. A
 * link into `/etc` placed in the volume by hand is therefore invisible here as
 * well as unreachable through the download route.
 *
 * Every segment is filtered through `isSafeStoredName`, which does two jobs at
 * once: it keeps the bookkeeping files out of the listing, and it means a file
 * placed in the directory by hand - an `evil.html` copied in over the volume -
 * is invisible to the page even though it exists on disk. The listing and the
 * download route apply the same rule, so neither can show what the other would
 * refuse.
 */
const walk = async (
  folder: string,
): Promise<{ files: string[]; folders: string[] }> => {
  const absolute = folder.length === 0 ? uploads.dir : join(uploads.dir, folder);

  let entries: Dirent[];
  try {
    entries = await readdir(absolute, { withFileTypes: true });
  } catch {
    // No directory yet: nothing has been uploaded. Not an error.
    return { files: [], folders: [] };
  }

  const files: string[] = [];
  const folders: string[] = [];

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!isSafeStoredName(entry.name)) continue;
    const path = joinPath(folder, entry.name);
    if (path.length > 0 && !isSafePath(path)) continue;

    if (entry.isDirectory()) {
      folders.push(path);
      const below = await walk(path);
      files.push(...below.files);
      folders.push(...below.folders);
      continue;
    }
    if (entry.isFile() && typeOf(entry.name)) files.push(path);
  }

  return { files, folders };
};

/** Every stored file, sorted by path. */
export const listFiles = async (): Promise<StoredFile[]> => {
  const [{ files }, released, notes] = await Promise.all([
    walk(""),
    readReleased(),
    readNotes(),
  ]);

  const out: StoredFile[] = [];
  for (const path of files) {
    try {
      const info = await stat(join(uploads.dir, path));
      if (!info.isFile()) continue;
      out.push({
        path,
        ...splitPath(path),
        bytes: info.size,
        changed: info.mtime,
        released: released.has(path),
        note: notes.get(path) ?? "",
      });
    } catch {
      // Vanished between readdir and stat. Leaving it out is the whole fix.
    }
  }
  return out;
};

/** Every folder, deepest last, so a listing can be built by walking forward. */
export const listFolders = async (): Promise<string[]> =>
  (await walk("")).folders.sort();

/** Only what the public page shows. */
export const listVisibleFiles = async (): Promise<StoredFile[]> =>
  (await listFiles()).filter((file) => file.released);

/**
 * Everything released in this folder and below it, for the ZIP.
 *
 * Takes the release into account rather than packing the folder: the download
 * page is public, and a detour through the package must not hand out what the
 * listing withholds.
 */
export const releasedUnder = async (folder: string): Promise<StoredFile[]> => {
  const prefix = folder.length === 0 ? "" : `${folder}/`;
  return (await listVisibleFiles()).filter((file) => file.path.startsWith(prefix));
};

//====================================
// WRITING FILES
//====================================

/**
 * Stores an uploaded file in a folder.
 *
 * Written to a temporary name and moved into place, which is not ceremony:
 * `Bun.write` truncates and streams, so a browser that gives up halfway would
 * otherwise leave half a PDF under a path the page already links to. A rename
 * within one file system is atomic - the file is either the old one or the new
 * one, never a mixture. The temporary file is written into the target folder so
 * that the rename never crosses a mount point.
 *
 * Refuses a path that is already taken unless `replace` says otherwise, and
 * names a free alternative when it refuses. Silently renaming would be worse
 * than it sounds: the path is the public address, typed into a guide by hand, so
 * `bild-2.png` beside a text pointing at `bild.png` is a page that shows the
 * picture it was supposed to replace.
 */
export const storeFile = async (
  file: File,
  options: { replace: boolean; folder: string },
): Promise<UploadResult> => {
  const folder = options.folder;
  if (folder.length > 0 && !isSafePath(folder)) {
    return { ok: false, error: "Diesen Ordner gibt es hier nicht." };
  }

  const sanitized = sanitizeFileName(file.name);
  if ("error" in sanitized) return { ok: false, error: sanitized.error };
  const path = joinPath(folder, sanitized.name);

  if (!isSafePath(path)) {
    return {
      ok: false,
      error: "Pfad und Dateiname zusammen sind zu lang für diesen Ordner.",
    };
  }

  if (file.size === 0) {
    return { ok: false, error: "Die Datei ist leer." };
  }
  if (file.size > uploads.maxBytes) {
    const grenze = Math.round(uploads.maxBytes / 1024 / 1024);
    return {
      ok: false,
      error: `Die Datei ist zu gross. Erlaubt sind höchstens ${grenze} MB.`,
    };
  }

  await ensureDir(folder);
  const inFolder = new Set(
    (await listFiles())
      .filter((entry) => entry.folder === folder)
      .map((entry) => entry.name),
  );

  if (inFolder.has(sanitized.name) && !options.replace) {
    const frei = uniqueName(sanitized.name, inFolder);
    return {
      ok: false,
      error:
        `„${sanitized.name}" gibt es in diesem Ordner schon. Benenne die Datei ` +
        `um – „${frei}" wäre frei – oder setze den Haken „vorhandene Datei ` +
        `ersetzen".`,
    };
  }

  const target = resolveInUploads(path);
  if (!target) return { ok: false, error: "Diesen Pfad gibt es hier nicht." };

  const temp = join(
    folder.length === 0 ? uploads.dir : join(uploads.dir, folder),
    `${TEMP_PREFIX}${crypto.randomUUID()}`,
  );
  try {
    await Bun.write(temp, file);
    await rename(temp, target);
  } catch (fehler) {
    // A failed write leaves the temporary file behind; take it with us so the
    // directory does not slowly fill with the debris of failed uploads.
    await unlink(temp).catch(() => {});
    return {
      ok: false,
      error:
        "Die Datei liess sich nicht speichern. Wahrscheinlich fehlt dem Server " +
        `das Schreibrecht auf ${uploads.dir}. (${String(fehler)})`,
    };
  }

  return { ok: true, path };
};

/**
 * Gives a stored file a different name, in the folder it already sits in, and
 * takes its bookkeeping along.
 *
 * **The path is the public address.** A rename therefore breaks every link that
 * points at the old one - in a guide, in a mail sent last week, on a printed
 * worksheet. Nothing here can repair that, so the page says it before the
 * button.
 *
 * Never overwrites. `rename` would replace an existing file silently, which for
 * a path that is a public address is the worst possible outcome; `link` refuses
 * when the target exists, and it is the kernel refusing rather than a check that
 * looked a moment earlier. The file is under both names for the instant between
 * the two calls, which is the harmless half of the exchange: a request arriving
 * exactly then gets the file either way.
 */
export const renameFile = async (
  from: string,
  typed: string,
): Promise<UploadResult> => {
  const source = resolveInUploads(from);
  if (!source) return { ok: false, error: "Diesen Pfad gibt es hier nicht." };

  const { folder, name } = splitPath(from);
  const target = sanitizeRename(name, typed);
  if ("error" in target) return { ok: false, error: target.error };

  const to = joinPath(folder, target.name);
  if (to === from) return { ok: false, error: "Der Name war schon so." };

  const destination = resolveInUploads(to);
  if (!destination) return { ok: false, error: "Dieser Name ist zu lang." };

  const taken = new Set((await listFiles()).map((file) => file.path));
  if (!taken.has(from)) return { ok: false, error: `„${from}" gibt es nicht (mehr).` };
  if (taken.has(to)) {
    const inFolder = new Set(
      [...taken]
        .filter((path) => splitPath(path).folder === folder)
        .map((path) => splitPath(path).name),
    );
    return {
      ok: false,
      error:
        `„${target.name}" gibt es in diesem Ordner schon. Frei wäre ` +
        `„${uniqueName(target.name, inFolder)}" – überschrieben wird hier nichts.`,
    };
  }

  const moved = await hardLinkMove(source, destination, from, to);
  if (moved) return moved;

  await moveBookkeeping(from, to);
  return { ok: true, path: to };
};

/**
 * Puts a file in a different folder, keeping its name.
 *
 * Same exchange as a rename and for the same reason - `link` then `unlink`, so
 * the kernel refuses an existing target rather than a check that looked a
 * moment earlier. The one addition is that the target folder has to exist:
 * creating it here would let a typo in a hidden field produce a folder nobody
 * asked for.
 */
export const moveFile = async (
  from: string,
  toFolder: string,
): Promise<UploadResult> => {
  const source = resolveInUploads(from);
  if (!source) return { ok: false, error: "Diesen Pfad gibt es hier nicht." };
  if (toFolder.length > 0 && !isSafePath(toFolder)) {
    return { ok: false, error: "Diesen Ordner gibt es hier nicht." };
  }

  const { folder, name } = splitPath(from);
  if (folder === toFolder) return { ok: false, error: "Die Datei liegt schon dort." };

  const to = joinPath(toFolder, name);
  const destination = resolveInUploads(to);
  if (!destination) {
    return { ok: false, error: "Pfad und Dateiname zusammen wären zu lang." };
  }

  if (toFolder.length > 0 && !(await listFolders()).includes(toFolder)) {
    return { ok: false, error: `Den Ordner „${toFolder}" gibt es nicht.` };
  }

  const taken = new Set((await listFiles()).map((file) => file.path));
  if (!taken.has(from)) return { ok: false, error: `„${from}" gibt es nicht (mehr).` };
  if (taken.has(to)) {
    return {
      ok: false,
      error: `Dort liegt schon eine Datei „${name}". Überschrieben wird nichts.`,
    };
  }

  const moved = await hardLinkMove(source, destination, from, to);
  if (moved) return moved;

  await moveBookkeeping(from, to);
  return { ok: true, path: to };
};

/**
 * Link, then unlink. Returns the failure, or nothing when it worked.
 *
 * Written once because renaming and moving are the same two system calls with
 * the same half-done state in the middle, and a second copy of it is a second
 * place to forget the `unlink`.
 */
const hardLinkMove = async (
  source: string,
  destination: string,
  from: string,
  to: string,
): Promise<{ ok: false; error: string } | null> => {
  try {
    await link(source, destination);
  } catch (fehler) {
    return { ok: false, error: `Verschieben ging nicht. (${String(fehler)})` };
  }
  try {
    await unlink(source);
  } catch (fehler) {
    // The new path exists and works; the old one refused to go. Reported rather
    // than swallowed, because the file is now listed twice and only somebody
    // looking at the directory can say why.
    return {
      ok: false,
      error:
        `„${to}" ist angelegt, aber „${from}" liess sich nicht entfernen – ` +
        `die Datei steht jetzt unter beiden Pfaden. (${String(fehler)})`,
    };
  }
  return null;
};

/** Removes a file, the mark that it was released, and its note. */
export const deleteFile = async (path: string): Promise<UploadResult> => {
  const absolute = resolveInUploads(path);
  if (!absolute) return { ok: false, error: "Diesen Pfad gibt es hier nicht." };

  try {
    await unlink(absolute);
  } catch {
    return { ok: false, error: `„${path}" gibt es nicht (mehr).` };
  }

  await moveBookkeeping(path, null);
  return { ok: true, path };
};

/**
 * Writes the note beside a file, or removes it when the text is empty.
 *
 * The file has to exist. A note for a path nobody uploaded to would sit in the
 * side file forever, invisible, and attach itself to a later upload there - the
 * one case where keeping bookkeeping around, as `.released` does, is wrong
 * rather than helpful.
 */
export const setNote = async (path: string, raw: string): Promise<UploadResult> => {
  const absolute = resolveInUploads(path);
  if (!absolute) return { ok: false, error: "Diesen Pfad gibt es hier nicht." };

  const cleaned = sanitizeNote(raw);
  if ("error" in cleaned) return { ok: false, error: cleaned.error };

  try {
    const info = await stat(absolute);
    if (!info.isFile()) throw new Error("not a file");
  } catch {
    return { ok: false, error: `„${path}" gibt es nicht (mehr).` };
  }

  const notes = await readNotes();
  if (cleaned.note.length > 0) notes.set(path, cleaned.note);
  else notes.delete(path);

  try {
    await writeNotes(notes);
  } catch (fehler) {
    return { ok: false, error: `Liess sich nicht merken. (${String(fehler)})` };
  }
  return { ok: true, path };
};

/** Puts a file on the public download page, or takes it off again. */
export const setReleased = async (
  path: string,
  released: boolean,
): Promise<UploadResult> => {
  if (!isSafePath(path)) {
    return { ok: false, error: "Diesen Pfad gibt es hier nicht." };
  }
  const paths = await readReleased();
  if (released) paths.add(path);
  else paths.delete(path);
  try {
    await writeReleased(paths);
  } catch (fehler) {
    return { ok: false, error: `Liess sich nicht merken. (${String(fehler)})` };
  }
  return { ok: true, path };
};

//====================================
// FOLDERS
//====================================

/** Makes a folder inside another one. The parent has to exist. */
export const createFolder = async (
  parent: string,
  typed: string,
): Promise<UploadResult> => {
  if (parent.length > 0 && !isSafePath(parent)) {
    return { ok: false, error: "Diesen Ordner gibt es hier nicht." };
  }

  /*
   * A path creates its levels one after another: „esp32/lightsleep" makes both.
   *
   * It used to make one folder called `esp32-lightsleep`, because the slash is
   * not in `[a-z0-9_-]` and every other character becomes a dash. That is the
   * right rule for a *name* and the wrong one for what somebody typed here:
   * the field sits in a browser built around nested folders, the message said
   * „Der Ordner wurde angelegt", and the folder that appeared was not the one
   * that had been asked for.
   *
   * Each segment still goes through `sanitizeFolderName`, so nothing here can
   * point outside the directory. A segment that survives it as nothing - `..`
   * is the one that matters - is dropped rather than refused, which keeps the
   * promise the single name always made: a typed name is cleaned up, not
   * rejected. `../raus` therefore still makes `raus`, and a name that is
   * nothing *but* such segments is refused below.
   */
  const names: string[] = [];
  for (const piece of typed.split("/")) {
    const cleaned = sanitizeFolderName(piece);
    if ("error" in cleaned) continue;
    names.push(cleaned.name);
  }
  if (names.length === 0) {
    return { ok: false, error: "Aus diesem Ordnernamen bleibt nichts Brauchbares übrig." };
  }

  const path = names.reduce((carry, name) => joinPath(carry, name), parent);
  const absolute = resolveInUploads(path);
  if (!absolute) return { ok: false, error: "Dieser Pfad wäre zu lang." };

  const existing = await listFolders();
  if (parent.length > 0 && !existing.includes(parent)) {
    return { ok: false, error: `Den Ordner „${parent}" gibt es nicht.` };
  }
  if (existing.includes(path)) {
    // The whole path when there is more than one level: „gibt es hier schon"
    // is about „hier", and with a path the folder is not here.
    return {
      ok: false,
      error:
        names.length === 1
          ? `„${names[0]}" gibt es hier schon.`
          : `„${path}" gibt es schon.`,
    };
  }

  try {
    await mkdir(absolute, { recursive: true });
  } catch (fehler) {
    return { ok: false, error: `Ordner anlegen ging nicht. (${String(fehler)})` };
  }
  return { ok: true, path };
};

/**
 * Renames a folder, and re-keys the bookkeeping of everything inside it.
 *
 * `rename` rather than the link-then-unlink exchange the files use: a directory
 * cannot be hard-linked. The existence check therefore has to be ours, and it is
 * a check that looked a moment earlier - the window is narrow and the worst case
 * is two folders merging, which is why the target is refused if it exists at all
 * rather than only if it holds a colliding name.
 *
 * **Every address below the folder changes.** That is the same breakage renaming
 * a file causes, multiplied by what is inside, so the page says so before the
 * button rather than afterwards.
 */
export const renameFolder = async (
  from: string,
  typed: string,
): Promise<UploadResult> => {
  const source = resolveInUploads(from);
  if (!source) return { ok: false, error: "Diesen Ordner gibt es hier nicht." };

  const cleaned = sanitizeFolderName(typed);
  if ("error" in cleaned) return { ok: false, error: cleaned.error };

  const { folder } = splitPath(from);
  const to = joinPath(folder, cleaned.name);
  if (to === from) return { ok: false, error: "Der Name war schon so." };

  const destination = resolveInUploads(to);
  if (!destination) return { ok: false, error: "Dieser Name ist zu lang." };

  const existing = await listFolders();
  if (!existing.includes(from)) return { ok: false, error: `„${from}" gibt es nicht (mehr).` };
  if (existing.includes(to)) {
    return { ok: false, error: `„${cleaned.name}" gibt es hier schon.` };
  }

  try {
    await rename(source, destination);
  } catch (fehler) {
    return { ok: false, error: `Umbenennen ging nicht. (${String(fehler)})` };
  }

  await moveBookkeepingUnder(from, to);
  return { ok: true, path: to };
};

/**
 * Removes a folder, and only an empty one.
 *
 * `rmdir` refuses a folder that is not empty, so the guarantee is the kernel's
 * and not a listing that was taken a moment earlier. Deliberately not recursive:
 * one click should not be able to delete a term's worth of material, and
 * emptying a folder first makes what is being lost visible on the way.
 */
export const deleteFolder = async (path: string): Promise<UploadResult> => {
  const absolute = resolveInUploads(path);
  if (!absolute) return { ok: false, error: "Diesen Ordner gibt es hier nicht." };

  try {
    await rmdir(absolute);
  } catch (fehler) {
    const code = (fehler as NodeJS.ErrnoException).code;
    if (code === "ENOTEMPTY" || code === "EEXIST") {
      return {
        ok: false,
        error:
          `„${path}" ist nicht leer. Verschiebe oder lösche erst, was darin ` +
          "liegt – ein Ordner mit einem Klick zu leeren wäre zu viel auf einmal.",
      };
    }
    return { ok: false, error: `„${path}" gibt es nicht (mehr).` };
  }

  // Nothing should be left to re-key, but a release mark survives its file on
  // purpose, and one for a folder that is gone has nowhere to point.
  await moveBookkeepingUnder(path, null);
  return { ok: true, path };
};
