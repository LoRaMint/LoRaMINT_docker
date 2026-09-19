import Layout from "../../components/layout/Layout";
import PageHeading from "../../components/PageHeading";
import SectionHeading from "../../components/SectionHeading";
import LocalTime from "../../components/LocalTime";
import TableFrame, { EmptyRow } from "../../components/TableFrame";
import { DownloadIcon } from "../../components/icons";
import { PAGES } from "../../../lib";
import { formatBytes } from "../../../lib/uploads";
import { renderInlineMarkdown } from "../../../lib/markdown";
import type { StoredFile } from "../../../services/uploads";

/**
 * Everything that has been released, on a shelf of its own - grouped by the
 * folder it lives in, with a ZIP per folder.
 *
 * Each row may carry a note - where the file came from, which library the
 * sketch needs, why there are two versions of it. A file name says almost
 * nothing on its own, and a guide is not where somebody looking for a download
 * is standing. `innerHTML` is safe for the same reason it is in a guide: the
 * text is escaped first and only the inline subset is put back, and only an
 * editor can write one.
 *
 * **The rows are what has been released, and that default turned round.** Until
 * folders arrived the question was which files to *hide*, so everything
 * appeared here until somebody said otherwise; with a tree of working material
 * that is backwards. A file that is not released is still retrievable under its
 * own address, exactly as before - that is a decision about the listing and not
 * about access. See services/uploads.ts.
 *
 * The package is `/paket/<ordner>` and not `/downloads/<ordner>.zip`:
 * `loramint.zip` is a real uploaded file, so the two would collide on a folder
 * called `loramint`.
 */

/** Number of columns, so the empty row spans the table rather than guessing. */
const COLUMNS = 5;

/** Files by folder, deepest addresses last, root first. */
const byFolder = (files: StoredFile[]): [string, StoredFile[]][] => {
  const groups = new Map<string, StoredFile[]>();
  for (const file of files) {
    const group = groups.get(file.folder);
    if (group) group.push(file);
    else groups.set(file.folder, [file]);
  }
  return [...groups.entries()].sort(([a], [b]) =>
    // The root first, then alphabetically. It is the only group without a
    // heading of its own, so it has to be the one at the top.
    a === "" ? -1 : b === "" ? 1 : a.localeCompare(b),
  );
};

const FileTable = (props: { files: StoredFile[] }) => (
  <TableFrame class="mb-6">
    <thead>
      <tr>
        <th>Datei</th>
        {/*
          * Number and unit in two columns: the digits line up on the right,
          * the unit sits left-aligned beside them. Right-aligning "1,2 MB"
          * against "980 kB" as one string aligns the unit and leaves the
          * decimal point wandering.
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
            <td>
              <div class="font-mono text-sm">{file.name}</div>
              {file.note && (
                <div
                  class="text-sm text-base-content/70 mt-1 max-w-[55ch]"
                  innerHTML={renderInlineMarkdown(file.note)}
                />
              )}
            </td>
            <td class="text-right tabular-nums">{size.wert}</td>
            <td class="text-base-content/70">{size.einheit}</td>
            <td class="text-sm">
              <LocalTime at={file.changed} />
            </td>
            <td class="text-right">
              <a
                href={`/downloads/${file.path}`}
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
);

const DownloadsPage = (props: { files: StoredFile[] }) => {
  const groups = byFolder(props.files);

  return (
    <Layout>
      <PageHeading
        title={PAGES.downloads.label}
        intro="Dateien zum Herunterladen – Programme, Vorlagen und Unterlagen zum Mitnehmen."
      />

      {groups.length === 0 ? (
        // Unlike in a guide, the table is not left out when it is empty: there
        // the text carries the page on its own, here there would be nothing
        // under the heading but silence.
        <TableFrame class="mb-8">
          <tbody>
            <EmptyRow columns={COLUMNS}>Noch keine Dateien hinterlegt.</EmptyRow>
          </tbody>
        </TableFrame>
      ) : (
        groups.map(([folder, files]) => (
          <>
            <div class="flex flex-wrap items-center justify-between gap-2 mt-6">
              <SectionHeading>{folder === "" ? "Einzelne Dateien" : folder}</SectionHeading>
              {/*
                * Only a real folder gets a package. The loose files at the top
                * are not a folder, and "everything, as one file" is a different
                * offer from "this folder, as one file" - one somebody would
                * click by accident.
                */}
              {folder !== "" && (
                <a
                  href={`/paket/${folder}`}
                  class="btn btn-sm btn-outline btn-primary gap-2"
                >
                  <DownloadIcon />
                  Ordner als ZIP
                </a>
              )}
            </div>
            <FileTable files={files} />
          </>
        ))
      )}
    </Layout>
  );
};

export default DownloadsPage;
