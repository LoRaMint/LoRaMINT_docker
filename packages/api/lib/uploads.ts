/**
 * The rules an uploaded file has to satisfy, as pure functions.
 *
 * Separate from services/uploads.ts, which does the writing, because these are
 * the parts that must be right and are cheapest to be sure about: no file
 * system, no configuration, no clock. A test can throw a few hundred hostile
 * names at `sanitizeFileName` in a millisecond.
 *
 * **The invariant that holds the two ends together:** `sanitizeFileName` never
 * returns a name that `isSafeStoredName` would reject, and the download route
 * serves nothing that `isSafeStoredName` rejects. Neither side has to trust the
 * other, and neither can drift away from it - the last line of the sanitiser
 * asserts it rather than assuming it.
 */

export type Disposition = "inline" | "attachment";

/**
 * What may be uploaded, and how it is served.
 *
 * An allowlist, not a blocklist. The type sent to the browser comes from this
 * table and never from the file itself, so a `.png` that is really something
 * else is still served as an image and cannot become a script.
 *
 * `inline` only for what a browser shows and cannot execute. Everything else is
 * a download - a `.py` opened in a tab would be shown as text, which is harmless
 * but not what anybody clicking it wanted.
 *
 * **Not here, deliberately:** `.html`, `.htm`, `.xhtml`, `.xml` and `.svg`. All
 * of them can carry script, and served from this origin that script would run
 * with the session of whoever opened it. SVG is the tempting one - it is a
 * picture, after all - and it is exactly why the list is an allowlist.
 */
export const ALLOWED_TYPES: Record<string, { mime: string; disposition: Disposition }> = {
  // Bilder und Dokumente: werden angezeigt.
  png: { mime: "image/png", disposition: "inline" },
  jpg: { mime: "image/jpeg", disposition: "inline" },
  jpeg: { mime: "image/jpeg", disposition: "inline" },
  gif: { mime: "image/gif", disposition: "inline" },
  webp: { mime: "image/webp", disposition: "inline" },
  pdf: { mime: "application/pdf", disposition: "inline" },

  // Quelltext und Daten: werden heruntergeladen.
  py: { mime: "text/plain; charset=utf-8", disposition: "attachment" },
  ino: { mime: "text/plain; charset=utf-8", disposition: "attachment" },
  c: { mime: "text/plain; charset=utf-8", disposition: "attachment" },
  h: { mime: "text/plain; charset=utf-8", disposition: "attachment" },
  cpp: { mime: "text/plain; charset=utf-8", disposition: "attachment" },
  txt: { mime: "text/plain; charset=utf-8", disposition: "attachment" },
  md: { mime: "text/plain; charset=utf-8", disposition: "attachment" },
  csv: { mime: "text/csv; charset=utf-8", disposition: "attachment" },
  json: { mime: "application/json", disposition: "attachment" },
  zip: { mime: "application/zip", disposition: "attachment" },
};

/** The extensions above, for an `accept` attribute and for error messages. */
export const ALLOWED_EXTENSIONS = Object.keys(ALLOWED_TYPES).sort();

/**
 * The shape of every name this application stores and serves.
 *
 * A positive allowlist, which is what makes it safe by construction rather than
 * by exhaustion: `..`, `/`, `\`, a NUL byte, a leading dot and every percent- or
 * unicode-encoded spelling of them all fail because they are not in the set,
 * not because somebody thought of them.
 *
 * The leading character may not be a dot, which is what keeps the bookkeeping
 * files - `.hidden`, `.tmp-…` - out of the listing and out of reach of the
 * download route without a second rule saying so.
 */
export const isSafeStoredName = (name: string): boolean =>
  /^[a-z0-9][a-z0-9._-]{0,95}$/.test(name);

/** The part after the last dot, lowercased. Empty when there is no dot. */
export const extensionOf = (name: string): string => {
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? "" : name.slice(dot + 1).toLowerCase();
};

