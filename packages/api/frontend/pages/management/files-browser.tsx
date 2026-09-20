import SectionHeading from "../../components/SectionHeading";
import LocalTime from "../../components/LocalTime";
import TableFrame, { EmptyRow } from "../../components/TableFrame";
import { DownloadIcon, EyeIcon, EyeOffIcon, TrashIcon } from "../../components/icons";
import { PAGES } from "../../../lib";
import {
  ALLOWED_EXTENSIONS,
  formatBytes,
  MAX_NOTE_LENGTH,
  MAX_UPLOAD_FILES,
  typeOf,
} from "../../../lib/uploads";
import type { StoredFile } from "../../../services/uploads";

/**
 * The file browser: one folder at a time, with everything that can be done to
 * what is in it.
 *
 * **One component, two homes.** It is the whole of `/management/dateien` and it
 * is shown again at the foot of every guide editor. That is the arrangement the
 * files were reorganised for: the address of a file is what gets written into a
 * text, so the browser has to be within reach while somebody is writing - but
 * the files belong to no single guide, so they also need a page of their own.
 *
 * Every form carries a hidden `back` field and the routes redirect to it, which
 * is what lets the same markup post to the same routes from two different
 * pages and return to the one it was used on. Without it the editor would send
 * somebody to the file page every time they released a picture.
 *
 * **Works without JavaScript**, like every other writing path here: plain
 * forms, a redirect after each POST. The island adds dragging and a list of
 * what is about to be sent, and nothing else.
 */

const PATH = PAGES.filesManage.href;

/** What each redirect code says. Same shape as the configuration page. */
export const FILE_MESSAGES: Record<string, { tone: "success" | "error"; text: string }> = {
  uploaded: { tone: "success", text: "Die Datei wurde hochgeladen." },
  uploadedmany: { tone: "success", text: "Die Dateien wurden hochgeladen." },
  deleted: { tone: "success", text: "Die Datei wurde gelöscht." },
  released: {
    tone: "success",
    text: "Die Datei steht jetzt auf der Downloads-Seite und im Paket ihres Ordners.",
  },
  withdrawn: {
    tone: "success",
    text:
      "Die Datei steht nicht mehr auf der Downloads-Seite. Unter ihrer Adresse " +
      "bleibt sie erreichbar – im Text eingebundene Bilder verschwinden also nicht.",
  },
  renamed: {
    tone: "success",
    text:
      "Die Datei wurde umbenannt. Links auf den alten Namen gehen jetzt ins " +
      "Leere – auch ausserhalb dieser Seite.",
  },
  moved: {
    tone: "success",
    text:
      "Die Datei liegt jetzt im neuen Ordner – und damit unter einer neuen " +
      "Adresse. Links auf die alte gehen ins Leere.",
  },
  noted: { tone: "success", text: "Der Hinweis wurde gespeichert." },
  unnoted: { tone: "success", text: "Der Hinweis wurde entfernt." },
  foldercreated: { tone: "success", text: "Der Ordner wurde angelegt." },
  folderrenamed: {
    tone: "success",
    text:
      "Der Ordner wurde umbenannt. Jede Adresse darin hat sich geändert – " +
      "Links auf die alten gehen ins Leere.",
  },
  folderdeleted: { tone: "success", text: "Der Ordner wurde gelöscht." },
};

/**
 * The line to paste into a guide: a picture is embedded, everything else is
 * linked. A PDF is a link although it is shown inline, because an embedded PDF
 * is a viewer in a page and not a picture in a text.
 */
const snippet = (file: StoredFile): string =>
  typeOf(file.name)?.disposition === "inline" && !file.name.endsWith(".pdf")
    ? `![${file.name}](/downloads/${file.path})`
    : `[${file.name}](/downloads/${file.path})`;

/** `bilder/tag-3` as the breadcrumb `Dateien / bilder / tag-3`. */
const crumbs = (folder: string): { label: string; path: string }[] => {
  const parts = folder.length === 0 ? [] : folder.split("/");
  return parts.map((part, index) => ({
    label: part,
    path: parts.slice(0, index + 1).join("/"),
  }));
};

