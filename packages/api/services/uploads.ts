/**
 * The files offered for download: listing, storing, hiding, annotating, removing.
 *
 * **The directory is the truth.** There is no table of file metadata, and that
 * is a decision rather than an omission. Name, size and date come from `readdir`
 * and `stat`, where they are correct by definition; a table would be a second
 * copy in a system that is backed up and restored *separately* from this one, so
 * the two drifting apart would not be a rare race but the expected result of the
 * first restore.
 *
 * The same reasoning puts the state that is not in the files themselves - which
 * of them are hidden, and the note beside each - into files beside them rather
 * than into the database. `.hidden` and `.notes` travel with the volume, so
 * neither can describe a set of files that is no longer there.
 *
 * **Hidden means unlisted, not unreachable.** A picture embedded in the page
 * should not also appear as a row in the download table, but its URL has to keep
 * working or the picture disappears from the text. Anyone who knows the address
 * can still fetch it. This is presentation, never access control - the edit page
 * says so in as many words, because the word "hidden" invites the other reading.
 *
 * One host, one directory: the volume is not shared between replicas, so two
 * instances behind the proxy would each answer from their own set of files. The
 * settings cache in services/settings.ts already anticipates a second instance;
 * this does not, and would need to be the next thing looked at.
 */

import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { uploads } from "../config";
import {
  isSafeStoredName,
  sanitizeFileName,
  sanitizeNote,
  typeOf,
  uniqueName,
} from "../lib/uploads";

export type StoredFile = {
  name: string;
  bytes: number;
  changed: Date;
  /** Not listed on the public page. Still reachable under its address. */
  hidden: boolean;
  /** One line beside the download - where it came from, what to know. */
  note: string;
};

export type UploadResult =
  | { ok: true; name: string }
  | { ok: false; error: string };

/** Where the bookkeeping of hidden names lives. Never listed, never served. */
const HIDDEN_FILE = ".hidden";

/**
 * Where the notes live. Beside the files for the same reason `.hidden` is: a
 * note describes a file, and a note kept in the database would survive a
 * restore that the file did not - leaving a sentence about a source next to
 * nothing, or worse, next to a different file uploaded later under that name.
 */
const NOTES_FILE = ".notes";

/** Prefix of a half-written upload. Cannot collide with a stored name. */
const TEMP_PREFIX = ".tmp-";

const ensureDir = async (): Promise<void> => {
  await mkdir(uploads.dir, { recursive: true });
};

/**
 * The names marked as hidden.
 *
 * Unknown names are kept rather than pruned: a file deleted and uploaded again
 * under the same name should come back hidden, which is what somebody who hid it
 * once would expect. They cost a line each and confuse nothing, because a name
 * that matches no file simply never meets a row.
 */
const readHidden = async (): Promise<Set<string>> => {
  try {
    const text = await readFile(join(uploads.dir, HIDDEN_FILE), "utf8");
    return new Set(
      text
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0),
    );
  } catch {
    // No file yet means nothing is hidden - not an error worth reporting.
    return new Set();
  }
};

const writeHidden = async (names: Set<string>): Promise<void> => {
  await ensureDir();
  const text = [...names].sort().join("\n");
  await writeFile(join(uploads.dir, HIDDEN_FILE), text.length > 0 ? `${text}\n` : "");
};

/**
 * The notes, by file name.
 *
 * A JSON object rather than lines, because a note contains spaces and may
 * contain almost anything else; the name is the key and cannot be confused
 * with the text. A file that cannot be parsed is treated as no notes at all -
 * the alternative is a listing that fails entirely because one sentence in a
 * side file is malformed.
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
 * Every stored file, sorted by name.
 *
 * Filtered through `isSafeStoredName`, which does two jobs at once here: it
 * keeps the bookkeeping files out of the listing, and it means a file placed in
 * the directory by hand - an `evil.html` copied in over the volume - is invisible
 * to the page even though it exists on disk. The listing and the download route
 * apply the same rule, so neither can show what the other would refuse.
 */
export const listFiles = async (): Promise<StoredFile[]> => {
  let entries: string[];
  try {
    entries = await readdir(uploads.dir);
  } catch {
    // No directory yet: nothing has been uploaded. Not an error.
    return [];
  }

  const [hidden, notes] = await Promise.all([readHidden(), readNotes()]);
  const files: StoredFile[] = [];

  for (const name of entries.sort()) {
    if (!isSafeStoredName(name)) continue;
    if (!typeOf(name)) continue;
    try {
      const info = await stat(join(uploads.dir, name));
      if (!info.isFile()) continue;
      files.push({
        name,
        bytes: info.size,
        changed: info.mtime,
        hidden: hidden.has(name),
        note: notes.get(name) ?? "",
      });
    } catch {
      // Vanished between readdir and stat. Leaving it out is the whole fix.
    }
  }
  return files;
};

