import Layout from "../../components/layout/Layout";
import PageHeading from "../../components/PageHeading";
import SectionHeading from "../../components/SectionHeading";
import Notice from "../../components/Notice";
import LocalTime from "../../components/LocalTime";
import { PAGES } from "../../../lib";
import { renderMarkdown } from "../../../lib/markdown";
import FileBrowser, { FILE_MESSAGES } from "./files-browser";
import { GUIDE_MESSAGES } from "./guides-page";
import type { Guide } from "../../../services/guides";
import type { StoredFile } from "../../../services/uploads";

/**
 * Writing one guide: the title, the address, the draft switch, the text, a
 * preview - and the files, right underneath.
 *
 * The file browser is here rather than a page away because of what somebody is
 * actually doing: the address of a file is what gets written into the text, so
 * the list has to be within reach of the box. It is the same component the file
 * page is made of (`files-browser.tsx`), posting to the same routes, returning
 * here through the hidden `back` field.
 *
 * The preview is a round trip to the server rather than a script, like the one
 * the workshop page had - and it earns the round trip: this is a box in which
 * somebody types tables, code fences and collapsible sections, and a text area
 * gives no hint whether a delimiter row was right until the page is saved.
 *
 * Works without JavaScript throughout.
 */

const PATH = PAGES.guidesManage.href;

/** Both message tables, because both kinds of form post from this page. */
const MESSAGES = { ...GUIDE_MESSAGES, ...FILE_MESSAGES };

