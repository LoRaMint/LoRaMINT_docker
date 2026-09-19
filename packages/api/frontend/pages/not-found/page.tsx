import Layout from "../../components/layout/Layout";
import PageHeading from "../../components/PageHeading";
import { PAGES } from "../../../lib";

/**
 * The page for an address that leads nowhere.
 *
 * There was none until now, and it did not much matter: every public address
 * was a fixed route, so a 404 meant a typed URL or a stale bookmark, and Hono's
 * bare `404 Not Found` was an honest answer to both.
 *
 * Guides change that. Their addresses are written by people, printed on
 * worksheets and pasted into mails, and a page that has been renamed one time
 * too many now ends here. Somebody standing in front of a class deserves a way
 * on rather than eleven characters of plain text - so this offers the two
 * places the missing thing is most likely to be.
 *
 * Deliberately small. A 404 that apologises at length is still a 404.
 */
const NotFoundPage = () => (
  <Layout>
    <PageHeading
      title="Diese Seite gibt es nicht"
      intro={
        "Die Adresse führt ins Leere. Vielleicht wurde die Seite umbenannt, " +
        "vielleicht steckt ein Tippfehler in der Adresse."
      }
    />
    <ul class="list-disc pl-6 space-y-1 max-w-[65ch]">
      <li>
        <a href={PAGES.guides.href} class="link">
          {PAGES.guides.label}
        </a>{" "}
        – alle Anleitungen im Überblick
      </li>
      <li>
        <a href={PAGES.downloads.href} class="link">
          {PAGES.downloads.label}
        </a>{" "}
        – die Dateien zum Herunterladen
      </li>
      <li>
        <a href={PAGES.home.href} class="link">
          Startseite
        </a>
      </li>
    </ul>
  </Layout>
);

export default NotFoundPage;
