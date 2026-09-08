import Layout from "../../components/layout/Layout";
import PageHeading from "../../components/PageHeading";
import LocalTime from "../../components/LocalTime";
import TableFrame from "../../components/TableFrame";
import SectionHeading from "../../components/SectionHeading";
import { DownloadIcon } from "../../components/icons";
import { content } from "../../../config";
import { PAGES } from "../../../lib";
import { formatBytes } from "../../../lib/uploads";
import { renderMarkdown } from "../../../lib/markdown";
import type { StoredFile } from "../../../services/uploads";

/**
 * The workshop page: a written text, and the files that go with it.
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

const WorkshopPage = (props: { files: StoredFile[] }) => {
  return (
    <Layout>
      <PageHeading title={PAGES.workshop.label} />

      <div class={`text-base ${PROSE_WIDTH}`} innerHTML={renderMarkdown(content.workshop ?? "")} />

      {/*
        * No files, no section. An empty table under a text that never mentioned
        * files would be furniture; the page is complete without it.
        */}
      {props.files.length > 0 && (
        <>
          <SectionHeading>Dateien zum Download</SectionHeading>
          <TableFrame class="mb-8">
            <thead>
              <tr>
                <th>Datei</th>
                {/*
                  * Number and unit in two columns: the digits line up on the
                  * right, the unit sits left-aligned beside them. Right-aligning
                  * "1,2 MB" against "980 kB" as one string aligns the unit and
                  * leaves the decimal point wandering.
                  */}
                <th class="text-right" colspan={2}>
                  Grösse
                </th>
                <th>Geändert</th>
                <th>
                  <span class="sr-only">Herunterladen</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {props.files.map((file) => {
                const size = formatBytes(file.bytes);
                return (
                  <tr>
                    <td class="font-mono text-sm">{file.name}</td>
                    <td class="text-right tabular-nums">{size.wert}</td>
                    <td class="text-base-content/70">{size.einheit}</td>
                    <td class="text-sm">
                      <LocalTime at={file.changed} />
                    </td>
                    <td class="text-right">
                      <a
                        href={`/downloads/${file.name}`}
                        download=""
                        class="btn btn-sm btn-outline btn-primary gap-2"
                      >
                        <DownloadIcon />
                        Herunterladen
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </TableFrame>
        </>
      )}
    </Layout>
  );
};

export default WorkshopPage;