const GuideEditPage = (props: {
  guide: Guide;
  /** Where the page sits, for the link to the live address. */
  path: string;
  files: StoredFile[];
  folders: string[];
  folder: string;
  maxBytes: number;
  /** This page's own address, so the file forms come back here. */
  back: string;
  /** Set by the preview route: what the text would look like, unsaved. */
  preview?: string;
  msg?: string;
  error?: string;
}) => {
  const message = props.msg ? MESSAGES[props.msg] : undefined;

  return (
    <Layout>
      <PageHeading
        title={props.guide.title}
        back={PAGES.guidesManage}
        intro={
          <>
            Adresse:{" "}
            {props.guide.published ? (
              <a href={`${PAGES.guides.href}/${props.path}`} class="link font-mono">
                {PAGES.guides.href}/{props.path}
              </a>
            ) : (
              <span class="font-mono">
                {PAGES.guides.href}/{props.path}
              </span>
            )}
            {props.guide.updatedBy && (
              <>
                {" "}· zuletzt geändert von {props.guide.updatedBy},{" "}
                <LocalTime at={props.guide.updatedAt} />
              </>
            )}
          </>
        }
      />

      {props.error && <Notice tone="error">{props.error}</Notice>}
      {message && <Notice tone={message.tone}>{message.text}</Notice>}

      {!props.guide.published && (
        <Notice tone="warning">
          Diese Seite ist ein <strong>Entwurf</strong>. Sie steht in keinem Menü,
          und wer sie nicht bearbeiten darf, bekommt 404.
        </Notice>
      )}

      {/* ---- Titel, Zustand, Text ---- */}
      <form method="post" action={`${PATH}/${props.guide.id}`}>
        <div class="flex flex-wrap gap-4 items-end mb-3">
          <label class="text-sm">
            <span class="block text-base-content/70 mb-1">
              Titel <span class="text-base-content/70">(Pflichtfeld)</span>
            </span>
            <input
              type="text"
              name="title"
              value={props.guide.title}
              required
              autocomplete="off"
              class="input input-sm w-80"
            />
          </label>
          <label class="flex items-center gap-2 text-sm pb-2">
            <input
              type="checkbox"
              name="published"
              value="1"
              checked={props.guide.published}
              class="checkbox checkbox-sm"
            />
            veröffentlicht
          </label>
        </div>

        <SectionHeading>Text der Seite</SectionHeading>
        {/*
          * The text is the element's *content*, not a `value` attribute.
          * `<textarea>` has no such attribute, so a browser silently ignores it
          * and shows an empty box - with the saved text still in the database
          * and nothing on screen to say so. Saving from that empty box then
          * wrote an empty page.
          */}
        <textarea
          name="body"
          rows={24}
          spellcheck={false}
          aria-label="Text der Anleitung"
          class="textarea font-mono text-xs w-full"
        >
          {props.guide.body}
        </textarea>

        <div class="mt-2 mb-4 text-sm text-base-content/70 max-w-[65ch]">
          <p>
            Markdown: <code>#</code> Überschrift, <code>-</code> Aufzählung,{" "}
            <code>**fett**</code>, <code>[Text](/ziel)</code>. Dazu:
          </p>
          <ul class="list-disc pl-6 mt-1 space-y-1">
            <li>
              <code>```python</code> … <code>```</code> für einen Codeblock —
              Einrückung bleibt erhalten, und daneben steht ein Kopier-Knopf.
            </li>
            <li>
              <code>| a | b |</code> mit einer Zeile <code>|---|---|</code>{" "}
              darunter für eine Tabelle.
            </li>
            <li>
              <code>&gt; Text</code> für einen Hinweiskasten.
            </li>
            <li>
              <code>![Beschreibung](/downloads/bild.png)</code> für ein Bild;
              mit <code>"Unterschrift"</code> hinter der Adresse bekommt es eine
              Bildunterschrift. Bilder von fremden Servern werden nicht
              eingebunden.
            </li>
            <li>
              Eine Grösse kommt vor die Unterschrift:{" "}
              <code>=50%</code> für die halbe Spaltenbreite,{" "}
              <code>=400</code> für höchstens 400 px breit,{" "}
              <code>=x300</code> für höchstens 300 px hoch,{" "}
              <code>=200x400</code> für beides. Das Bild wird{" "}
              <strong>nie verzerrt</strong> – es passt sich in den Rahmen ein –
              und auf einem schmalen Schirm bleibt es schmal, auch wenn hier
              eine grössere Zahl steht. Ein Anteil ist der beste erste Griff:
              er stimmt auf jedem Bildschirm.
            </li>
            <li>
              <code>:::klapp Häufige Probleme</code> … <code>:::</code> für
              einen Abschnitt zum Aufklappen.
            </li>
            <li>
              Jede Überschrift bekommt einen Anker, auf den sich verlinken
              lässt: <code>[dorthin](#aufbau)</code>.
            </li>
          </ul>
        </div>

        <div class="flex gap-2 flex-wrap">
          <button type="submit" class="btn btn-primary">
            Speichern
          </button>
          <button
            type="submit"
            formaction={`${PATH}/${props.guide.id}/preview`}
            class="btn btn-outline"
          >
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

      {/* ---- Adresse ---- */}
      <SectionHeading>Adresse</SectionHeading>
      <p class="text-sm text-base-content/70 mb-2 max-w-[65ch]">
        Die Adresse ändern heisst: die alte leitet ab sofort dauerhaft auf die
        neue um – die dieser Seite und die jeder Unterseite. Ein gedrucktes
        Blatt zeigt also nicht ins Leere. Sichtbar bleiben die alten Adressen
        unter{" "}
        <a href={PATH} class="link">
          {PAGES.guidesManage.label}
        </a>
        .
      </p>
      <form
        method="post"
        action={`${PATH}/${props.guide.id}/slug`}
        class="flex flex-wrap gap-2 items-center mb-6"
      >
        <label class="text-sm text-base-content/70" for="slug">
          Letztes Stück der Adresse
        </label>
        <input
          id="slug"
          type="text"
          name="slug"
          value={props.guide.slug}
          autocomplete="off"
          class="input input-sm font-mono w-64"
        />
        <button type="submit" class="btn btn-sm btn-outline">
          ändern
        </button>
      </form>

      {/* ---- Die Dateien, eingeblendet ---- */}
      <FileBrowser
        files={props.files}
        folders={props.folders}
        folder={props.folder}
        maxBytes={props.maxBytes}
        back={props.back}
        snippets
      />

      {/* The guide island, so the preview above behaves like the real page:
          copy buttons on the code blocks, lightbox on the pictures. */}
      <script type="module" src="/public/guides.js"></script>
    </Layout>
  );
};

export default GuideEditPage;
