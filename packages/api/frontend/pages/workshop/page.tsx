import Layout from "../../components/layout/Layout";
import PageHeading from "../../components/PageHeading";
import { content } from "../../../config";
import { PAGES } from "../../../lib";
import { renderMarkdown } from "../../../lib/markdown";

/**
 * The workshop page: the written text, and nothing else.
 *
 * The files used to sit in a table underneath. They have their own page now
 * (`frontend/pages/downloads/page.tsx`), because a page that is both an article
 * and a file listing is neither - and because the files are worth reaching
 * without a workshop text existing at all.
 *
 * `innerHTML` is safe here for the same reason it is on the Impressum:
 * `renderMarkdown` escapes the source before it produces any markup, so nothing
 * typed into the box can become a tag. That matters more here than there,
 * because this text is written by the editor role rather than only by an
 * administrator - see lib/markdown.ts.
 *
 * **Why the prose is narrowed one element at a time.** Running text belongs in a
 * measure of about 65 characters, and the Impressum gets that from a wrapper.
 * Here the same wrapper would also squeeze the tables and the code blocks, which
 * the design explicitly lets run wider - a three-column table or a line of
 * Python at 90 characters is unreadable in a narrow column, and scrolling it
 * sideways inside a page that has room to spare is worse. So the container is
 * full width and the running-text elements are narrowed individually.
 */

const PROSE_WIDTH =
  "[&>p]:max-w-[65ch] [&>ul]:max-w-[65ch] [&>ol]:max-w-[65ch] " +
  "[&>h2]:max-w-[65ch] [&>h3]:max-w-[65ch] [&>h4]:max-w-[65ch]";

const WorkshopPage = () => {
  return (
    <Layout>
      <PageHeading title={PAGES.workshop.label} />

      <div class={`text-base ${PROSE_WIDTH}`} innerHTML={renderMarkdown(content.workshop ?? "")} />

      {/*
        * The way on, since the files no longer follow underneath. A fixed line
        * rather than a sentence the editor has to remember to write: whoever
        * read to the end here was one scroll away from the downloads before,
        * and should not now be at a dead end.
        */}
      <p class="mt-8 max-w-[65ch] text-base-content/70">
        Die Dateien zum Workshop liegen unter{" "}
        <a href={PAGES.downloads.href} class="link">
          {PAGES.downloads.label}
        </a>
        .
      </p>
    </Layout>
  );
};

export default WorkshopPage;
