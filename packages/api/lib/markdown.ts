/**
 * A small Markdown subset for the written pages, rendered to HTML.
 *
 * Not a Markdown implementation - a documented handful of constructs that an
 * Impressum, a privacy notice or the workshop page actually needs: headings,
 * paragraphs, lists, bold, italic, links, rules, code, images and tables.
 * Anything else is left as the text somebody typed.
 *
 * **The order is the security property.** Everything is escaped *first*, and the
 * markup is produced afterwards from the escaped text. Raw HTML in the source
 * can therefore never reach the page - a `<script>` in the box comes out as the
 * five characters somebody typed. That matters here more than elsewhere: these
 * pages are public, so an injection would be served to every visitor, and the
 * usual approach of parsing first and sanitising afterwards leaves the ordering
 * to be got right in two places instead of one.
 *
 * Every construct added since then keeps that order, and it costs nothing to
 * keep: `escapeHtml` touches only `& < > "`, while the syntax below is spelled
 * with backticks, pipes, brackets, parentheses and newlines. None of them can be
 * produced or destroyed by escaping, so parsing escaped text finds exactly what
 * parsing the source would have found - minus the ability to emit a tag.
 *
 * Links carry a second check: only http, https and site-relative paths survive,
 * because `[hier](javascript:…)` is otherwise a working script in a Markdown
 * link. Images are narrower still and take only local paths - see below.
 *
 * `mailto:` links do not become links here at all - see lib/mail-obfuscation.ts
 * for why and for what stands in their place.
 *
 * The classes are the ones the rest of the application uses, so a table typed
 * into the box looks like a table built from a component - see lib/table-style.ts.
 */

import {
  fallbackText,
  rot13,
  looksLikeAddress,
  splitAddress,
} from "./mail-obfuscation";
import { TABLE_CLASS, TABLE_FRAME_CLASS } from "./table-style";

const escapeHtml = (text: string): string =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

/**
 * Schemes a link may use. Everything else is rendered as plain text.
 *
 * The `\/(?!\/)` is not decoration. Written as a plain `\/` it also accepted a
 * protocol-relative `//example.com/x`, which then failed the `^https?:` test
 * below and was rendered as an *internal* link: an external destination without
 * `rel="noopener noreferrer"` and without opening in a new tab.
 */
const SAFE_SCHEME = /^(https?:\/\/|mailto:|\/(?!\/))/i;

/**
 * Where an image may point: this site, and nowhere else.
 *
 * Narrower than `SAFE_SCHEME` on purpose. An `<img>` is fetched without anybody
 * clicking it, so a foreign source would send the IP address of every visitor of
 * a public page to a third party the moment it loads. That is the same concern
 * that produced lib/mail-obfuscation.ts a few lines further down, and the images
 * on these pages point at files uploaded to this server anyway.
 */
const LOCAL_PATH = /^\/(?!\/)/;

/** Inline code: `text` in the middle of a sentence. */
const CODE_INLINE_CLASS = "bg-base-200 rounded-field px-1 text-sm";

/**
 * A code block. Same appearance as the `Code` component of the ESP32 guide, so
 * the two pages show one kind of code block rather than two.
 *
 * Deliberately not coloured. Syntax highlighting has a fixed palette in the
 * corporate design (`CODE-01`), and picking colours here would either duplicate
 * that decision or quietly contradict it. Plain text raises the question not at
 * all.
 */
const CODE_BLOCK_CLASS =
  "bg-neutral text-neutral-content rounded-box p-4 overflow-x-auto text-sm my-4";

/** An image: bounded by a border, never by a shadow (`FORM-05`). */
const IMAGE_CLASS = "max-w-full h-auto rounded-box border border-base-300 my-4";

/**
 * The inline constructs, applied to text that is already escaped.
 *
 * Code spans are taken out first and the rest is formatted around them, rather
 * than being one more `.replace()` in the chain. As a link in the chain they
 * would not work: a later pass would still rewrite the *inside* of the code
 * element, so `` `**nicht fett**` `` came out bold.
 *
 * The capturing `split` puts the code spans at the odd indices, which is what
 * makes "format everything except these" a two-line rule instead of a parser.
 * An unmatched backtick never lands in an odd slot and stays what it is.
 */
