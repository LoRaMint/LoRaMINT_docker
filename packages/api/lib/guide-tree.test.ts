import { describe, expect, test } from "bun:test";
import {
  canMove,
  depthOf,
  descendantsOf,
  flatten,
  MAX_DEPTH,
  normaliseSlug,
  pathOf,
  treeOf,
  type GuideRow,
} from "./guide-tree";

/** A row, written short: id, parent, and a position that defaults to the order. */
const row = (
  id: string,
  parentId: string | null = null,
  position = 0,
  slug = id,
): GuideRow => ({ id, parentId, slug, position });

/** Convenience: the slug, or null when the input was refused. */
const slug = (raw: string): string | null => {
  const result = normaliseSlug(raw);
  return "slug" in result ? result.slug : null;
};

describe("aus einem Titel wird eine Adresse", () => {
  test("gewöhnliche Überschriften", () => {
    expect(slug("Workshop")).toBe("workshop");
    expect(slug("Tag 3: Der Sensor")).toBe("tag-3-der-sensor");
    expect(slug("ESP32 / Thonny")).toBe("esp32-thonny");
  });

  /** Vor der allgemeinen Ersetzung, sonst wird aus „Übung" ein „-bung". */
  test("Umlaute werden zu Digraphen, nicht zu Bindestrichen", () => {
    expect(slug("Übung")).toBe("uebung");
    expect(slug("Löten für Anfänger")).toBe("loeten-fuer-anfaenger");
    expect(slug("Straße")).toBe("strasse");
  });

  test("Doppel-Bindestriche werden eingefaltet, Ränder abgeschnitten", () => {
    expect(slug("  --- Tag   3 --- ")).toBe("tag-3");
    expect(slug("!!!Achtung!!!")).toBe("achtung");
  });

  test("was keine Adresse ergibt, wird abgelehnt statt geraten", () => {
    expect(slug("")).toBeNull();
    expect(slug("!!!")).toBeNull();
    expect(slug("ab")).toBeNull();
    expect(slug("---")).toBeNull();
  });

  test("die Ablehnung sagt, woran es lag", () => {
    const kurz = normaliseSlug("ab");
    expect("error" in kurz && kurz.error).toContain("zu kurz");
  });

  test("und nichts Endloses", () => {
    const lang = slug("a".repeat(200));
    expect(lang).toHaveLength(64);
  });

  /** Das Abschneiden darf keinen Bindestrich am Ende hinterlassen. */
  test("abgeschnitten wird nie mitten auf einem Bindestrich", () => {
    const geschnitten = slug(`${"a".repeat(63)} b`);
    expect(geschnitten).not.toEndWith("-");
  });
});

describe("der Pfad einer Seite", () => {
  const alle = [
    row("w", null, 0, "workshop"),
    row("t3", "w", 2, "tag-3"),
    row("t1", "w", 0, "tag-1"),
    row("d", "t3", 0, "details"),
  ];

  test("führt von der Wurzel bis zur Seite", () => {
    expect(pathOf(alle[1]!, alle)).toEqual(["workshop", "tag-3"]);
    expect(pathOf(alle[3]!, alle)).toEqual(["workshop", "tag-3", "details"]);
    expect(pathOf(alle[0]!, alle)).toEqual(["workshop"]);
  });

  test("die Tiefe ist die Länge des Pfads", () => {
    expect(depthOf(alle[0]!, alle)).toBe(1);
    expect(depthOf(alle[3]!, alle)).toBe(3);
  });

  /**
   * Eine Kette, die ins Nichts führt, ist kein Pfad. Der Elternteil kann ein
   * Entwurf sein, den der Aufrufer herausgefiltert hat.
   */
  test("ein fehlender Elternteil ergibt keinen Pfad", () => {
    const verwaist = [row("x", "gibtsnicht")];
    expect(pathOf(verwaist[0]!, verwaist)).toEqual([]);
  });

  /**
   * Ein Ring kann nur von Hand entstehen - über die SQL-Konsole etwa. Die
   * Antwort darauf ist „kein Pfad", nicht „läuft bis der Stack voll ist".
   */
  test("ein Ring läuft nicht endlos, er ergibt nichts", () => {
    const ring = [row("a", "b"), row("b", "a")];
    expect(pathOf(ring[0]!, ring)).toEqual([]);
  });
});