/** What a file is served as, or undefined when it may not be served at all. */
export const typeOf = (name: string) => ALLOWED_TYPES[extensionOf(name)];

const UMLAUTE: Record<string, string> = {
  ä: "ae", ö: "oe", ü: "ue", Ä: "ae", Ö: "oe", Ü: "ue", ß: "ss",
};

/**
 * A name from a browser, reduced to a name this application can store.
 *
 * The order of the steps is the substance, so it is worth reading as a list:
 *
 *  1. Everything up to the last separator goes. Some clients still send a whole
 *     path - `C:\Users\ruf\blatt.pdf` - and the last segment is the file name.
 *  2. Normalise and drop control characters, so a name cannot carry a newline
 *     into a log line or a NUL into a system call.
 *  3. Umlauts become digraphs *before* the generic replacement, or `Grüße.pdf`
 *     turns into `gr--e.pdf` instead of `gruesse.pdf`.
 *  4. Lowercase throughout. Without it `Bild.PNG` and `bild.png` are two names
 *     on Linux and one on macOS, and a collision that only happens in production
 *     is the worst kind.
 *  5. Split at the *last* dot. `a.php.pdf` is a pdf, which is the correct and
 *     boring answer; `.htaccess` has no base and is refused.
 *  6. What is left of the base is reduced to the permitted characters.
 *
 * Returns an error rather than a fallback name whenever the answer would be a
 * guess. A file silently stored under a name nobody chose is worse than a
 * message saying why it was not.
 */
export const sanitizeFileName = (raw: string): { name: string } | { error: string } => {
  const letzterTrenner = Math.max(raw.lastIndexOf("/"), raw.lastIndexOf("\\"));
  const dateiname = raw.slice(letzterTrenner + 1);

  const bereinigt = dateiname
    .normalize("NFC")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[äöüÄÖÜß]/g, (zeichen) => UMLAUTE[zeichen] ?? zeichen)
    .toLowerCase()
    .trim();

  if (bereinigt.length === 0) {
    return { error: "Die Datei hat keinen Namen." };
  }

  const punkt = bereinigt.lastIndexOf(".");
  if (punkt <= 0) {
    return { error: "Der Dateiname braucht eine Endung." };
  }

  const endung = bereinigt.slice(punkt + 1);
  if (!(endung in ALLOWED_TYPES)) {
    return {
      error:
        `Dateien mit der Endung „${endung}" lassen sich nicht hochladen. ` +
        `Erlaubt sind: ${ALLOWED_EXTENSIONS.join(", ")}.`,
    };
  }

  const basis = bereinigt
    .slice(0, punkt)
    .replace(/[^a-z0-9._-]/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/\.{2,}/g, ".")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 80);

  if (basis.length === 0) {
    return { error: "Aus dem Dateinamen bleibt nichts Brauchbares übrig." };
  }

  const name = `${basis}.${endung}`;

  // The guarantee, checked rather than assumed. If the steps above ever let
  // something through that the download route would refuse, the upload fails
  // here - visibly - instead of producing a file that cannot be fetched.
  if (!isSafeStoredName(name)) {
    return { error: "Aus dem Dateinamen bleibt nichts Brauchbares übrig." };
  }

  return { name };
};

/**
 * How many files one upload may carry.
 *
 * Not a matter of taste: the request body is buffered whole before anything can
 * look at it, so the only cheap guard against an enormous upload is a ceiling on
 * what the body may declare - and that ceiling is this number times the size
 * limit. Twenty is well above a workshop's worth of material and still leaves
 * the guard meaningful.
 */
export const MAX_UPLOAD_FILES = 20;

/**
 * How long a note beside a download may be.
 *
 * Two lines in the table, roughly. The field is for where a file came from and
 * what to know before opening it - a link to the source, a version, a warning
 * that the sketch needs a certain library. Anything longer belongs in the
 * workshop text, which is a page and can be structured.
 */
export const MAX_NOTE_LENGTH = 300;