const FileBrowser = (props: {
  /** Everything stored, at every depth. Narrowed to `folder` here. */
  files: StoredFile[];
  /** Every folder that exists, for the move targets and the listing. */
  folders: string[];
  /** Which folder is open. `""` is the root. */
  folder: string;
  maxBytes: number;
  /** Where every form returns to - this page, with its own query string. */
  back: string;
  /**
   * Whether to show the paste-me column. Off on the file page, where there is
   * no text to paste into; on in the editor, where there is.
   */
  snippets?: boolean;
}) => {
  const here = props.files.filter((file) => file.folder === props.folder);
  const below = props.folders.filter(
    (path) =>
      path.startsWith(props.folder.length === 0 ? "" : `${props.folder}/`) &&
      path.slice(props.folder.length === 0 ? 0 : props.folder.length + 1).indexOf("/") < 0 &&
      path !== props.folder,
  );
  const maxMB = Math.round(props.maxBytes / 1024 / 1024);
  const columns = props.snippets ? 7 : 6;

  /** A link to this browser showing another folder, on whichever page it is on. */
  const folderLink = (path: string) => {
    const base = props.back.split("?")[0]!;
    const query = new URLSearchParams(props.back.split("?")[1] ?? "");
    if (path.length === 0) query.delete("ordner");
    else query.set("ordner", path);
    const suffix = query.toString();
    return suffix ? `${base}?${suffix}` : base;
  };

  return (
    <>
      <SectionHeading>Dateien</SectionHeading>

      {/* ---- Wo wir sind ---- */}
      <nav class="text-sm mb-2 flex flex-wrap items-center gap-1" aria-label="Ordner">
        <a href={folderLink("")} class="link">
          Alle Dateien
        </a>
        {crumbs(props.folder).map((crumb) => (
          <>
            <span aria-hidden="true" class="text-base-content/70">
              /
            </span>
            <a href={folderLink(crumb.path)} class="link font-mono">
              {crumb.label}
            </a>
          </>
        ))}
      </nav>

      {/* ---- Unterordner ---- */}
      <div class="flex flex-wrap items-end gap-4 mb-4">
        <form
          method="post"
          action={`${PATH}/folder`}
          class="flex flex-wrap gap-2 items-end"
        >
          <input type="hidden" name="back" value={props.back} />
          <input type="hidden" name="parent" value={props.folder} />
          <label class="text-sm">
            <span class="block text-base-content/70 mb-1">Neuer Ordner hier</span>
            <input
              type="text"
              name="name"
              required
              autocomplete="off"
              placeholder="arbeitsblaetter"
              class="input input-sm font-mono w-56"
            />
          </label>
          <button type="submit" class="btn btn-sm btn-outline">
            anlegen
          </button>
          <span class="text-sm text-base-content/70 pb-2">
            Mehrere Ebenen auf einmal mit{" "}
            <code class="bg-base-200 rounded-field px-1 text-sm">/</code>.
          </span>
        </form>

        {props.folder.length > 0 && here.length === 0 && below.length === 0 && (
          <form method="post" action={`${PATH}/folder/delete`}>
            <input type="hidden" name="back" value={folderLink(
              props.folder.split("/").slice(0, -1).join("/"),
            )} />
            <input type="hidden" name="path" value={props.folder} />
            <button type="submit" class="btn btn-sm btn-outline btn-error gap-1">
              <TrashIcon />
              diesen leeren Ordner löschen
            </button>
          </form>
        )}
      </div>

      {below.length > 0 && (
        <ul class="flex flex-wrap gap-2 mb-4">
          {below.map((path) => (
            <li>
              <a
                href={folderLink(path)}
                class="btn btn-sm btn-outline font-mono gap-1"
              >
                📁 {path.slice(props.folder.length === 0 ? 0 : props.folder.length + 1)}
              </a>
            </li>
          ))}
        </ul>
      )}

      {props.folder.length > 0 && (
        <form
          method="post"
          action={`${PATH}/folder/rename`}
          class="flex flex-wrap gap-2 items-center mb-4"
        >
          <input type="hidden" name="back" value={props.back} />
          <input type="hidden" name="path" value={props.folder} />
          <label class="text-sm text-base-content/70" for="folder-rename">
            Ordnername
          </label>
          <input
            id="folder-rename"
            type="text"
            name="name"
            value={props.folder.slice(props.folder.lastIndexOf("/") + 1)}
            autocomplete="off"
            class="input input-sm font-mono w-56"
          />
          <button type="submit" class="btn btn-sm btn-outline">
            umbenennen
          </button>
          <span class="text-sm text-base-content/70 max-w-[50ch]">
            Ändert die Adresse jeder Datei darin.
          </span>
        </form>
      )}

      {/* ---- Hochladen ---- */}
      <form
        method="post"
        action={`${PATH}/upload`}
        enctype="multipart/form-data"
        class="mb-4"
      >
        <input type="hidden" name="back" value={props.back} />
        <input type="hidden" name="folder" value={props.folder} />
        {/*
          * The box is a box even without JavaScript: it holds the field, and
          * the field takes several files on its own. The invitation to drag
          * and the list of what was dropped are `hidden` here and revealed by
          * the island, so the page never promises what the browser will not do.
          */}
        <div
          data-dropzone
          class="rounded-box border border-dashed border-base-300 p-4 mb-3 max-w-2xl transition-colors"
        >
          <label class="block">
            <span class="block text-sm mb-1">
              Dateien in{" "}
              <span class="font-mono">{props.folder || "Alle Dateien"}</span>{" "}
              <span class="text-base-content/70">(Pflichtfeld)</span>
            </span>
            <input
              type="file"
              name="file"
              multiple
              required
              accept={ALLOWED_EXTENSIONS.map((e) => `.${e}`).join(",")}
              class="file-input file-input-sm w-full max-w-md"
            />
          </label>

          <p data-dropzone-hint hidden class="text-sm text-base-content/70 mt-2">
            … oder mehrere Dateien hierher ziehen.
          </p>

          <ul data-dropzone-list class="text-sm grid gap-1 mt-2" />
        </div>

        <label class="flex items-center gap-2 mb-2 text-sm">
          <input type="checkbox" name="replace" value="1" class="checkbox checkbox-sm" />
          vorhandene Datei ersetzen
        </label>

        <p class="text-sm text-base-content/70 mb-2 max-w-[65ch]">
          Höchstens {MAX_UPLOAD_FILES} Dateien auf einmal, jede bis {maxMB} MB.
          Erlaubt sind: {ALLOWED_EXTENSIONS.join(", ")}. Der Name wird
          kleingeschrieben und von Sonderzeichen befreit, weil er Teil der
          Adresse wird. Jede Datei wird für sich beurteilt – eine abgelehnte
          hält die anderen nicht auf.
        </p>

        <button type="submit" class="btn btn-outline btn-primary">
          Hochladen
        </button>
      </form>

      {/* ---- Die Dateien ---- */}
      <p class="text-sm text-base-content/70 mb-2 max-w-[65ch]">
        <strong>Freigeschaltet</strong> heisst: erscheint auf der Seite{" "}
        <a href={PAGES.downloads.href} class="link">
          {PAGES.downloads.label}
        </a>{" "}
        und liegt im Paket ihres Ordners. Ohne Freischaltung erscheint eine Datei
        dort nicht – <strong>erreichbar bleibt sie trotzdem</strong> unter ihrer
        Adresse, sonst würde ein im Text eingebundenes Bild verschwinden. Ein
        Zugriffsschutz ist die Freischaltung nicht.
      </p>
      <p class="text-sm text-base-content/70 mb-2 max-w-[65ch]">
        <strong>Umbenennen und Verschieben</strong> ändern die Adresse. Jeder
        Link auf die alte geht danach ins Leere – in einer Anleitung, in einer
        schon verschickten Mail, auf einem gedruckten Blatt. Die Endung bleibt,
        weil sie entscheidet, wie der Server die Datei ausliefert.
      </p>

      <TableFrame class="mb-8">
        <thead>
          <tr>
            <th>Datei</th>
            <th class="text-right" colspan={2}>
              Grösse
            </th>
            <th>Geändert</th>
            {props.snippets && <th>Im Text</th>}
            <th>Download-Seite</th>
            <th>
              <span class="sr-only">Aktionen</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {here.length === 0 ? (
            <EmptyRow columns={columns}>
              In diesem Ordner liegt noch nichts. Über das Formular darüber
              lässt sich die erste Datei hochladen.
            </EmptyRow>
          ) : (
            here.map((file) => {
              const size = formatBytes(file.bytes);
              return [
                <tr>
                  <td class="font-mono text-sm">{file.name}</td>
                  <td class="text-right tabular-nums">{size.wert}</td>
                  <td class="text-base-content/70">{size.einheit}</td>
                  <td class="text-sm">
                    <LocalTime at={file.changed} />
                  </td>
                  {props.snippets && (
                    <td>
                      <code class="text-xs select-all">{snippet(file)}</code>
                    </td>
                  )}
                  {/*
                    * The state is a word, not only an icon and not only a
                    * shade: colour alone must never carry a meaning.
                    */}
                  <td class="text-sm">
                    {file.released ? "freigeschaltet" : "nicht freigeschaltet"}
                  </td>
                  <td>
                    <div class="flex gap-1 justify-end">
                      <a
                        href={`/downloads/${file.path}`}
                        class="btn btn-xs btn-ghost min-h-6 h-6 px-2"
                        title="Ansehen"
                      >
                        <DownloadIcon />
                        <span class="sr-only">Ansehen</span>
                      </a>

                      <form method="post" action={`${PATH}/release`}>
                        <input type="hidden" name="back" value={props.back} />
                        <input type="hidden" name="path" value={file.path} />
                        <input
                          type="hidden"
                          name="released"
                          value={file.released ? "0" : "1"}
                        />
                        <button
                          type="submit"
                          class="btn btn-xs btn-outline min-h-6 h-6 px-2 gap-1"
                        >
                          {file.released ? <EyeOffIcon /> : <EyeIcon />}
                          {file.released ? "zurückziehen" : "freischalten"}
                        </button>
                      </form>

                      {/*
                        * An outline, not a filled button: red stays a signal
                        * colour rather than becoming the colour of a control.
                        * Word and icon together, so it is legible without colour.
                        */}
                      <form method="post" action={`${PATH}/delete`}>
                        <input type="hidden" name="back" value={props.back} />
                        <input type="hidden" name="path" value={file.path} />
                        <button
                          type="submit"
                          class="btn btn-xs btn-outline btn-error min-h-6 h-6 px-2 gap-1"
                        >
                          <TrashIcon />
                          löschen
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>,
                /*
                  * Name, note and folder get a row of their own rather than
                  * three more columns. A text field wide enough to read what is
                  * in it would squeeze every other column; under the row it has
                  * the whole width and still belongs visibly to the file above.
                  */
                <tr>
                  <td colspan={columns} class="pt-0">
                    <div class="flex flex-wrap gap-x-8 gap-y-2 pb-2">
                      <form
                        method="post"
                        action={`${PATH}/rename`}
                        class="flex flex-wrap gap-2 items-center"
                      >
                        <input type="hidden" name="back" value={props.back} />
                        <input type="hidden" name="path" value={file.path} />
                        <label
                          class="text-sm text-base-content/70"
                          for={`rename-${file.path}`}
                        >
                          Name
                        </label>
                        <input
                          id={`rename-${file.path}`}
                          type="text"
                          name="to"
                          value={file.name}
                          autocomplete="off"
                          class="input input-sm font-mono w-56"
                        />
                        <button type="submit" class="btn btn-sm btn-outline">
                          umbenennen
                        </button>
                      </form>

                      <form
                        method="post"
                        action={`${PATH}/move`}
                        class="flex flex-wrap gap-2 items-center"
                      >
                        <input type="hidden" name="back" value={props.back} />
                        <input type="hidden" name="path" value={file.path} />
                        <label
                          class="text-sm text-base-content/70"
                          for={`move-${file.path}`}
                        >
                          Ordner
                        </label>
                        <select
                          id={`move-${file.path}`}
                          name="folder"
                          class="select select-sm font-mono w-56"
                        >
                          <option value="" selected={file.folder === ""}>
                            (oberste Ebene)
                          </option>
                          {props.folders.map((path) => (
                            <option value={path} selected={file.folder === path}>
                              {path}
                            </option>
                          ))}
                        </select>
                        <button type="submit" class="btn btn-sm btn-outline">
                          verschieben
                        </button>
                      </form>

                      <form
                        method="post"
                        action={`${PATH}/note`}
                        class="flex flex-wrap gap-2 items-center flex-1"
                      >
                        <input type="hidden" name="back" value={props.back} />
                        <input type="hidden" name="path" value={file.path} />
                        <label
                          class="text-sm text-base-content/70"
                          for={`note-${file.path}`}
                        >
                          Hinweis
                        </label>
                        <input
                          id={`note-${file.path}`}
                          type="text"
                          name="note"
                          value={file.note}
                          maxlength={MAX_NOTE_LENGTH}
                          placeholder="z. B. Quelle: [Adafruit](https://…)"
                          autocomplete="off"
                          class="input input-sm flex-1 min-w-56"
                        />
                        <button type="submit" class="btn btn-sm btn-outline">
                          merken
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>,
              ];
            })
          )}
        </tbody>
      </TableFrame>
      <script type="module" src="/public/files.js"></script>
    </>
  );
};

export default FileBrowser;
