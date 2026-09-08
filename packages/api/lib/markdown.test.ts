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

  /**
   * Prose is wrapped at some column; an emphasis that runs over that column is
   * the normal case, not an edge one. Formatting line by line would leave the
   * asterisks standing - which is exactly what the privacy notice did.
   */
  test("fett darf über einen Zeilenumbruch hinweg gehen", () => {
    const html = renderMarkdown(
      "**Sie haben das Recht, jederzeit\nWiderspruch einzulegen.**",
    );
    expect(html).toContain("<strong>");
    expect(html).toContain("<br>");
    expect(html).not.toContain("**");
  });

  test("und kursiv ebenso", () => {
    const html = renderMarkdown("Das ist *über zwei\nZeilen betont*.");
    expect(html).toContain("<em>");
    expect(html).not.toContain("*über");
  });

  test("ein Link, dessen Beschriftung umbricht, bleibt ein Link", () => {
    const html = renderMarkdown("[Datenschutzerklärung von\nHetzner](https://a.example/)");
    expect(html).toContain('href="https://a.example/"');
    expect(html).not.toContain("](");
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

  test("interne Ziele gelten auch, aber ohne neues Tab", () => {
    const intern = renderMarkdown("[Datenschutz](/datenschutz)");
    expect(intern).toContain('href="/datenschutz"');
    expect(intern).not.toContain("target=");
  });

  describe("Mailto-Adressen verlassen den Server nicht", () => {
    test("weder als Link noch als Text steht die Adresse in der Ausgabe", () => {
      const html = renderMarkdown("[Mail](mailto:a.b@c.de)");
      expect(html).not.toContain("a.b@c.de");
      expect(html).not.toContain("mailto:");
      // Das eine Zeichen, auf das jedes Adressmuster anspringt.
      expect(html).not.toContain("@");
    });

    test("die Hälften stehen getrennt und rotiert da", () => {
      const html = renderMarkdown("[Mail](mailto:info@example.org)");
      expect(html).toContain('data-u="vasb"');
      expect(html).toContain('data-h="rknzcyr.bet"');
    });

    test("ist die Beschriftung selbst die Adresse, wird auch sie verschleiert", () => {
      const html = renderMarkdown("[info@example.org](mailto:info@example.org)");
      expect(html).not.toContain("info@example.org");
      // Keine eigene Beschriftung: der Browser setzt sie aus den Hälften.
      expect(html).not.toContain("data-l=");
    });

    test("eine Beschriftung, die keine Adresse ist, bleibt erhalten", () => {
      const html = renderMarkdown("[Kontakt](mailto:info@example.org)");
      expect(html).toContain('data-l="Xbagnxg"');
      expect(html).not.toContain(">Kontakt<");
    });

    test("ohne JavaScript bleibt die Adresse lesbar erreichbar", () => {
      const html = renderMarkdown("[info@example.org](mailto:info@example.org)");
      expect(html).toContain("<noscript>info (at) example.org</noscript>");
    });

    test("eine Wort-Beschriftung nennt die Adresse zusätzlich", () => {
      const html = renderMarkdown("[Kontakt](mailto:info@example.org)");
      expect(html).toContain("<noscript>Kontakt (info (at) example.org)</noscript>");
    });

    test("etwas, das keine Adresse ist, bleibt unangetastet", () => {
      expect(renderMarkdown("[x](mailto:kaputt)")).toContain("[x](mailto:kaputt)");
    });
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

describe("Codeblöcke", () => {
  /**
   * The reason `segments()` exists. Blank lines separate blocks everywhere else,
   * and a Python function with an empty line in it would otherwise be torn in
   * half at exactly that line.
   */
  test("eine Leerzeile zerreisst den Block nicht", () => {
    const html = renderMarkdown("```\neins\n\nzwei\n```");
    expect(html.match(/<pre /g)).toHaveLength(1);
    expect(html).toContain("eins\n\nzwei");
  });

  test("Markdown im Codeblock bleibt wörtlich", () => {
    const html = renderMarkdown("```\n**fett** [x](/y) - Punkt\n# keine Überschrift\n```");
    expect(html).not.toContain("<strong>");
    expect(html).not.toContain("<a ");
    expect(html).not.toContain("<li>");
    expect(html).not.toContain("<h2");
    expect(html).toContain("**fett**");
  });

  test("HTML im Codeblock wird Text, nicht Tag und nicht doppelt escapt", () => {
    const html = renderMarkdown("```\n<script>alert(1)</script>\n```");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("&amp;lt;");
  });

  /** Einrückung ist in Python Bedeutung, nicht Geschmack. */
  test("Einrückung bleibt Zeichen für Zeichen erhalten", () => {
    const html = renderMarkdown("```python\ndef f():\n    return 1\n```");
    expect(html).toContain("def f():\n    return 1");
  });

  test("die Sprachangabe wird zur Klasse", () => {
    expect(renderMarkdown("```python\nx\n```")).toContain('class="language-python"');
  });

  test("eine unbrauchbare Sprachangabe wird verworfen", () => {
    const html = renderMarkdown('```py"onload=x\nx\n```');
    expect(html).not.toContain("language-");
    expect(html).toContain("<code>");
  });

  /**
   * A forgotten closing fence must not make the rest of the page disappear while
   * somebody is still typing it.
   */
  test("ein nicht geschlossener Zaun verschluckt den Rest nicht", () => {
    const html = renderMarkdown("Vorher\n\n```\ncode hier");
    expect(html).toContain("Vorher");
    expect(html).toContain("code hier");
    expect(html).toContain("<pre ");
  });

  test("~~~ ist kein Zaun", () => {
    const html = renderMarkdown("~~~\nx\n~~~");
    expect(html).not.toContain("<pre ");
    expect(html).toContain("~~~");
  });
});

describe("Code im Fließtext", () => {
  test("in Backticks wird nichts mehr ausgezeichnet", () => {
    const html = renderMarkdown("Schreib `**nicht fett**` hin.");
    expect(html).not.toContain("<strong>");
    expect(html).toContain("**nicht fett**");
    expect(html).toContain("<code ");
  });

  test("ein einzelner Backtick bleibt Text", () => {
    expect(renderMarkdown("ein ` Zeichen")).not.toContain("<code ");
  });

  test("ein Pipe in Inline-Code macht keine Tabelle", () => {
    const html = renderMarkdown("`a | b`");
    expect(html).not.toContain("<table");
    expect(html).toContain("<code ");
  });
});

describe("Bilder", () => {
  test("ein lokales Bild wird zum img", () => {
    const html = renderMarkdown("![Schema](/downloads/aufbau.png)");
    expect(html).toContain('<img src="/downloads/aufbau.png"');
    expect(html).toContain('alt="Schema"');
    expect(html).toContain('loading="lazy"');
  });

  /**
   * A foreign image would send every visitor's IP to a third party on load - the
   * same reason the mail addresses on these pages are obfuscated.
   */
  test("ein fremd gehostetes Bild bleibt Text", () => {
    const html = renderMarkdown("![x](https://fremd.example/x.png)");
    expect(html).not.toContain("<img");
    expect(html).toContain("![x]");
  });

  test("javascript: und data: ebenso wenig", () => {
    for (const href of ["javascript:alert(1)", "data:image/svg+xml,<svg>"]) {
      expect(renderMarkdown(`![x](${href})`)).not.toContain("<img");
    }
  });

  /**
   * The text stays in the attribute - it is the quote that must not survive as a
   * quote. So the assertion is about the attribute being whole, not about the
   * words inside it being gone.
   */
  test("ein Anführungszeichen im Alt-Text bricht nicht aus dem Attribut aus", () => {
    const html = renderMarkdown('![a"onerror=alert(1)](/x.png)');
    expect(html).toContain('alt="a&quot;onerror=alert(1)"');
    expect(html).not.toContain('" onerror');
  });

  test("leerer Alt-Text ist erlaubt", () => {
    expect(renderMarkdown("![](/x.png)")).toContain('alt=""');
  });

  /** `![alt](url)` enthält `[alt](url)`; ohne die richtige Reihenfolge bleibt ein `!` vor einem Anchor stehen. */
  test("Bild und Link in einer Zeile stören sich nicht", () => {
    const html = renderMarkdown("![B](/b.png) und [L](/l)");
    expect(html).toContain("<img");
    expect(html).toContain("<a ");
    expect(html).not.toContain("!<a");
  });
});

describe("Tabellen", () => {
  const TABELLE = "| Datei | Größe |\n|---|---:|\n| a.py | 1 |\n| b.pdf | 2 |";

  test("Kopf, Trennzeile und Datenzeilen werden zur Tabelle", () => {
    const html = renderMarkdown(TABELLE);
    expect(html).toContain("<table");
    expect(html.match(/<th /g)).toHaveLength(2);
    expect(html.match(/<tr>/g)).toHaveLength(3);
    expect(html).toContain("a.py");
  });

  test("die Ausrichtung kommt aus der Trennzeile", () => {
    const html = renderMarkdown("| l | m | r |\n|:---|:---:|---:|\n| 1 | 2 | 3 |");
    expect(html).toContain("text-left");
    expect(html).toContain("text-center");
    expect(html).toContain("text-right");
  });

  test("zu wenige Zellen werden aufgefüllt, zu viele abgeschnitten", () => {
    const html = renderMarkdown("| a | b |\n|---|---|\n| 1 |\n| 1 | 2 | 3 |");
    expect(html.match(/<tr>/g)).toHaveLength(3);
    expect(html.match(/<td /g)).toHaveLength(4);
  });

  test("ein maskiertes Pipe bleibt Text in der Zelle", () => {
    const html = renderMarkdown("| Befehl |\n|---|\n| ls \\| wc |");
    expect(html).toContain("ls | wc");
    expect(html.match(/<td /g)).toHaveLength(1);
  });

  test("eine Tabelle ohne Datenzeilen ist trotzdem eine Tabelle", () => {
    const html = renderMarkdown("| a | b |\n|---|---|");
    expect(html).toContain("<table");
    expect(html).toContain("<tbody></tbody>");
  });

  test("ein Absatz mit einem Pipe bleibt ein Absatz", () => {
    const html = renderMarkdown("Das a | b Verfahren\nist gemeint");
    expect(html).not.toContain("<table");
    expect(html).toContain("<p ");
  });

  test("Auszeichnung und Links wirken in Zellen", () => {
    const html = renderMarkdown("| a |\n|---|\n| **fett** und [L](/l) |");
    expect(html).toContain("<strong>");
    expect(html).toContain("<a ");
  });

  test("--- allein bleibt eine Trennlinie", () => {
    expect(renderMarkdown("---")).toContain("<hr ");
  });
});

describe("Links, die keine internen sind", () => {
  /**
   * `//example.com` passed the `/` branch of SAFE_SCHEME and then failed the
   * `^https?:` test, so it was rendered as an internal link: an external
   * destination without rel="noopener noreferrer".
   */
  test("ein protokollrelativer Link gilt nicht als interner Pfad", () => {
    const html = renderMarkdown("[x](//fremd.example/x)");
    expect(html).not.toContain("<a ");
    expect(html).toContain("[x]");
  });
});
