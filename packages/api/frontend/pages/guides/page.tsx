import Layout from "../../components/layout/Layout";
import PageHeading from "../../components/PageHeading";
import Notice from "../../components/Notice";
import { PAGES } from "../../../lib";
import { renderMarkdown } from "../../../lib/markdown";
import type { GuideEntry } from "../../../lib/guide-store";

/**
 * One guide, and the overview at the root of them all.
 *
 * The same component for both, because they are the same thing: a page
 * somebody wrote. The overview is **not** a grid of generated tiles - it is a
 * guide like any other, written in the editor, and that is a decision. A
 * generated overview says "Workshop, ESP32, Sensoren" and nothing else;
 * a written one can say which of them to read first.
 *
 * `innerHTML` is safe here for the same reason it is on the Impressum:
 * `renderMarkdown` escapes the source before it produces any markup, so nothing
 * typed into the box can become a tag. That matters more here than there,
 * because this text is written by the editor role rather than only by an
 * administrator - see lib/markdown.ts.
 *
 * **One column, one width - see `MEASURE`.**
 */

/**
 * How wide a guide is: 65 characters, for everything in it.
 *
 * `FORM-04` asks for 65 characters of running text and *permits* tables and
 * diagrams to be wider. It was read as an instruction for a while, and the
 * page narrowed the prose element by element while code blocks and tables ran
 * the full width of the article. On a screen that is one column of text with
 * things sticking out of it at three different widths, and the eye spends the
 * page looking for the edge.
 *
 * Declining a permission costs nothing here. A code block and the frame around
 * a table both scroll sideways already (`overflow-x-auto`), which is what
 * happens on a phone anyway - so the wide line is still readable, it is just
 * read by scrolling instead of by turning the head. The Impressum has been one
 * column since it was written; this is the same.
 *
 * On the `<article>` rather than on the text, so the heading and its rule, the
 * list of sub-pages and the note about the downloads all end on the same line.
 * A measure that half the page keeps is not a measure.
 *
 * It also fixes something no rule would have caught: the note box is
 * `text-sm`, and `ch` is relative to *its own* font - narrowed on its own it
 * came out at 561px against the paragraph's 641px, visibly short of a line it
 * was supposed to share.
 */
const MEASURE = "max-w-[65ch]";

const GuidePage = (props: {
  title: string;
  body: string;
  /** The way back up, for a sub-page. Absent on a root guide. */
  parent?: { href: string; label: string };
  /**
   * The pages below this one, as links. Empty on a leaf.
   *
   * Called `below` and not `children`: Solid gives `props.children` a meaning
   * of its own, and a prop that is sometimes the JSX inside a tag and
   * sometimes an array of links is one that will eventually be both.
   */
  below: { href: string; label: string }[];
  /** True while the page is a draft - only an editor ever sees this. */
  draft?: boolean;
}) => (
  <Layout>
    <article class={MEASURE}>
      <PageHeading
        title={props.title}
        {...(props.parent ? { back: props.parent } : {})}
      />

      {/*
        * Drafts are a 404 for everybody else (frontend/pages/index.tsx), so
        * this is only ever read by somebody who may edit it. It is worth
        * saying plainly: an editor looking at their own draft otherwise has no
        * way to tell it apart from the published page.
        */}
      {props.draft && (
        <Notice tone="warning">
          Diese Seite ist ein <strong>Entwurf</strong>. Sie steht nicht im Menü
          und ist für niemanden sonst zu sehen.
        </Notice>
      )}

      <div class="text-base" innerHTML={renderMarkdown(props.body)} />

      {/*
        * The pages below, listed at the foot.
        *
        * Generated here although the text above is written by hand, and the two
        * are not in conflict: the menu already knows the tree, so leaving the
        * way down to be typed means one forgotten link is a page nobody on a
        * phone can reach. A writer who lists them in the text as well gets them
        * twice, which is a nuisance rather than a dead end.
        */}
      {props.below.length > 0 && (
        <nav class="mt-8 border-t border-base-300 pt-4">
          <h2 class="text-lg font-semibold mb-2">Auf dieser Seite weiter</h2>
          <ul class="list-disc pl-6 space-y-1">
            {props.below.map((child) => (
              <li>
                <a href={child.href} class="link">
                  {child.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}

      <p class="mt-8 text-base-content/70">
        Die zentralen Dateien zu den Anleitungen liegen unter{" "}
        <a href={PAGES.downloads.href} class="link">
          {PAGES.downloads.label}
        </a>
        .
      </p>
    </article>

    {/* Island: copy buttons on the code blocks, lightbox on the pictures. */}
    <script type="module" src="/public/guides.js"></script>
  </Layout>
);

export default GuidePage;

/**
 * `/anleitungen`: the way into the guides, made from the tree.
 *
 * There was a written page here once - an ordinary row in `guides` under the
 * slug `uebersicht` - and the menu carries a fixed „Übersicht" entry for this
 * address anyway, so the written one stood in the menu a second time under a
 * second address. Deriving the list instead cannot drift from the tree and
 * needs nobody to keep it up to date; what it cannot do is say which guide to
 * read first, and that turned out to be worth less than the confusion cost.
 *
 * Two levels: themes, and what sits directly under them. Deeper would be the
 * menu again, printed into the page.
 */
export const GuidesIndexPage = (props: {
  mayEdit: boolean;
  themes: {
    href: string;
    label: string;
    unter: { href: string; label: string }[];
  }[];
}) => (
  <Layout>
    <article class="max-w-[65ch]">
      {/*
        * Written for somebody who has never heard of LoRaMINT: this address is
        * where „Workshop" and the rest hang, so it is the first thing a
        * visitor following the menu reads. „Nach und nach" is not filler - a
        * list of two entries otherwise reads like the whole of it.
        */}
      <PageHeading
        title={PAGES.guides.label}
        intro={
          props.themes.length > 0
            ? "Anleitungen und Tutorials zum LoRaMINT-System:"
            : "Hier entsteht der Anleitungsbereich. Sobald die erste Anleitung geschrieben ist, steht sie hier."
        }
      />

      {props.themes.length > 0 && (
        <ul class="space-y-3">
          {props.themes.map((theme) => (
            <li>
              <a href={theme.href} class="link font-semibold">
                {theme.label}
              </a>
              {theme.unter.length > 0 && (
                <ul class="list-disc pl-6 mt-1 space-y-1 text-base-content/80">
                  {theme.unter.map((child) => (
                    <li>
                      <a href={child.href} class="link">
                        {child.label}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}

      {/*
        * An empty state that names the next step, for whoever can take it
        * (`TAB-07`). For everybody else it stays a sentence, because a link
        * into a page they may not open is not help.
        */}
      {props.themes.length === 0 && props.mayEdit && (
        <p class="text-base-content/80">
          Geschrieben werden sie unter{" "}
          <a href={PAGES.guidesManage.href} class="link">
            {PAGES.guidesManage.label}
          </a>
          .
        </p>
      )}

      <p class="mt-8 text-base-content/70">
        Die zentralen Dateien zu den Anleitungen liegen unter{" "}
        <a href={PAGES.downloads.href} class="link">
          {PAGES.downloads.label}
        </a>
        .
      </p>
    </article>
  </Layout>
);

export type { GuideEntry };
