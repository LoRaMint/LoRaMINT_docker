import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// config.ts throws on a missing TTN_APP_KEY at import time and services/uploads
// reaches it, so the variable has to be in place before the module is loaded -
// which is why the import below is dynamic. A static one would be hoisted above
// this line and the assignment would come too late.
process.env.TTN_APP_KEY ??= "integration-test";
const {
  listFiles,
  listVisibleFiles,
  storeFile,
  deleteFile,
  renameFile,
  setHidden,
  setNote,
} = await import("./uploads");

/*
 * A real directory, because that is the thing under test: the point of
 * services/uploads.ts is what it does to a file system, and a mocked one would
 * only confirm that the mock behaves as expected.
 *
 * Setting UPLOAD_DIR in `beforeAll` - after the module above has already been
 * imported - works only because config.ts resolves the path inside a getter on
 * every call. Were it captured while the module was first evaluated, everything
 * here would write into packages/api/uploads instead, and the tests would pass
 * while doing it.
 */
let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "loramint-uploads-"));
  Bun.env.UPLOAD_DIR = dir;
});

afterAll(async () => {
  delete Bun.env.UPLOAD_DIR;
  await rm(dir, { recursive: true, force: true });
});

/** Empties the directory between tests without replacing it. */
beforeEach(async () => {
  for (const entry of await readdir(dir)) {
    await rm(join(dir, entry), { force: true });
  }
});

const datei = (name: string, inhalt = "x") =>
  new File([inhalt], name, { type: "application/octet-stream" });

describe("speichern", () => {
  test("eine Datei landet unter ihrem bereinigten Namen", async () => {
    const result = await storeFile(datei("Grüße.pdf"), { replace: false });
    expect(result).toEqual({ ok: true, name: "gruesse.pdf" });

    const liste = await listFiles();
    expect(liste).toHaveLength(1);
    expect(liste[0]!.name).toBe("gruesse.pdf");
    expect(liste[0]!.bytes).toBe(1);
    expect(liste[0]!.hidden).toBe(false);
  });

  test("eine unerlaubte Endung kommt gar nicht erst an", async () => {
    const result = await storeFile(datei("seite.html"), { replace: false });
    expect(result.ok).toBe(false);
    expect(await listFiles()).toHaveLength(0);
  });

  test("eine leere Datei wird abgelehnt", async () => {
    const result = await storeFile(new File([], "leer.py"), { replace: false });
    expect(result.ok).toBe(false);
  });

  test("zu gross wird abgelehnt, und nichts bleibt liegen", async () => {
    Bun.env.UPLOAD_MAX_BYTES = "10";
    const result = await storeFile(datei("gross.py", "x".repeat(50)), { replace: false });
    delete Bun.env.UPLOAD_MAX_BYTES;

    expect(result.ok).toBe(false);
    expect("error" in result && result.error).toContain("zu gross");
    expect(await readdir(dir)).toHaveLength(0);
  });

  /**
   * The name is the public address and gets typed into the page by hand, so a
   * silent rename would leave the text pointing at the file it replaced.
   */
  test("ein vergebener Name wird abgelehnt und ein freier vorgeschlagen", async () => {
    await storeFile(datei("bild.png"), { replace: false });
    const zweite = await storeFile(datei("bild.png"), { replace: false });

    expect(zweite.ok).toBe(false);
    expect("error" in zweite && zweite.error).toContain("bild-2.png");
    expect(await listFiles()).toHaveLength(1);
  });

  test("mit ausdrücklichem Ersetzen geht es doch", async () => {
    await storeFile(datei("bild.png", "alt"), { replace: false });
    const zweite = await storeFile(datei("bild.png", "viel neuer"), { replace: true });

    expect(zweite.ok).toBe(true);
    const liste = await listFiles();
    expect(liste).toHaveLength(1);
    expect(liste[0]!.bytes).toBe("viel neuer".length);
  });
});

describe("was die Liste zeigt", () => {
  /**
   * The listing and the download route share one rule, so anything the route
   * would refuse is invisible here too - including a file copied into the volume
   * by hand, which is the case worth being sure about.
   */
  test("eine von Hand hineingelegte evil.html taucht nicht auf", async () => {
    await writeFile(join(dir, "evil.html"), "<script>alert(1)</script>");
    expect(await listFiles()).toHaveLength(0);
  });

  test("Buchhaltungsdateien ebenso wenig", async () => {
    await writeFile(join(dir, ".hidden"), "irgendwas.py\n");
    await writeFile(join(dir, ".tmp-abcdef"), "halb");
    expect(await listFiles()).toHaveLength(0);
  });

  test("sortiert nach Namen", async () => {
    for (const name of ["c.py", "a.py", "b.py"]) {
      await storeFile(datei(name), { replace: false });
    }
    expect((await listFiles()).map((f) => f.name)).toEqual(["a.py", "b.py", "c.py"]);
  });

  test("ein leeres Verzeichnis ist kein Fehler", async () => {
    expect(await listFiles()).toEqual([]);
  });
});

