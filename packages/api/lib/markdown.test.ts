import { describe, expect, test } from "bun:test";
import { renderMarkdown } from "./markdown";

describe("nichts Fremdes kommt durch", () => {
  /**
   * The reason this renderer escapes before it formats. These pages are public,
   * so anything that slipped through would be served to every visitor.
   */
  test("HTML im Text wird zu Text, nicht zu HTML", () => {
    const html = renderMarkdown("<script>alert(1)</script>");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  test("auch ein Bild mit onerror bleibt Text", () => {
    const html = renderMarkdown('<img src=x onerror="alert(1)">');
    expect(html).not.toContain("<img");
    expect(html).not.toContain("onerror=\"");
  });

  test("ein javascript:-Link wird nicht zum Link", () => {
    const html = renderMarkdown("[hier](javascript:alert(1))");
    expect(html).not.toContain("<a ");
    expect(html).toContain("[hier]");
  });

  test("data: und andere Schemata ebenso wenig", () => {
    for (const href of ["data:text/html,<b>", "vbscript:x", "file:///etc/passwd"]) {
      expect(renderMarkdown(`[x](${href})`)).not.toContain("<a ");
    }
  });

  test("ein Anführungszeichen kann nicht aus dem Attribut ausbrechen", () => {
    const html = renderMarkdown('[x](https://a.example/" onmouseover="alert(1))');
    expect(html).not.toContain('onmouseover="alert');
  });

  test("kaufmännisches Und wird nicht doppelt umgeschrieben", () => {
    expect(renderMarkdown("Meier & Söhne")).toContain("Meier &amp; Söhne");
    expect(renderMarkdown("Meier & Söhne")).not.toContain("&amp;amp;");
  });
});

describe("was gerendert wird", () => {
  test("Überschriften in drei Stufen", () => {
    expect(renderMarkdown("# Impressum")).toContain("<h2");
    expect(renderMarkdown("## Kontakt")).toContain("<h3");
    expect(renderMarkdown("### Details")).toContain("<h4");
  });

  test("Absätze werden durch Leerzeilen getrennt", () => {
    const html = renderMarkdown("Erster Absatz\n\nZweiter Absatz");
    expect(html.match(/<p /g)).toHaveLength(2);
  });

  /** An address block is written on consecutive lines and must stay that way. */
  test("einzelne Zeilenumbrüche bleiben im Absatz erhalten", () => {
    const html = renderMarkdown("Matthias Ruf\nHochdorferstr. 18\n88477 Schwendi");
    expect(html.match(/<p /g)).toHaveLength(1);
    expect(html.match(/<br>/g)).toHaveLength(2);
  });

  test("Aufzählungen, mit Strich oder Stern", () => {
    expect(renderMarkdown("- eins\n- zwei")).toContain("<ul");
    expect(renderMarkdown("* eins\n* zwei")).toContain("<ul");
    expect(renderMarkdown("- eins\n- zwei").match(/<li>/g)).toHaveLength(2);
  });

  test("nummerierte Listen", () => {
    const html = renderMarkdown("1. eins\n2. zwei");
    expect(html).toContain("<ol");
    expect(html.match(/<li>/g)).toHaveLength(2);
  });

  test("fett und kursiv", () => {
    expect(renderMarkdown("**wichtig**")).toContain("<strong>wichtig</strong>");
    expect(renderMarkdown("*betont*")).toContain("<em>betont</em>");
  });

  test("fett gewinnt gegen kursiv, sonst wird ** falsch gelesen", () => {
    const html = renderMarkdown("**ganz wichtig**");
    expect(html).toContain("<strong>ganz wichtig</strong>");
    expect(html).not.toContain("<em>");
  });

  test("Links nach aussen öffnen in einem neuen Tab und ohne Referrer", () => {
    const html = renderMarkdown("[Hetzner](https://www.hetzner.com/)");
    expect(html).toContain('href="https://www.hetzner.com/"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  test("Mailto und interne Ziele gelten auch, aber ohne neues Tab", () => {
    expect(renderMarkdown("[Mail](mailto:a@b.de)")).toContain("<a ");
    const intern = renderMarkdown("[Datenschutz](/datenschutz)");
    expect(intern).toContain('href="/datenschutz"');
    expect(intern).not.toContain("target=");
  });

  test("eine Trennlinie", () => {
    expect(renderMarkdown("---")).toContain("<hr");
  });
});

describe("was von früher kommt", () => {
  /**
   * Before there was a text box these values lived in an environment file, where
   * a real newline cannot be typed - so they carry literal backslash-n. Both
   * spell the same intent.
   */
  test("literales \\n aus der Umgebung wird zum Zeilenumbruch", () => {
    const html = renderMarkdown("Zeile eins\\nZeile zwei");
    expect(html).toContain("<br>");
    expect(html).not.toContain("\\n");
  });

  test("ein alter Text ohne jede Auszeichnung bleibt lesbar", () => {
    const html = renderMarkdown("Angaben gemäß § 5 TMG\\n\\nMatthias Ruf");
    expect(html.match(/<p /g)).toHaveLength(2);
    expect(html).toContain("Angaben gemäß § 5 TMG");
  });
});

describe("Randfälle", () => {
  test("leerer Text ergibt nichts", () => {
    expect(renderMarkdown("")).toBe("");
    expect(renderMarkdown("   \n\n  ")).toBe("");
  });

  test("Windows-Zeilenenden stören nicht", () => {
    expect(renderMarkdown("eins\r\n\r\nzwei").match(/<p /g)).toHaveLength(2);
  });

  test("ein einzelner Stern ist kein Kursivbeginn", () => {
    expect(renderMarkdown("2 * 3 = 6")).toContain("2 * 3 = 6");
  });
});
