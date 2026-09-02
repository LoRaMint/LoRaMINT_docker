import Layout from "../../components/layout/Layout";
import PageHeading from "../../components/PageHeading";
import MailAddresses from "../../components/MailAddresses";
import { legal } from "../../../config";
import { renderMarkdown } from "../../../lib/markdown";

/**
 * The Impressum, written as Markdown under Verwaltung → Konfiguration.
 *
 * `innerHTML` is safe here because `renderMarkdown` escapes the source before it
 * produces any markup - raw HTML in the setting cannot survive that, which
 * matters because this page is public. See lib/markdown.ts.
 */
const ImpressumPage = () => {
  return (
    <Layout>
      <PageHeading title="Impressum" />
      <div
        class="max-w-[65ch] text-base"
        innerHTML={renderMarkdown(legal.impressum ?? "")}
      />
      <MailAddresses />
    </Layout>
  );
};

export default ImpressumPage;