/**
 * A note as it was typed, reduced to the one line that is stored.
 *
 * Line breaks become spaces rather than being refused. The note is rendered as
 * one line of inline markdown, so a break would silently do nothing - turning it
 * into a space is what somebody pasting two sentences meant anyway, and it keeps
 * the storage format a single line per file.
 *
 * An empty note is not an error: it is how a note is removed, and the caller
 * gets `""` rather than a special case to remember.
 */
export const sanitizeNote = (raw: string): { note: string } | { error: string } => {
  const note = raw
    .normalize("NFC")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

  if (note.length > MAX_NOTE_LENGTH) {
    return {
      error:
        `Der Hinweis ist zu lang: ${note.length} Zeichen, erlaubt sind ` +
        `${MAX_NOTE_LENGTH}. Was mehr Platz braucht, gehört in den Workshop-Text.`,
    };
  }

  return { note };
};

/**
 * A new name for a file that already exists, as it will be stored.
 *
 * Runs through `sanitizeFileName`, so a renamed file obeys exactly the rules an
 * uploaded one does - there is no second, laxer way into the directory.
 *
 * **The extension may not change**, and that is the one rule this function adds.
 * It is not tidiness: the extension alone decides the content type a file is
 * served with, so turning `skript.py` into `bild.png` would have the server
 * announce a Python file as an image. The file on disk is unchanged by a rename;
 * only its label would lie.
 *
 * Typing the name without any extension is not an error but the common case -
 * somebody correcting a typo in the base. The current extension is appended.
 */
export const sanitizeRename = (
  current: string,
  typed: string,
): { name: string } | { error: string } => {
  const currentExtension = extensionOf(current);
  const trimmed = typed.trim();

  if (trimmed.length === 0) {
    return { error: "Ohne neuen Namen bleibt alles, wie es ist." };
  }

  const withExtension = trimmed.includes(".")
    ? trimmed
    : `${trimmed}.${currentExtension}`;

  const sanitized = sanitizeFileName(withExtension);
  if ("error" in sanitized) return sanitized;

  if (extensionOf(sanitized.name) !== currentExtension) {
    return {
      error:
        `Die Endung lässt sich nicht ändern: „${current}" bleibt eine ` +
        `.${currentExtension}-Datei. Sie entscheidet, wie der Server die Datei ` +
        `ausliefert – der Inhalt ändert sich durch das Umbenennen ja nicht.`,
    };
  }

  return sanitized;
};

/**
 * The first free name of the form `bild.png`, `bild-2.png`, `bild-3.png`.
 *
 * Used to *suggest* a name, not to pick one behind somebody's back: the file
 * name is the public address that gets typed into the page by hand, so renaming
 * an upload silently would leave a link pointing at the file it replaced.
 */
export const uniqueName = (desired: string, taken: ReadonlySet<string>): string => {
  if (!taken.has(desired)) return desired;

  const punkt = desired.lastIndexOf(".");
  const basis = desired.slice(0, punkt);
  const endung = desired.slice(punkt);

  for (let zaehler = 2; zaehler < 1000; zaehler++) {
    const kandidat = `${basis}-${zaehler}${endung}`;
    if (!taken.has(kandidat)) return kandidat;
  }
  return `${basis}-${Date.now()}${endung}`;
};

/**
 * A size as number and unit, kept apart.
 *
 * Two fields rather than one string because the table puts them in two columns:
 * the number right-aligned so the digits line up, the unit left-aligned beside
 * it. Right-aligning "1,2 MB" and "980 kB" together aligns the unit and leaves
 * the decimal point wandering, which is the thing alignment was for.
 */
export const formatBytes = (bytes: number): { wert: string; einheit: string } => {
  if (bytes < 1000) return { wert: String(bytes), einheit: "B" };
  if (bytes < 1000 * 1000) {
    return { wert: (bytes / 1000).toFixed(0), einheit: "kB" };
  }
  return { wert: (bytes / 1000 / 1000).toFixed(1).replace(".", ","), einheit: "MB" };
};
