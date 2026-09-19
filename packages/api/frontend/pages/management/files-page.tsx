import Layout from "../../components/layout/Layout";
import PageHeading from "../../components/PageHeading";
import Notice from "../../components/Notice";
import { PAGES } from "../../../lib";
import FileBrowser, { FILE_MESSAGES } from "./files-browser";
import type { StoredFile } from "../../../services/uploads";

/**
 * Every file in one place, with folders.
 *
 * The page is almost nothing but `FileBrowser`, which is the point: the same
 * browser is shown inside every guide editor, so there is one set of controls
 * for files rather than two that drift apart.
 */
const FilesPage = (props: {
  files: StoredFile[];
  folders: string[];
  folder: string;
  maxBytes: number;
  back: string;
  msg?: string;
  error?: string;
}) => {
  const message = props.msg ? FILE_MESSAGES[props.msg] : undefined;

  return (
    <Layout>
      <PageHeading
        title={PAGES.filesManage.label}
        intro={
          <>
            Alles, was hochgeladen wurde – in Ordnern, so tief verschachtelt wie
            nötig. Was freigeschaltet ist, steht auf{" "}
            <a href={PAGES.downloads.href} class="link">
              {PAGES.downloads.label}
            </a>
            ; verlinkt wird eine Datei in einer Anleitung über ihren Pfad.
          </>
        }
      />

      {props.error && <Notice tone="error">{props.error}</Notice>}
      {message && <Notice tone={message.tone}>{message.text}</Notice>}

      <FileBrowser
        files={props.files}
        folders={props.folders}
        folder={props.folder}
        maxBytes={props.maxBytes}
        back={props.back}
      />
    </Layout>
  );
};

export default FilesPage;
