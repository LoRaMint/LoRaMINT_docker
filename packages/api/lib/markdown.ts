/**
 * A small Markdown subset for the legal pages, rendered to HTML.
 *
 * Not a Markdown implementation - a documented handful of constructs that an
 * Impressum or a privacy notice actually needs: headings, paragraphs, lists,
 * bold, italic, links and rules. Anything else is left as the text somebody
 * typed.
 *
 * **The order is the security property.** Everything is escaped *first*, and the
 * markup is produced afterwards from the escaped text. Raw HTML in the source
 * can therefore never reach the page - a `<script>` in the box comes out as the
 * five characters somebody typed. That matters here more than elsewhere: these
 * pages are public, so an injection would be served to every visitor, and the
 * usual approach of parsing first and sanitising afterwards leaves the ordering
 * to be got right in two places instead of one.
 *
 * Links carry a second check: only http, https and mailto survive, because
 * `[hier](javascript:…)` is otherwise a working script in a Markdown link.
 */

const escapeHtml = (text: string): string =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

/** Schemes a link may use. Everything else is rendered as plain text. */
const SAFE_SCHEME = /^(https?:\/\/|mailto:|\/)/i;

/**
 * The inline constructs, applied to text that is already escaped.
 *
 * Bold before italic, so `**text**` is not read as an italic `*` wrapping
 * `*text*`.
 */
const inline = (escaped: string): string =>
  escaped
    // [text](url)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (whole, label: string, href: string) => {
      // The href went through escapeHtml, so a quote cannot break out of the
      // attribute; this only decides whether the link is worth making at all.
      if (!SAFE_SCHEME.test(href)) return whole;
      const external = /^https?:/i.test(href);
      const rel = external ? ' target="_blank" rel="noopener noreferrer"' : "";
      return `<a href="${href}" class="link"${rel}>${label}</a>`;
    })
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");

/** One block: a heading, a list, a rule, or a paragraph. */
const block = (chunk: string): string => {
  const lines = chunk.split("\n");

  const heading = /^(#{1,3})\s+(.*)$/.exec(lines[0] ?? "");
  if (heading && lines.length === 1) {
    const level = heading[1]!.length;
    const size = ["text-xl", "text-lg", "text-base"][level - 1];
    return `<h${level + 1} class="${size} font-bold mt-6 mb-2">${inline(
      heading[2]!,
    )}</h${level + 1}>`;
  }

  if (/^(-{3,}|\*{3,})$/.test(lines[0] ?? "") && lines.length === 1) {
    return '<hr class="my-6 border-base-300">';
  }

  const bulleted = lines.every((line) => /^[-*]\s+/.test(line));
  if (bulleted) {
    const items = lines
      .map((line) => `<li>${inline(line.replace(/^[-*]\s+/, ""))}</li>`)
      .join("");
    return `<ul class="list-disc pl-6 my-3 space-y-1">${items}</ul>`;
  }

  const numbered = lines.every((line) => /^\d+\.\s+/.test(line));
  if (numbered) {
    const items = lines
      .map((line) => `<li>${inline(line.replace(/^\d+\.\s+/, ""))}</li>`)
      .join("");
    return `<ol class="list-decimal pl-6 my-3 space-y-1">${items}</ol>`;
  }

  // A paragraph. Single line breaks inside one are kept, because an address
  // block is written that way and turning it into one run-on line would be
  // wrong.
  //
  // The whole paragraph is formatted *before* the breaks are inserted, not line
  // by line. Formatting each line on its own looks equivalent and is not: a
  // `**` opened on one line and closed on the next would never find its partner,
  // so a bold passage spanning a wrapped line came out as literal asterisks.
  // Nobody writing prose keeps an emphasis inside one physical line on purpose,
  // and the first real document this rendered - the privacy notice - tripped
  // over it immediately.
  const formatted = inline(lines.join("\n")).replace(/\n/g, "<br>");
  return `<p class="my-3 leading-relaxed">${formatted}</p>`;
};

/**
 * Renders the subset to HTML.
 *
 * Blocks are separated by a blank line, which is the one structural rule
 * somebody writing an Impressum has to know.
 */
export const renderMarkdown = (source: string): string => {
  // Values written before there was a text box carry literal backslash-n from
  // the environment file, where a real newline could not be typed. Both spell
  // the same intent, so both become a line break.
  const text = source.replace(/\\n/g, "\n").replace(/\r\n/g, "\n");

  return escapeHtml(text)
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0)
    .map(block)
    .join("\n");
};
