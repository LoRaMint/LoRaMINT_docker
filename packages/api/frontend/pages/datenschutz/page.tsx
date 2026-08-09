import Layout from "../../components/layout/Layout";
import { legal } from "../../../config";
import { renderMarkdown } from "../../../lib/markdown";

/**
 * The Datenschutz, written as Markdown under Verwaltung → Konfiguration.
 *
 * `innerHTML` is safe here because `renderMarkdown` escapes the source before it
 * produces any markup - raw HTML in the setting cannot survive that, which
 * matters because this page is public. See lib/markdown.ts.
 */
const DatenschutzPage = () => {
  return (
    <Layout>
      <h1 class="text-2xl font-bold border-b border-base-300 pb-2 mb-6 mt-8">
        Datenschutz
      </h1>
      <div
        class="max-w-3xl text-base"
        innerHTML={renderMarkdown(legal.datenschutz ?? "")}
      />
    </Layout>
  );
};

export default DatenschutzPage;
