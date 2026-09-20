import { describe, expect, test } from "bun:test";
import { renderInlineMarkdown, renderMarkdown } from "./markdown";

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

describe("renderInlineMarkdown", () => {
  test("macht einen Link, aber keinen Absatz", () => {
    const html = renderInlineMarkdown("Quelle: [Adafruit](https://adafruit.com)");
    expect(html).toContain('href="https://adafruit.com"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).not.toContain("<p>");
  });

  test("escapt, was hineingeschrieben wurde", () => {
    expect(renderInlineMarkdown("<script>alert(1)</script>")).not.toContain("<script>");
  });

  test("ein Schema, das kein Link sein darf, bleibt Text", () => {
    const html = renderInlineMarkdown("[klick](javascript:alert(1))");
    expect(html).not.toContain("<a ");
  });

  test("eine Überschrift ist hier keine, denn es gibt keine Blöcke", () => {
    // Der Unterschied zu renderMarkdown, und der Grund für die zweite Funktion:
    // in einer Tabellenzelle ist eine Überschrift kein Hinweis mehr.
    expect(renderInlineMarkdown("# kein Titel")).toBe("# kein Titel");
    expect(renderMarkdown("# kein Titel")).toContain("<h2");
  });

  test("ein Umbruch wird zum Leerzeichen statt zum Zeilenende", () => {
    expect(renderInlineMarkdown("erste\nzweite")).toBe("erste zweite");
  });
});

/**
 * The four constructs the ESP32 guide needed before it could stop being JSX.
 *
 * Each of them replaces a hand-written component: `Note`, `Figure`, the
 * „Häufige Probleme" section, and the headings somebody wanted to link to.
 */
describe("was eine lange Anleitung braucht", () => {
  describe("Hinweiskasten", () => {
    test("> Text wird zum Kasten, mit Auszeichnung darin", () => {
      const html = renderMarkdown("> Das erledigt **vorab** eure Lehrkraft.");
      expect(html).toContain("border-l-4 border-primary");
      expect(html).toContain("<strong>vorab</strong>");
    });

    test("mehrere Zeilen bleiben ein Kasten mit Umbruch", () => {
      const html = renderMarkdown("> eins\n> zwei");
      expect(html.match(/border-l-4/g)).toHaveLength(1);
      expect(html).toContain("eins<br>zwei");
    });

    /** Kein `<blockquote>`: es ist kein Zitat, sondern ein Hinweis. */
    test("es ist kein Zitat", () => {
      expect(renderMarkdown("> Hinweis")).not.toContain("<blockquote");
    });

    test("und escapt wird zuerst, auch hier", () => {
      const html = renderMarkdown("> <img src=x onerror=alert(1)>");
      expect(html).not.toContain("<img");
      expect(html).toContain("&lt;img");
    });
  });

  describe("Bildunterschrift", () => {
    test("ein Bild allein auf seiner Zeile bekommt figure und figcaption", () => {
      const html = renderMarkdown('![Die Bauteile](/downloads/parts.jpg "Alles im Überblick")');
      expect(html).toStartWith("<figure");
      expect(html).toContain("<figcaption");
      expect(html).toContain("Alles im Überblick");
      expect(html).toContain('alt="Die Bauteile"');
    });

    test("ohne Unterschrift bleibt es ein blosses Bild", () => {
      const html = renderMarkdown("![x](/a.png)");
      expect(html).not.toContain("<figure");
      expect(html).toStartWith("<img");
    });

    /**
     * `<figure>` darf nicht in einem `<p>` stehen - der Browser schliesst den
     * Absatz sonst still und das Dokument bekommt eine andere Form, als es
     * gelesen wird. Im Satz bleibt die Unterschrift deshalb ein `title`.
     */
    test("mitten im Satz entsteht kein figure", () => {
      const html = renderMarkdown('Ein Satz mit ![Bild](/a.png "Titel") darin.');
      expect(html).not.toContain("<figure");
      expect(html).toContain('title="Titel"');
      expect(html).toStartWith("<p");
    });

    test("ein fremder Server bleibt auch mit Unterschrift Text", () => {
      const html = renderMarkdown('![x](https://fremd.example/x.png "cap")');
      expect(html).not.toContain("<img");
      expect(html).not.toContain("<figure");
    });

    /** Der Haken, den die Insel sucht - siehe frontend/pages/guides/client.ts. */
    test("jedes Bild trägt zoomable", () => {
      expect(renderMarkdown("![x](/a.png)")).toContain("zoomable");
      expect(renderMarkdown('![x](/a.png "y")')).toContain("zoomable");
    });
  });

  describe("Aufklapp-Abschnitt", () => {
    test(":::klapp Titel … ::: wird zu details mit summary", () => {
      const html = renderMarkdown(":::klapp Häufige Probleme\nEs geht nicht.\n:::");
      expect(html).toContain("<details");
      expect(html).toContain("collapse");
      expect(html).toContain("<summary");
      expect(html).toContain("Häufige Probleme");
      expect(html).toContain("Es geht nicht.");
    });

    /** Der eigentliche Grund für die Behandlung auf Segmentebene. */
    test("er überlebt eine Leerzeile und einen Codeblock darin", () => {
      const html = renderMarkdown(
        ":::klapp Titel\nErster Absatz.\n\n```python\nprint(1)\n```\n\nZweiter.\n:::",
      );
      expect(html.match(/<details/g)).toHaveLength(1);
      expect(html).toContain("<pre");
      expect(html).toContain("Zweiter.");
      // Nichts davon darf hinter dem Abschnitt liegen.
      expect(html).toEndWith("</details>");
    });

    /** Ein `:::` im Code beendet den Abschnitt nicht. */
    test("ein Trenner im Codeblock zählt nicht", () => {
      const html = renderMarkdown(
        ":::klapp Titel\n```python\nx = \":::\"\n```\nDanach.\n:::",
      );
      expect(html).toContain("Danach.");
      expect(html.match(/<details/g)).toHaveLength(1);
    });

    /**
     * Ein vergessenes `:::` darf nicht den Rest der Seite verschlucken - es
     * endet sie, so wie ein offener Codeblock es tut.
     */
    test("ein nie geschlossener Abschnitt endet das Dokument", () => {
      const html = renderMarkdown("Davor.\n\n:::klapp Titel\nDarin.");
      expect(html).toContain("Davor.");
      expect(html).toContain("Darin.");
      expect(html).toContain("<details");
    });

    test("ohne Titel ist es kein Abschnitt", () => {
      expect(renderMarkdown(":::klapp\ntext\n:::")).not.toContain("<details");
    });

    test("und escapt wird auch der Titel zuerst", () => {
      const html = renderMarkdown(":::klapp <script>x</script>\ntext\n:::");
      expect(html).not.toContain("<script>");
      expect(html).toContain("&lt;script&gt;");
    });
  });

  describe("Überschriften-Anker", () => {
    test("jede Überschrift bekommt eine id aus ihrem Text", () => {
      expect(renderMarkdown("# Materialien")).toContain('id="materialien"');
      expect(renderMarkdown("## Aufbau")).toContain('id="aufbau"');
      expect(renderMarkdown("### Verdrahtung")).toContain('id="verdrahtung"');
    });

    test("Umlaute werden zu Digraphen, nicht zu Bindestrichen", () => {
      expect(renderMarkdown("## Übung für später")).toContain('id="uebung-fuer-spaeter"');
    });

    /** Die Entities, die escapeHtml erzeugt hat, dürfen nicht im Anker landen. */
    test("aus „Strom & Spannung\" wird kein „amp\"", () => {
      const id = /id="([^"]+)"/.exec(renderMarkdown("## Strom & Spannung"))![1];
      expect(id).toBe("strom-spannung");
    });

    test("zweimal derselbe Titel gibt zwei verschiedene Anker", () => {
      const html = renderMarkdown("## Aufbau\n\n## Aufbau");
      expect(html).toContain('id="aufbau"');
      expect(html).toContain('id="aufbau-2"');
    });

    /**
     * Der Zähler darf nicht über zwei Dokumente hinweg weiterlaufen - sonst
     * bekäme das zweite Impressum des Tages „#kontakt-2".
     */
    test("der Zähler beginnt bei jedem Dokument von vorn", () => {
      renderMarkdown("## Aufbau");
      expect(renderMarkdown("## Aufbau")).toContain('id="aufbau"');
    });

    test("eine Überschrift ohne brauchbare Zeichen bekommt keine id", () => {
      expect(renderMarkdown("## ---")).not.toContain("id=");
    });
  });
});

