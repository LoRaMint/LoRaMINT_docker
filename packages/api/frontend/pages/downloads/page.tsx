import Layout from "../../components/layout/Layout";
import PageHeading from "../../components/PageHeading";
import LocalTime from "../../components/LocalTime";
import TableFrame, { EmptyRow } from "../../components/TableFrame";
import { DownloadIcon } from "../../components/icons";
import { PAGES } from "../../../lib";
import { formatBytes } from "../../../lib/uploads";
import type { StoredFile } from "../../../services/uploads";

/**
 * Everything that has been uploaded, on a shelf of its own.
 *
 * The table used to sit at the foot of the workshop page. It moved because the
 * two answer different questions - one is something to read, the other
 * something to fetch - and because the files were unreachable through any page
 * while the workshop text was empty, although they were being served the whole
 * time.
 *
 * The rows are `listVisibleFiles()`, so a hidden file does not appear here.
 * That is a decision about the listing and **not** about access: a hidden file
 * stays retrievable under its own address, exactly as before. See
 * services/uploads.ts.
 */

/** Number of columns, so the empty row spans the table rather than guessing. */
const COLUMNS = 5;

const DownloadsPage = (props: { files: StoredFile[] }) => {
  return (
    <Layout>
      <PageHeading
        title={PAGES.downloads.label}
        intro="Dateien zum Herunterladen – Programme, Vorlagen und Unterlagen zum Mitnehmen."
      />

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
          {props.files.length === 0 ? (
            // Unlike on the workshop page, the table is not left out when it is
            // empty: there the text carried the page on its own, here there
            // would be nothing under the heading but silence.
            <EmptyRow columns={COLUMNS}>Noch keine Dateien hinterlegt.</EmptyRow>
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
            })
          )}
        </tbody>
      </TableFrame>
    </Layout>
  );
};

export default DownloadsPage;