const inline = (escaped: string): string =>
  escaped
    .split(/(`[^`\n]+`)/)
    .map((part, index) =>
      index % 2 === 1
        ? `<code class="${CODE_INLINE_CLASS}">${part.slice(1, -1)}</code>`
        : formatInline(part),
    )
    .join("");

/**
 * Bold before italic, so `**text**` is not read as an italic `*` wrapping
 * `*text*`.
 */
const formatInline = (escaped: string): string =>
  escaped
    /*
     * Images and links in one pass, distinguished by the leading `!`.
     *
     * Two passes do not work, in either order, and the reason is worth keeping:
     * `![alt](url)` *contains* `[alt](url)`. Handle images first and a rejected
     * image - a foreign host, say - is handed to the link pass, which matches
     * the part after the `!` and turns an image nobody may show into a link
     * nobody wrote, with a stray `!` in front of it. Handle links first and
     * every image becomes that. One scan decides each occurrence once.
     */
    .replace(
      /(!?)\[([^\]]*)\]\(([^)\s]+)\)/g,
      (whole, bang: string, label: string, href: string) => {
        if (bang === "!") {
          if (!LOCAL_PATH.test(href)) return whole;
          // Both went through escapeHtml, so a quote in either cannot close the
          // attribute it sits in.
          return `<img src="${href}" alt="${label}" loading="lazy" class="${IMAGE_CLASS}">`;
        }

        // An empty label was never a link and stays text.
        if (label.length === 0) return whole;

        // The href went through escapeHtml, so a quote cannot break out of the
        // attribute; this only decides whether the link is worth making at all.
        if (!SAFE_SCHEME.test(href)) return whole;

        /*
         * A mail address never reaches the page. It leaves as two halves for the
         * browser to put back together, and as a readable line for whoever has no
         * browser doing that. Note the label goes the same way when it is the
         * address itself, which is how every address in these documents is
         * written - hiding only the href while the text spells it out would be a
         * gesture rather than a measure.
         */
        if (/^mailto:/i.test(href)) {
          const address = href.slice("mailto:".length);
          const parts = splitAddress(address);
          if (!parts) return whole;
          const labelAttribute = looksLikeAddress(label)
            ? ""
            : ` data-l="${rot13(label)}"`;
          return (
            `<span class="lm-mail" data-u="${rot13(parts.local)}"` +
            ` data-h="${rot13(parts.host)}"${labelAttribute}>` +
            `<noscript>${fallbackText(label, address)}</noscript></span>`
          );
        }

        const external = /^https?:/i.test(href);
        const rel = external ? ' target="_blank" rel="noopener noreferrer"' : "";
        return `<a href="${href}" class="link"${rel}>${label}</a>`;
      },
    )
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");

/**
 * The second line of a pipe table: `|---|:--:|---:|`.
 *
 * It is what tells a table from a paragraph that happens to contain a pipe, so
 * it has to be recognised exactly. Leading and trailing pipes are optional,
 * because both spellings are common and neither is wrong.
 */
const TABLE_DELIMITER = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

/** `:---` left, `:---:` centred, `---:` right. */
const alignmentOf = (cell: string): string => {
  const text = cell.trim();
  const left = text.startsWith(":");
  const right = text.endsWith(":");
  if (left && right) return "text-center";
  if (right) return "text-right";
  return "text-left";
};

/**
 * One table row into its cells.
 *
 * A pipe can be part of the text - a shell pipeline in a cell, say - and is
 * written `\|` there. The backslash passes through `escapeHtml` untouched, so
 * the lookbehind sees it exactly as it was typed.
 */
const cellsOf = (line: string): string[] =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split(/(?<!\\)\|/)
    .map((cell) => cell.replace(/\\\|/g, "|").trim());

/**
 * A pipe table.
 *
 * Rows with too few or too many cells are padded and cut rather than rejected.
 * Falling back to a paragraph would turn one miscounted pipe into a wall of
 * pipe characters, which is a worse answer to a typo than a table with an empty
 * cell in it.
 */
const table = (lines: string[]): string => {
  const header = cellsOf(lines[0]!);
  const alignments = cellsOf(lines[1]!).map(alignmentOf);
  const align = (index: number) => alignments[index] ?? "text-left";

  const head = header
    .map((cell, index) => `<th class="${align(index)}">${inline(cell)}</th>`)
    .join("");

  const body = lines
    .slice(2)
    .map((line) => {
      const cells = cellsOf(line);
      const padded = header.map((_, index) => cells[index] ?? "");
      return `<tr>${padded
        .map((cell, index) => `<td class="${align(index)}">${inline(cell)}</td>`)
        .join("")}</tr>`;
    })
    .join("");

  return (
    `<div class="${TABLE_FRAME_CLASS} my-4"><table class="${TABLE_CLASS}">` +
    `<thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`
  );
};

/** One block: a heading, a rule, a table, a list, or a paragraph. */
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

  // After the rule, because `---` on its own is a rule and not a one-column
  // table; before the lists, because a cell may begin with a dash.
  if (
    lines.length >= 2 &&
    lines.every((line) => line.includes("|")) &&
    TABLE_DELIMITER.test(lines[1]!)
  ) {
    return table(lines);
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

/** A stretch of the document: ordinary text, or the inside of a code fence. */
type Segment =
  | { kind: "prosa"; text: string }
  | { kind: "code"; sprache: string; text: string };

const FENCE_OPEN = /^```(\S*)\s*$/;
const FENCE_CLOSE = /^```\s*$/;

/**
 * A language name, reduced to something that may stand in a class attribute.
 *
 * The value is escaped already and could not break out of the attribute, but a
 * class name assembled from what somebody typed is a habit worth not forming.
 */
const languageClass = (raw: string): string =>
  /^[a-z0-9+#-]{1,20}$/.test(raw) ? ` class="language-${raw}"` : "";

/**
 * Splits the document into prose and code, keeping the order.
 *
 * This exists because a code block may contain a blank line and blank lines are
 * what separate the blocks below. Splitting on them first would tear a Python
 * function in half at every empty line inside it.
 *
 * A fence that is never closed ends the document instead of swallowing it. That
 * is a decision, not an oversight: the alternative is that one forgotten pair of
 * backticks makes the rest of somebody's page disappear while they are writing
 * it, which is the worst moment for a page to vanish.
 */
const segments = (escaped: string): Segment[] => {
  const out: Segment[] = [];
  let prosa: string[] = [];
  let code: string[] | null = null;
  let sprache = "";

  const flushProsa = () => {
    if (prosa.length > 0) out.push({ kind: "prosa", text: prosa.join("\n") });
    prosa = [];
  };

  for (const line of escaped.split("\n")) {
    if (code === null) {
      const open = FENCE_OPEN.exec(line);
      if (open) {
        flushProsa();
        code = [];
        sprache = open[1] ?? "";
        continue;
      }
      prosa.push(line);
      continue;
    }

    if (FENCE_CLOSE.test(line)) {
      out.push({ kind: "code", sprache, text: code.join("\n") });
      code = null;
      continue;
    }
    code.push(line);
  }

  if (code !== null) out.push({ kind: "code", sprache, text: code.join("\n") });
  flushProsa();
  return out;
};

/** Prose: blocks separated by a blank line. */
const prosaBlocks = (text: string): string =>
  text
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0)
    .map(block)
    .join("\n");

/**
 * Renders one line: links, code spans, bold, italic - and nothing that is a
 * block.
 *
 * For the places where a sentence sits inside something already laid out, like
 * the note beside a download in a table cell. `renderMarkdown` would wrap it in
 * a `<p>` and could turn a stray `#` into a heading; here a line break is a
 * space, because the caller has room for one line and got one.
 *
 * The same inline pass as in prose, so `[Quelle](https://…)` behaves the same
 * way in both places - external links get their `rel`, unsafe schemes stay
 * text, and a mail address still leaves in two halves.
 */
export const renderInlineMarkdown = (source: string): string =>
  inline(escapeHtml(source.replace(/\s+/g, " ").trim()));

/**
 * Renders the subset to HTML.
 *
 * Blocks are separated by a blank line, which is the one structural rule
 * somebody writing an Impressum has to know. Code fences are the exception and
 * are taken out first - see `segments`.
 */
export const renderMarkdown = (source: string): string => {
  // Values written before there was a text box carry literal backslash-n from
  // the environment file, where a real newline could not be typed. Both spell
  // the same intent, so both become a line break.
  const text = source.replace(/\\n/g, "\n").replace(/\r\n/g, "\n");

  return segments(escapeHtml(text))
    .map((segment) =>
      segment.kind === "code"
        ? // Verbatim: no inline formatting, no trimming of the inside, no <br>.
          // Indentation is meaning in Python, and a line that starts with four
          // spaces has to arrive with four spaces.
          `<pre class="${CODE_BLOCK_CLASS}"><code${languageClass(
            segment.sprache,
          )}>${segment.text}</code></pre>`
        : prosaBlocks(segment.text),
    )
    .filter((part) => part.length > 0)
    .join("\n");
};