describe("ausblenden", () => {
  test("ausgeblendet heisst: nicht in der öffentlichen Liste", async () => {
    await storeFile(datei("bild.png"), { replace: false });
    await storeFile(datei("blatt.pdf"), { replace: false });

    expect(await setHidden("bild.png", true)).toEqual({ ok: true, name: "bild.png" });

    expect((await listVisibleFiles()).map((f) => f.name)).toEqual(["blatt.pdf"]);
    // In der Verwaltung bleibt sie sichtbar, nur eben als ausgeblendet markiert.
    expect((await listFiles()).find((f) => f.name === "bild.png")?.hidden).toBe(true);
  });

  test("und lässt sich zurücknehmen", async () => {
    await storeFile(datei("bild.png"), { replace: false });
    await setHidden("bild.png", true);
    await setHidden("bild.png", false);
    expect(await listVisibleFiles()).toHaveLength(1);
  });

  /** Der Merkposten überlebt das Löschen nicht - sonst käme die Datei später versteckt zurück. */
  test("beim Löschen verschwindet auch der Merkposten", async () => {
    await storeFile(datei("bild.png"), { replace: false });
    await setHidden("bild.png", true);
    await deleteFile("bild.png");

    await storeFile(datei("bild.png"), { replace: false });
    expect((await listFiles())[0]!.hidden).toBe(false);
  });

  test("ein unmöglicher Name wird gar nicht erst gemerkt", async () => {
    expect((await setHidden("../x.py", true)).ok).toBe(false);
  });
});

describe("löschen", () => {
  test("die Datei ist danach weg", async () => {
    await storeFile(datei("weg.py"), { replace: false });
    expect(await deleteFile("weg.py")).toEqual({ ok: true, name: "weg.py" });
    expect(await listFiles()).toHaveLength(0);
  });

  test("was es nicht gibt, ergibt eine Meldung statt eines Absturzes", async () => {
    const result = await deleteFile("gibtsnicht.py");
    expect(result.ok).toBe(false);
  });

  test("ein Name mit .. kommt nicht bis zum Dateisystem", async () => {
    const result = await deleteFile("../../etc/passwd");
    expect(result.ok).toBe(false);
    expect("error" in result && result.error).toContain("gibt es hier nicht");
  });
});

describe("Hinweise", () => {
  test("ein Hinweis steht danach an der Datei", async () => {
    await storeFile(datei("blatt.pdf"), { replace: false });
    const result = await setNote("blatt.pdf", "Quelle: [Adafruit](https://adafruit.com)");

    expect(result.ok).toBe(true);
    const [file] = await listFiles();
    expect(file?.note).toBe("Quelle: [Adafruit](https://adafruit.com)");
  });

  test("ohne Hinweis ist das Feld leer, nicht undefined", async () => {
    await storeFile(datei("blatt.pdf"), { replace: false });
    const [file] = await listFiles();
    expect(file?.note).toBe("");
  });

  test("Zeilenumbrüche werden zu Leerzeichen, damit eine Zeile eine Zeile bleibt", async () => {
    await storeFile(datei("blatt.pdf"), { replace: false });
    await setNote("blatt.pdf", "  erste Zeile\n\nzweite   Zeile  ");

    const [file] = await listFiles();
    expect(file?.note).toBe("erste Zeile zweite Zeile");
  });

  test("ein leerer Hinweis entfernt ihn", async () => {
    await storeFile(datei("blatt.pdf"), { replace: false });
    await setNote("blatt.pdf", "steht hier");
    await setNote("blatt.pdf", "   ");

    const [file] = await listFiles();
    expect(file?.note).toBe("");
  });

  test("ein zu langer Hinweis wird abgelehnt und ändert nichts", async () => {
    await storeFile(datei("blatt.pdf"), { replace: false });
    await setNote("blatt.pdf", "kurz");
    const result = await setNote("blatt.pdf", "x".repeat(301));

    expect(result.ok).toBe(false);
    const [file] = await listFiles();
    expect(file?.note).toBe("kurz");
  });

  test("zu einer Datei, die es nicht gibt, lässt sich nichts notieren", async () => {
    // Sonst läge der Satz für immer in .notes und hinge sich an die nächste
    // Datei, die zufällig so heisst.
    const result = await setNote("gibtsnicht.pdf", "irgendwas");
    expect(result.ok).toBe(false);
  });

  test("mit der Datei geht auch ihr Hinweis", async () => {
    await storeFile(datei("blatt.pdf"), { replace: false });
    await setNote("blatt.pdf", "Quelle von irgendwo");
    await deleteFile("blatt.pdf");
    await storeFile(datei("blatt.pdf"), { replace: false });

    const [file] = await listFiles();
    expect(file?.note).toBe("");
  });

  test("die Ablage ist keine Datei, die selbst gelistet oder ausgeliefert wird", async () => {
    await storeFile(datei("blatt.pdf"), { replace: false });
    await setNote("blatt.pdf", "steht hier");

    expect(await readdir(dir)).toContain(".notes");
    expect((await listFiles()).map((f) => f.name)).toEqual(["blatt.pdf"]);
  });
});