/** Only what the public page shows. */
export const listVisibleFiles = async (): Promise<StoredFile[]> =>
  (await listFiles()).filter((file) => !file.hidden);

/**
 * Stores an uploaded file.
 *
 * Written to a temporary name and moved into place, which is not ceremony:
 * `Bun.write` truncates and streams, so a browser that gives up halfway would
 * otherwise leave a half a PDF under a name the page already links to. A rename
 * within one file system is atomic - the file is either the old one or the new
 * one, never a mixture.
 *
 * Refuses a name that is already taken unless `replace` says otherwise, and
 * names a free alternative when it refuses. Silently renaming would be worse
 * than it sounds: the name is the public address, typed into the page by hand,
 * so `bild-2.png` beside a text pointing at `bild.png` is a page that shows the
 * picture it was supposed to replace.
 */
export const storeFile = async (
  file: File,
  options: { replace: boolean },
): Promise<UploadResult> => {
  const sanitized = sanitizeFileName(file.name);
  if ("error" in sanitized) return { ok: false, error: sanitized.error };
  const name = sanitized.name;

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

  await ensureDir();
  const vorhanden = new Set((await listFiles()).map((f) => f.name));

  if (vorhanden.has(name) && !options.replace) {
    const frei = uniqueName(name, vorhanden);
    return {
      ok: false,
      error:
        `„${name}" gibt es schon. Benenne die Datei um – „${frei}" wäre frei – ` +
        `oder setze den Haken „vorhandene Datei ersetzen".`,
    };
  }

  const temp = join(uploads.dir, `${TEMP_PREFIX}${crypto.randomUUID()}`);
  try {
    await Bun.write(temp, file);
    await rename(temp, join(uploads.dir, name));
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

  return { ok: true, name };
};

/** Removes a file, the mark that it was hidden, and its note. */
export const deleteFile = async (name: string): Promise<UploadResult> => {
  if (!isSafeStoredName(name)) {
    return { ok: false, error: "Diesen Namen gibt es hier nicht." };
  }
  try {
    await unlink(join(uploads.dir, name));
  } catch {
    return { ok: false, error: `„${name}" gibt es nicht (mehr).` };
  }

  const hidden = await readHidden();
  if (hidden.delete(name)) await writeHidden(hidden);

  // Unlike the hidden mark, the note goes. Hiding is a decision about a name
  // and worth keeping for a file uploaded again under it; a note is about the
  // file itself, and a sentence naming the source of something that is gone
  // would attach itself to whatever comes next.
  const notes = await readNotes();
  if (notes.delete(name)) await writeNotes(notes);

  return { ok: true, name };
};

/**
 * Writes the note beside a file, or removes it when the text is empty.
 *
 * The file has to exist. A note for a name nobody uploaded would sit in the
 * side file forever, invisible, and attach itself to a later upload of that
 * name - the one case where keeping bookkeeping around, as `.hidden` does, is
 * wrong rather than helpful.
 */
export const setNote = async (
  name: string,
  raw: string,
): Promise<UploadResult> => {
  if (!isSafeStoredName(name)) {
    return { ok: false, error: "Diesen Namen gibt es hier nicht." };
  }

  const cleaned = sanitizeNote(raw);
  if ("error" in cleaned) return { ok: false, error: cleaned.error };

  try {
    const info = await stat(join(uploads.dir, name));
    if (!info.isFile()) throw new Error("not a file");
  } catch {
    return { ok: false, error: `„${name}" gibt es nicht (mehr).` };
  }

  const notes = await readNotes();
  if (cleaned.note.length > 0) notes.set(name, cleaned.note);
  else notes.delete(name);

  try {
    await writeNotes(notes);
  } catch (fehler) {
    return { ok: false, error: `Liess sich nicht merken. (${String(fehler)})` };
  }
  return { ok: true, name };
};

/** Hides or shows a file on the public page. */
export const setHidden = async (
  name: string,
  hidden: boolean,
): Promise<UploadResult> => {
  if (!isSafeStoredName(name)) {
    return { ok: false, error: "Diesen Namen gibt es hier nicht." };
  }
  const namen = await readHidden();
  if (hidden) namen.add(name);
  else namen.delete(name);
  try {
    await writeHidden(namen);
  } catch (fehler) {
    return { ok: false, error: `Liess sich nicht merken. (${String(fehler)})` };
  }
  return { ok: true, name };
};
