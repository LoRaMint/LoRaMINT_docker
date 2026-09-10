import Layout from "../../components/layout/Layout";
import PageHeading from "../../components/PageHeading";
import SectionHeading from "../../components/SectionHeading";
import Notice from "../../components/Notice";
import LocalTime from "../../components/LocalTime";
import TableFrame, { EmptyRow } from "../../components/TableFrame";
import { DownloadIcon, EyeIcon, EyeOffIcon, TrashIcon } from "../../components/icons";
import { PAGES } from "../../../lib";
import { ALLOWED_EXTENSIONS, formatBytes, typeOf } from "../../../lib/uploads";
import { renderMarkdown } from "../../../lib/markdown";
import type { StoredFile } from "../../../services/uploads";

/**
 * Writing the workshop page and looking after its files.
 *
 * Works without JavaScript, like every other writing path in this application:
 * plain forms, a redirect after each POST, and a preview that is a round trip to
 * the server rather than a script. The preview earns that round trip - this is
 * the first box in which somebody types tables and code fences, and a text area
 * gives no hint whether a delimiter row was right until the page is saved.
 *
 * The file list is here rather than on a page of its own because the two belong
 * together: the address of a file is what gets written into the text, so the
 * list offers the finished snippet to copy and the text box sits directly above
 * it.
 */

const PATH = PAGES.workshopManage.href;

/** What each redirect code says. Same shape as the configuration page. */
const MESSAGES: Record<string, { tone: "success" | "error"; text: string }> = {
  saved: { tone: "success", text: "Der Text wurde gespeichert." },
  nochange: { tone: "success", text: "Der Text war schon so gespeichert." },
  uploaded: { tone: "success", text: "Die Datei wurde hochgeladen." },
  deleted: { tone: "success", text: "Die Datei wurde gelöscht." },
  hidden: { tone: "success", text: "Die Datei erscheint nicht mehr in der Liste." },
  shown: { tone: "success", text: "Die Datei erscheint wieder in der Liste." },
};

/**
 * The line to paste into the text: a picture is embedded, everything else is
 * linked.
 *
 * Offered as selectable text rather than behind a copy button, because a copy
 * button needs JavaScript and this page does not.
 */
const snippet = (file: StoredFile): string =>
  typeOf(file.name)?.disposition === "inline" && !file.name.endsWith(".pdf")
    ? `![${file.name}](/downloads/${file.name})`
    : `[${file.name}](/downloads/${file.name})`;