describe("mehrere auf einmal", () => {
  test("nacheinander gespeichert landen alle, jede unter ihrem Namen", async () => {
    for (const name of ["eins.py", "zwei.py", "drei.py"]) {
      expect((await storeFile(datei(name), { replace: false })).ok).toBe(true);
    }
    expect((await listFiles()).map((f) => f.name)).toEqual([
      "drei.py",
      "eins.py",
      "zwei.py",
    ]);
  });

  test("eine abgelehnte hält die folgenden nicht auf", async () => {
    // Was die Route zusagt: jede Datei wird für sich beurteilt. Ein einziger
    // schon vergebener Name darf einen Stapel von zehn nicht scheitern lassen.
    await storeFile(datei("eins.py"), { replace: false });

    const results = [];
    for (const name of ["eins.py", "zwei.py"]) {
      results.push(await storeFile(datei(name), { replace: false }));
    }

    expect(results.map((r) => r.ok)).toEqual([false, true]);
    expect((await listFiles()).map((f) => f.name)).toEqual(["eins.py", "zwei.py"]);
  });
});

describe("umbenennen", () => {
  test("die Datei liegt danach unter dem neuen Namen und nur unter dem", async () => {
    await storeFile(datei("blatt.pdf", "inhalt"), { replace: false });
    const result = await renameFile("blatt.pdf", "arbeitsblatt-3.pdf");

    expect(result).toEqual({ ok: true, name: "arbeitsblatt-3.pdf" });
    expect((await listFiles()).map((f) => f.name)).toEqual(["arbeitsblatt-3.pdf"]);
    expect(await Bun.file(join(dir, "arbeitsblatt-3.pdf")).text()).toBe("inhalt");
  });

  test("eine vorhandene Datei wird nicht überschrieben", async () => {
    await storeFile(datei("eins.pdf", "eins"), { replace: false });
    await storeFile(datei("zwei.pdf", "zwei"), { replace: false });

    const result = await renameFile("eins.pdf", "zwei.pdf");

    expect(result.ok).toBe(false);
    // Und zwar wirklich nicht: der Inhalt der anderen Datei steht noch.
    expect(await Bun.file(join(dir, "zwei.pdf")).text()).toBe("zwei");
    expect((await listFiles()).map((f) => f.name)).toEqual(["eins.pdf", "zwei.pdf"]);
  });

  test("die Absage nennt einen freien Namen", async () => {
    await storeFile(datei("eins.pdf"), { replace: false });
    await storeFile(datei("zwei.pdf"), { replace: false });

    const result = await renameFile("eins.pdf", "zwei.pdf");
    expect(result.ok === false && result.error).toContain("zwei-2.pdf");
  });

  test("Hinweis und Ausgeblendet ziehen mit um", async () => {
    await storeFile(datei("bild.png"), { replace: false });
    await setNote("bild.png", "Quelle: irgendwo");
    await setHidden("bild.png", true);

    await renameFile("bild.png", "aufbau.png");

    const [file] = await listFiles();
    expect(file?.name).toBe("aufbau.png");
    expect(file?.note).toBe("Quelle: irgendwo");
    expect(file?.hidden).toBe(true);
    // Sonst erschiene das Bild beim Umbenennen plötzlich in der Liste.
    expect(await listVisibleFiles()).toEqual([]);
  });

  test("eine Datei, die es nicht gibt, lässt sich nicht umbenennen", async () => {
    expect((await renameFile("gibtsnicht.pdf", "egal.pdf")).ok).toBe(false);
  });

  test("derselbe Name ist keine Umbenennung", async () => {
    await storeFile(datei("blatt.pdf"), { replace: false });
    expect((await renameFile("blatt.pdf", "blatt.pdf")).ok).toBe(false);
  });

  test("aus dem Verzeichnis heraus führt kein Name", async () => {
    // Ein Pfad wird nicht abgelehnt, sondern auf sein letztes Segment
    // eingedampft – genau wie beim Hochladen. Die Datei bleibt also im
    // Verzeichnis, sie heisst nur anders als getippt.
    await storeFile(datei("blatt.pdf"), { replace: false });
    const result = await renameFile("blatt.pdf", "../entwischt.pdf");

    expect(result).toEqual({ ok: true, name: "entwischt.pdf" });
    expect((await listFiles()).map((f) => f.name)).toEqual(["entwischt.pdf"]);
    expect(await readdir(dir)).toEqual(["entwischt.pdf"]);
  });
});