/**
 * Regression: die erste Bildunterschrift, die je gerendert wurde, endete auf
 * „(zum Vergrössern anklicken)". Mit einer Titelregel ohne Klammern passte der
 * ganze Ausdruck nicht mehr, und das Bild kam als der getippte Text heraus –
 * ein stillschweigend verlorenes Bild.
 */
describe("eine Bildunterschrift darf Klammern enthalten", () => {
  test("das Bild bleibt ein Bild", () => {
    const html = renderMarkdown('![Aufbau](/a.png "Der Aufbau (zum Vergrössern anklicken)")');
    expect(html).toContain("<figure");
    expect(html).toContain("Der Aufbau (zum Vergrössern anklicken)");
  });

  test("und die Unterschrift endet trotzdem am Anführungszeichen", () => {
    const html = renderMarkdown('![a](/a.png "eins") und ![b](/b.png "zwei")');
    expect(html).toContain('title="eins"');
    expect(html).toContain('title="zwei"');
  });
});

describe("Bilder dürfen eine Grösse mitbringen", () => {
  const style = (md: string): string | null => {
    const found = /style="([^"]*)"/.exec(renderMarkdown(md));
    return found ? found[1]! : null;
  };

  test("Breite allein", () => {
    expect(style("![x](/a.png =400)")).toBe("max-width:min(400px,100%)");
    expect(style("![x](/a.png =400x)")).toBe("max-width:min(400px,100%)");
  });

  test("Höhe allein", () => {
    expect(style("![x](/a.png =x300)")).toBe("max-height:300px");
  });

  test("beides", () => {
    expect(style("![x](/a.png =200x400)")).toBe(
      "max-width:min(200px,100%);max-height:400px",
    );
  });

  /**
   * Beides ist eine Obergrenze, kein Zerren. Ein verzerrter Screenshot ist nie
   * gemeint gewesen, und anders als ein zu klein geratenes Bild sieht man ihm
   * den Fehler nicht an.
   */
  test("es ist eine Schranke, keine feste Grösse", () => {
    const html = renderMarkdown("![x](/a.png =200x400)");
    expect(html).not.toContain("width:200px;");
    expect(html).not.toContain("height:400px;");
    expect(html).toContain("max-width");
    expect(html).toContain("max-height");
    // h-auto bleibt in der Klasse: das Seitenverhältnis entscheidet die Datei.
    expect(html).toContain("h-auto");
  });

  /**
   * Ohne das `min(…,100%)` schlüge das Inline-Mass die Klasse `max-w-full`,
   * und ein 600px breiter Screenshot hinge auf einem Telefon über den Rand -
   * genau das, wogegen die Klasse da war.
   */
  test("auf einem schmalen Schirm bleibt es beschnitten", () => {
    expect(style("![x](/a.png =900)")).toContain("100%");
  });

  test("mit Unterschrift zusammen, und die Figur umschliesst das Bild", () => {
    const html = renderMarkdown('![x](/a.png =400 "Die Unterschrift")');
    expect(html).toStartWith("<figure");
    expect(html).toContain("w-fit");
    expect(html).toContain("max-width:min(400px,100%)");
    expect(html).toContain("Die Unterschrift");
  });

  test("auch mitten im Satz", () => {
    const html = renderMarkdown("Ein ![x](/a.png =120) Satz.");
    expect(html).toStartWith("<p");
    expect(html).toContain("max-width:min(120px,100%)");
  });

  test("ohne Angabe steht kein style da", () => {
    expect(style("![x](/a.png)")).toBeNull();
  });

  /** Ein Link hat keine Grösse; die Angabe wird verworfen, nicht gedruckt. */
  test("an einem Link bedeutet sie nichts", () => {
    const html = renderMarkdown("[Ziel](/ziel =400)");
    expect(html).toContain('href="/ziel"');
    expect(html).not.toContain("400");
  });

  /**
   * Das `style`-Attribut ist die einzige Stelle in dieser Datei, an der
   * escapter Text noch gefährlich wäre: escapeHtml lässt Klammern und
   * Doppelpunkte stehen, und CSS ist eine Sprache. Deshalb wird die Angabe aus
   * Ziffern neu gebaut und nie durchgereicht.
   */
  test("nichts ausser Ziffern kommt in das style-Attribut", () => {
    // Die erlaubte Form, vollständig: mehr kann dort nicht stehen.
    const ERLAUBT = /^(max-width:min\(\d{1,4}px,100%\))?;?(max-height:\d{1,4}px)?$/;

    for (const böse of [
      "![x](/a.png =400;background:url(javascript:alert(1)))",
      "![x](/a.png =400)all:initial)",
      "![x](/a.png =expression(alert(1)))",
      "![x](/a.png =4e3)",
      "![x](/a.png =-400)",
      "![x](/a.png =400\u0022 onload=\u0022alert(1))",
    ]) {
      const html = renderMarkdown(böse);
      for (const [, wert] of html.matchAll(/style="([^"]*)"/g)) {
        expect(wert).toMatch(ERLAUBT);
      }
      /*
       * Und nichts davon ist in irgendein Tag geraten. Der Rest darf sehr wohl
       * als Text im Absatz stehen - `=400)all:initial)` etwa ergibt ein
       * gültiges Bild und danach vier Zeichen Text, was genau richtig ist.
       * Gefährlich wäre nur, was innerhalb der spitzen Klammern landet.
       */
      for (const [tag] of html.matchAll(/<[^>]*>/g)) {
        expect(tag).not.toContain("javascript:");
        expect(tag).not.toContain("expression(");
        expect(tag).not.toContain("onload");
        expect(tag).not.toContain("background");
      }
    }
  });

  /** Eine unverständliche Angabe bleibt sichtbar Text, statt still zu wirken. */
  test("was nicht als Grösse taugt, macht kein Bild", () => {
    expect(renderMarkdown("![x](/a.png =abc)")).not.toContain("<img");
  });
});