const WorkshopManagePage = (props: {
  text: string;
  files: StoredFile[];
  maxBytes: number;
  /** Set by the preview route: what the text would look like, unsaved. */
  preview?: string;
  msg?: string;
  error?: string;
}) => {
  const message = props.msg ? MESSAGES[props.msg] : undefined;
  const maxMB = Math.round(props.maxBytes / 1024 / 1024);

  return (
    <Layout>
      <PageHeading
        title={PAGES.workshopManage.label}
        intro={
          <>
            Der Text erscheint auf der öffentlichen Seite{" "}
            <a href={PAGES.workshop.href} class="link">
              {PAGES.workshop.label}
            </a>
            . Solange er leer ist, gibt es die Seite und den Reiter „Downloads“
            nicht.
          </>
        }
      />

      {props.error && <Notice tone="error">{props.error}</Notice>}
      {message && <Notice tone={message.tone}>{message.text}</Notice>}

      {/* ---- Der Text ---- */}
      <form method="post" action={PATH}>
        <SectionHeading>Text der Seite</SectionHeading>
        {/*
          * The text is the element's *content*, not a `value` attribute.
          * `<textarea>` has no such attribute, so a browser silently ignores it
          * and shows an empty box - with the saved text still in the database
          * and nothing on screen to say so. Saving from that empty box then
          * wrote an empty value, which deletes the setting and takes the page
          * and its tab down with it.
          */}
        <textarea
          name="value"
          rows={20}
          spellcheck={false}
          aria-label="Text der Workshop-Seite"
          class="textarea font-mono text-xs w-full"
        >
          {props.text}
        </textarea>

        <div class="mt-2 mb-4 text-sm text-base-content/70 max-w-[65ch]">
          <p>
            Markdown: <code>#</code> Überschrift, <code>-</code> Aufzählung,{" "}
            <code>**fett**</code>, <code>[Text](/ziel)</code>. Dazu auf dieser
            Seite:
          </p>
          <ul class="list-disc pl-6 mt-1 space-y-1">
            <li>
              <code>```python</code> … <code>```</code> für einen Codeblock —
              Einrückung bleibt erhalten.
            </li>
            <li>
              <code>| a | b |</code> mit einer Zeile <code>|---|---|</code>{" "}
              darunter für eine Tabelle.
            </li>
            <li>
              <code>![Beschreibung](/downloads/bild.png)</code> für ein Bild.
              Bilder von fremden Servern werden nicht eingebunden.
            </li>
          </ul>
        </div>

        <div class="flex gap-2 flex-wrap">
          <button type="submit" class="btn btn-primary">
            Speichern
          </button>
          <button type="submit" formaction={`${PATH}/preview`} class="btn btn-outline">
            Vorschau
          </button>
        </div>
      </form>

      {props.preview !== undefined && (
        <>
          <SectionHeading>Vorschau</SectionHeading>
          <p class="text-sm text-base-content/70 mb-2">
            So sähe die Seite aus. Gespeichert ist noch nichts.
          </p>
          <div
            class="rounded-box border border-base-300 p-4 mb-4"
            innerHTML={renderMarkdown(props.preview)}
          />
        </>
      )}

      {/* ---- Hochladen ---- */}
      <SectionHeading>Datei hinzufügen</SectionHeading>
      <form
        method="post"
        action={`${PATH}/upload`}
        enctype="multipart/form-data"
        class="mb-4"
      >
        <label class="block mb-2">
          <span class="block text-sm mb-1">
            Datei <span class="text-base-content/70">(Pflichtfeld)</span>
          </span>
          <input
            type="file"
            name="file"
            required
            accept={ALLOWED_EXTENSIONS.map((e) => `.${e}`).join(",")}
            class="file-input file-input-sm w-full max-w-md"
          />
        </label>

        <label class="flex items-center gap-2 mb-2 text-sm">
          <input type="checkbox" name="replace" value="1" class="checkbox checkbox-sm" />
          vorhandene Datei ersetzen
        </label>

        <p class="text-sm text-base-content/70 mb-2 max-w-[65ch]">
          Höchstens {maxMB} MB. Erlaubt sind: {ALLOWED_EXTENSIONS.join(", ")}.
          Der Name wird kleingeschrieben und von Sonderzeichen befreit, weil er
          Teil der Adresse wird.
        </p>

        <button type="submit" class="btn btn-outline btn-primary">
          Hochladen
        </button>
      </form>

      {/* ---- Die Dateien ---- */}
      <SectionHeading>Dateien zum Download</SectionHeading>
      <p class="text-sm text-base-content/70 mb-2 max-w-[65ch]">
        Diese Dateien erscheinen auf der Seite{" "}
        <a href={PAGES.downloads.href} class="link">
          {PAGES.downloads.label}
        </a>{" "}
        — nicht mehr unter dem Workshop-Text. Über die Spalte <em>Im Text</em>{" "}
        lässt sich eine Datei trotzdem im Text verlinken.
      </p>
      <p class="text-sm text-base-content/70 mb-2 max-w-[65ch]">
        <strong>Ausgeblendet</strong> heisst: erscheint nicht in der Liste auf der
        öffentlichen Seite. Erreichbar bleibt die Datei — das ist für Bilder
        gedacht, die im Text stehen und darunter nicht noch einmal als Download
        auftauchen sollen. Ein Zugriffsschutz ist es nicht.
      </p>

      <TableFrame class="mb-8">
        <thead>
          <tr>
            <th>Datei</th>
            <th class="text-right" colspan={2}>
              Grösse
            </th>
            <th>Geändert</th>
            <th>Im Text</th>
            <th>Sichtbar</th>
            <th>
              <span class="sr-only">Aktionen</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {props.files.length === 0 ? (
            <EmptyRow columns={7}>
              Noch keine Dateien. Über das Formular darüber lässt sich die erste
              hochladen.
            </EmptyRow>
          ) : (
            props.files.map((file) => {
              const size = formatBytes(file.bytes);
              return (
                <tr>
                  <td class="font-mono text-sm">{file.name}</td>
                  <td class="text-right tabular-nums">{size.wert}</td>
                  <td class="text-base-content/70">{size.einheit}</td>
                  <td class="text-sm">
                    <LocalTime at={file.changed} />
                  </td>
                  <td>
                    <code class="text-xs select-all">{snippet(file)}</code>
                  </td>
                  {/*
                    * The state is a word, not only an icon and not only a shade:
                    * colour alone must never be what carries a meaning.
                    */}
                  <td class="text-sm">{file.hidden ? "ausgeblendet" : "sichtbar"}</td>
                  <td>
                    <div class="flex gap-1 justify-end">
                      <a
                        href={`/downloads/${file.name}`}
                        class="btn btn-xs btn-ghost min-h-6 h-6 px-2"
                        title="Ansehen"
                      >
                        <DownloadIcon />
                        <span class="sr-only">Ansehen</span>
                      </a>

                      <form method="post" action={`${PATH}/visibility`}>
                        <input type="hidden" name="name" value={file.name} />
                        <input
                          type="hidden"
                          name="hidden"
                          value={file.hidden ? "0" : "1"}
                        />
                        <button
                          type="submit"
                          class="btn btn-xs btn-outline min-h-6 h-6 px-2 gap-1"
                        >
                          {file.hidden ? <EyeIcon /> : <EyeOffIcon />}
                          {file.hidden ? "einblenden" : "ausblenden"}
                        </button>
                      </form>

                      {/*
                        * An outline, not a filled button: red stays a signal
                        * colour rather than becoming the colour of a control.
                        * Word and icon together, so it is legible without colour.
                        */}
                      <form method="post" action={`${PATH}/delete`}>
                        <input type="hidden" name="name" value={file.name} />
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
                </tr>
              );
            })
          )}
        </tbody>
      </TableFrame>
    </Layout>
  );
};

export default WorkshopManagePage;