describe("verschieben", () => {
  /*
   *  w
   *  ├─ t1
   *  └─ t3
   *     └─ d
   *  z   (ein zweites Thema)
   */
  const alle = [
    row("w", null, 0, "workshop"),
    row("t1", "w", 0, "tag-1"),
    row("t3", "w", 1, "tag-3"),
    row("d", "t3", 0, "details"),
    row("z", null, 1, "zweites"),
  ];
  const von = (id: string) => alle.find((r) => r.id === id)!;

  test("in ein anderes Thema geht", () => {
    expect(canMove(von("t3"), "z", alle).ok).toBe(true);
  });

  test("zur Wurzel geht immer", () => {
    expect(canMove(von("d"), null, alle).ok).toBe(true);
  });

  /** Der Fall, für den diese Datei existiert. */
  test("unter sich selbst nicht", () => {
    const antwort = canMove(von("w"), "w", alle);
    expect(antwort.ok).toBe(false);
    expect(!antwort.ok && antwort.error).toContain("unter sich selbst");
  });

  test("in den eigenen Teilbaum nicht – auch nicht zwei Ebenen tiefer", () => {
    for (const ziel of ["t3", "d"]) {
      const antwort = canMove(von("w"), ziel, alle);
      expect(antwort.ok).toBe(false);
      expect(!antwort.ok && antwort.error).toContain("Ring");
    }
  });

  test("unter eine Seite, die es nicht gibt, nicht", () => {
    expect(canMove(von("t1"), "gibtsnicht", alle).ok).toBe(false);
  });

  /**
   * Nicht wo die Seite landet zählt, sondern wo ihre unterste Unterseite
   * landet - sie kommt ja mit.
   */
  test("nicht tiefer als MAX_DEPTH, den mitgebrachten Teilbaum eingerechnet", () => {
    // Eine Kette bis an die Grenze: e1..e4 sind Ebene 1 bis 4.
    const kette: GuideRow[] = [
      row("e1", null, 0),
      row("e2", "e1", 0),
      row("e3", "e2", 0),
      row("e4", "e3", 0),
      // Ein Ast von zwei Ebenen, der noch frei steht.
      row("ast", null, 1),
      row("astkind", "ast", 0),
    ];

    // „ast" allein passt unter e4: das wäre Ebene 5.
    const nurAst = kette.filter((r) => r.id !== "astkind");
    expect(canMove(nurAst.find((r) => r.id === "ast")!, "e4", nurAst).ok).toBe(true);

    // Mit seinem Kind zusammen wären es sechs.
    const mitKind = canMove(kette[4]!, "e4", kette);
    expect(mitKind.ok).toBe(false);
    expect(!mitKind.ok && mitKind.error).toContain(String(MAX_DEPTH));
  });

  test("Nachfahren sind alle darunter, nicht nur die Kinder", () => {
    expect(descendantsOf(von("w"), alle).map((r) => r.id).sort()).toEqual([
      "d",
      "t1",
      "t3",
    ]);
    expect(descendantsOf(von("d"), alle)).toEqual([]);
  });

  /** Auch ein Ring in den Daten darf `descendantsOf` nicht aufhängen. */
  test("ein Ring hängt die Suche nach Nachfahren nicht auf", () => {
    const ring = [row("a", "b"), row("b", "a")];
    expect(descendantsOf(ring[0]!, ring).map((r) => r.id)).toEqual(["b", "a"]);
  });
});

describe("der Baum", () => {
  const alle = [
    row("t3", "w", 2, "tag-3"),
    row("z", null, 1, "zweites"),
    row("t1", "w", 0, "tag-1"),
    row("w", null, 0, "workshop"),
  ];

  test("wird nach position sortiert, auf jeder Ebene", () => {
    const baum = treeOf(alle);
    expect(baum.map((n) => n.id)).toEqual(["w", "z"]);
    expect(baum[0]!.children.map((n) => n.id)).toEqual(["t1", "t3"]);
  });

  /** Gleiche Position darf keine zufällige Reihenfolge ergeben. */
  test("bei gleicher Position entscheidet der Slug", () => {
    const gleich = [row("b", null, 0, "bravo"), row("a", null, 0, "alpha")];
    expect(treeOf(gleich).map((n) => n.slug)).toEqual(["alpha", "bravo"]);
  });

  /**
   * Ein Kind ohne Elternteil in der Liste wird fallen gelassen, nicht an die
   * Wurzel gehoben: sonst veröffentlichte eine Unterseite ihr Thema mit.
   */
  test("ein Kind ohne Elternteil erscheint nicht an der Wurzel", () => {
    const halb = [row("kind", "entwurf"), row("echt", null)];
    expect(treeOf(halb).map((n) => n.id)).toEqual(["echt"]);
  });

  test("flach gelegt kommt die Tiefe mit", () => {
    const flach = flatten(treeOf(alle));
    expect(flach.map((e) => [e.node.id, e.depth])).toEqual([
      ["w", 1],
      ["t1", 2],
      ["t3", 2],
      ["z", 1],
    ]);
  });
});
