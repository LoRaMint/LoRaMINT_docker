import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, writeFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// config.ts throws on a missing TTN_APP_KEY at import time and services/uploads
// reaches it, so the variable has to be in place before the module is loaded -
// which is why the import below is dynamic. A static one would be hoisted above
// this line and the assignment would come too late.
process.env.TTN_APP_KEY ??= "integration-test";
const {
  createFolder,
  deleteFile,
  deleteFolder,
  listFiles,
  listFolders,
  listVisibleFiles,
  moveFile,
  releasedUnder,
  renameFile,
  renameFolder,
  resolveInUploads,
  setNote,
  setReleased,
  storeFile,
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
    await rm(join(dir, entry), { recursive: true, force: true });
  }
});

const datei = (name: string, inhalt = "x") =>
  new File([inhalt], name, { type: "application/octet-stream" });

/** Short for the common case: into the root folder, no replacing. */
const speichere = (name: string, inhalt = "x", folder = "") =>
  storeFile(datei(name, inhalt), { replace: false, folder });

describe("speichern", () => {
  test("eine Datei landet unter ihrem bereinigten Namen", async () => {
    const result = await speichere("Grüße.pdf");
    expect(result).toEqual({ ok: true, path: "gruesse.pdf" });

    const liste = await listFiles();
    expect(liste).toHaveLength(1);
    expect(liste[0]!.name).toBe("gruesse.pdf");
    expect(liste[0]!.folder).toBe("");
    expect(liste[0]!.bytes).toBe(1);
    // Die Vorgabe hat sich umgedreht: nichts erscheint ungefragt öffentlich.
    expect(liste[0]!.released).toBe(false);
  });

  test("eine unerlaubte Endung kommt gar nicht erst an", async () => {
    const result = await speichere("seite.html");
    expect(result.ok).toBe(false);
    expect(await listFiles()).toHaveLength(0);
  });

  test("eine leere Datei wird abgelehnt", async () => {
    const result = await storeFile(new File([], "leer.py"), {
      replace: false,
      folder: "",
    });
    expect(result.ok).toBe(false);
  });

  test("zu gross wird abgelehnt, und nichts bleibt liegen", async () => {
    Bun.env.UPLOAD_MAX_BYTES = "10";
    const result = await speichere("gross.py", "x".repeat(50));
    delete Bun.env.UPLOAD_MAX_BYTES;

    expect(result.ok).toBe(false);
    expect(await readdir(dir)).toEqual([]);
  });

  test("ein zweites Mal derselbe Name wird abgelehnt und nennt einen freien", async () => {
    await speichere("bild.png");
    const zweite = await speichere("bild.png");

    expect(zweite.ok).toBe(false);
    expect(zweite.ok === false && zweite.error).toContain("bild-2.png");
  });

  test("mit ausdrücklichem Ersetzen geht es doch", async () => {
    await speichere("bild.png", "alt");
    const zweite = await storeFile(datei("bild.png", "viel neuer"), {
      replace: true,
      folder: "",
    });

    expect(zweite.ok).toBe(true);
    const liste = await listFiles();
    expect(liste).toHaveLength(1);
    expect(liste[0]!.bytes).toBe("viel neuer".length);
  });

  test("in einen Ordner, mit dem Pfad als Adresse", async () => {
    await createFolder("", "bilder");
    const result = await speichere("aufbau.png", "x", "bilder");

    expect(result).toEqual({ ok: true, path: "bilder/aufbau.png" });
    const [file] = await listFiles();
    expect(file?.path).toBe("bilder/aufbau.png");
    expect(file?.folder).toBe("bilder");
    expect(file?.name).toBe("aufbau.png");
  });

  /** Derselbe Name in zwei Ordnern ist kein Konflikt - der Pfad ist die Adresse. */
  test("derselbe Name in zwei Ordnern geht", async () => {
    await createFolder("", "eins");
    await createFolder("", "zwei");
    expect((await speichere("bild.png", "x", "eins")).ok).toBe(true);
    expect((await speichere("bild.png", "x", "zwei")).ok).toBe(true);
    expect((await listFiles()).map((f) => f.path)).toEqual([
      "eins/bild.png",
      "zwei/bild.png",
    ]);
  });

  test("in einen unmöglichen Ordner nicht", async () => {
    expect((await speichere("x.py", "x", "../raus")).ok).toBe(false);
    expect((await speichere("x.py", "x", "/etc")).ok).toBe(false);
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
    await writeFile(join(dir, ".released"), "irgendwas.py\n");
    await writeFile(join(dir, ".tmp-abcdef"), "halb");
    expect(await listFiles()).toHaveLength(0);
  });

  /**
   * `readdir` reports the type of the entry itself, not of what it points at,
   * so a symlink is neither a file nor a directory and falls out without a rule
   * saying so. Worth a test, because it is the one way a path *inside* the
   * directory could reach outside it.
   */
  test("ein Symlink aus dem Verzeichnis heraus wird nicht gelistet", async () => {
    await symlink("/etc", join(dir, "raus"));
    await symlink("/etc/hosts", join(dir, "hosts.txt"));
    expect(await listFiles()).toHaveLength(0);
    expect(await listFolders()).toEqual([]);
  });

  test("sortiert nach Pfad, Ordner eingeschlossen", async () => {
    await createFolder("", "unter");
    for (const name of ["c.py", "a.py"]) await speichere(name);
    await speichere("b.py", "x", "unter");

    expect((await listFiles()).map((f) => f.path)).toEqual([
      "a.py",
      "c.py",
      "unter/b.py",
    ]);
  });

  test("ein leeres Verzeichnis ist kein Fehler", async () => {
    expect(await listFiles()).toEqual([]);
    expect(await listFolders()).toEqual([]);
  });
});

describe("freischalten", () => {
  test("ohne Freischaltung erscheint nichts auf der öffentlichen Seite", async () => {
    await speichere("bild.png");
    await speichere("blatt.pdf");
    expect(await listVisibleFiles()).toEqual([]);
  });

  test("freigeschaltet heisst: in der öffentlichen Liste", async () => {
    await speichere("bild.png");
    await speichere("blatt.pdf");

    expect(await setReleased("blatt.pdf", true)).toEqual({
      ok: true,
      path: "blatt.pdf",
    });

    expect((await listVisibleFiles()).map((f) => f.name)).toEqual(["blatt.pdf"]);
    expect((await listFiles()).find((f) => f.name === "bild.png")?.released).toBe(false);
  });

  test("und lässt sich zurücknehmen", async () => {
    await speichere("bild.png");
    await setReleased("bild.png", true);
    await setReleased("bild.png", false);
    expect(await listVisibleFiles()).toHaveLength(0);
  });

  /** Der Merkposten überlebt das Löschen nicht - sonst käme die Datei später freigeschaltet zurück. */
  test("beim Löschen verschwindet auch der Merkposten", async () => {
    await speichere("bild.png");
    await setReleased("bild.png", true);
    await deleteFile("bild.png");

    await speichere("bild.png");
    expect((await listFiles())[0]!.released).toBe(false);
  });

  test("ein unmöglicher Pfad wird gar nicht erst gemerkt", async () => {
    expect((await setReleased("../x.py", true)).ok).toBe(false);
  });

  /**
   * Was das Paket packen darf. Die Downloadseite ist öffentlich, also darf der
   * Umweg über die ZIP die Freischaltung nicht aushebeln.
   */
  test("releasedUnder nimmt nur Freigeschaltetes, Unterordner eingeschlossen", async () => {
    await createFolder("", "kurs");
    await createFolder("kurs", "tag-1");
    await speichere("plan.pdf", "x", "kurs");
    await speichere("geheim.pdf", "x", "kurs");
    await speichere("blatt.pdf", "x", "kurs/tag-1");

    await setReleased("kurs/plan.pdf", true);
    await setReleased("kurs/tag-1/blatt.pdf", true);

    expect((await releasedUnder("kurs")).map((f) => f.path)).toEqual([
      "kurs/plan.pdf",
      "kurs/tag-1/blatt.pdf",
    ]);
    expect((await releasedUnder("kurs/tag-1")).map((f) => f.path)).toEqual([
      "kurs/tag-1/blatt.pdf",
    ]);
  });
});

describe("löschen", () => {
  test("die Datei ist danach weg", async () => {
    await speichere("weg.py");
    expect(await deleteFile("weg.py")).toEqual({ ok: true, path: "weg.py" });
    expect(await listFiles()).toHaveLength(0);
  });

  test("was es nicht gibt, ergibt eine Meldung statt eines Absturzes", async () => {
    expect((await deleteFile("gibtsnicht.py")).ok).toBe(false);
  });

  test("ein Pfad mit .. kommt nicht bis zum Dateisystem", async () => {
    const result = await deleteFile("../../etc/passwd");
    expect(result.ok).toBe(false);
    expect("error" in result && result.error).toContain("gibt es hier nicht");
  });
});

describe("Hinweise", () => {
  test("ein Hinweis steht danach an der Datei", async () => {
    await speichere("blatt.pdf");
    const result = await setNote("blatt.pdf", "Quelle: [Adafruit](https://adafruit.com)");

    expect(result.ok).toBe(true);
    const [file] = await listFiles();
    expect(file?.note).toBe("Quelle: [Adafruit](https://adafruit.com)");
  });

  test("ohne Hinweis ist das Feld leer, nicht undefined", async () => {
    await speichere("blatt.pdf");
    expect((await listFiles())[0]?.note).toBe("");
  });

  test("Zeilenumbrüche werden zu Leerzeichen, damit eine Zeile eine Zeile bleibt", async () => {
    await speichere("blatt.pdf");
    await setNote("blatt.pdf", "  erste Zeile\n\nzweite   Zeile  ");
    expect((await listFiles())[0]?.note).toBe("erste Zeile zweite Zeile");
  });

  test("ein leerer Hinweis entfernt ihn", async () => {
    await speichere("blatt.pdf");
    await setNote("blatt.pdf", "steht hier");
    await setNote("blatt.pdf", "   ");
    expect((await listFiles())[0]?.note).toBe("");
  });

  test("ein zu langer Hinweis wird abgelehnt und ändert nichts", async () => {
    await speichere("blatt.pdf");
    await setNote("blatt.pdf", "kurz");
    const result = await setNote("blatt.pdf", "x".repeat(301));

    expect(result.ok).toBe(false);
    expect((await listFiles())[0]?.note).toBe("kurz");
  });

  test("zu einer Datei, die es nicht gibt, lässt sich nichts notieren", async () => {
    // Sonst läge der Satz für immer in .notes und hinge sich an die nächste
    // Datei, die zufällig so heisst.
    expect((await setNote("gibtsnicht.pdf", "irgendwas")).ok).toBe(false);
  });

  test("mit der Datei geht auch ihr Hinweis", async () => {
    await speichere("blatt.pdf");
    await setNote("blatt.pdf", "Quelle von irgendwo");
    await deleteFile("blatt.pdf");
    await speichere("blatt.pdf");

    expect((await listFiles())[0]?.note).toBe("");
  });

  test("die Ablage ist keine Datei, die selbst gelistet oder ausgeliefert wird", async () => {
    await speichere("blatt.pdf");
    await setNote("blatt.pdf", "steht hier");

    expect(await readdir(dir)).toContain(".notes");
    expect((await listFiles()).map((f) => f.name)).toEqual(["blatt.pdf"]);
  });

  /** Die Buchhaltung liegt in der Wurzel und schlüsselt auf den ganzen Pfad. */
  test("auch für eine Datei im Unterordner", async () => {
    await createFolder("", "unter");
    await speichere("blatt.pdf", "x", "unter");
    await setNote("unter/blatt.pdf", "dazu");

    expect((await listFiles())[0]?.note).toBe("dazu");
    expect(await readdir(dir)).toContain(".notes");
  });
});

describe("mehrere auf einmal", () => {
  test("nacheinander gespeichert landen alle, jede unter ihrem Namen", async () => {
    for (const name of ["eins.py", "zwei.py", "drei.py"]) {
      expect((await speichere(name)).ok).toBe(true);
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
    await speichere("eins.py");

    const results = [];
    for (const name of ["eins.py", "zwei.py"]) results.push(await speichere(name));

    expect(results.map((r) => r.ok)).toEqual([false, true]);
    expect((await listFiles()).map((f) => f.name)).toEqual(["eins.py", "zwei.py"]);
  });
});

describe("umbenennen", () => {
  test("die Datei liegt danach unter dem neuen Namen und nur unter dem", async () => {
    await speichere("blatt.pdf", "inhalt");
    const result = await renameFile("blatt.pdf", "arbeitsblatt-3.pdf");

    expect(result).toEqual({ ok: true, path: "arbeitsblatt-3.pdf" });
    expect((await listFiles()).map((f) => f.name)).toEqual(["arbeitsblatt-3.pdf"]);
    expect(await Bun.file(join(dir, "arbeitsblatt-3.pdf")).text()).toBe("inhalt");
  });

  test("im Ordner bleibt sie im Ordner", async () => {
    await createFolder("", "unter");
    await speichere("blatt.pdf", "x", "unter");
    const result = await renameFile("unter/blatt.pdf", "neu.pdf");

    expect(result).toEqual({ ok: true, path: "unter/neu.pdf" });
  });

  test("eine vorhandene Datei wird nicht überschrieben", async () => {
    await speichere("eins.pdf", "eins");
    await speichere("zwei.pdf", "zwei");

    const result = await renameFile("eins.pdf", "zwei.pdf");

    expect(result.ok).toBe(false);
    // Und zwar wirklich nicht: der Inhalt der anderen Datei steht noch.
    expect(await Bun.file(join(dir, "zwei.pdf")).text()).toBe("zwei");
    expect((await listFiles()).map((f) => f.name)).toEqual(["eins.pdf", "zwei.pdf"]);
  });

  test("die Absage nennt einen freien Namen", async () => {
    await speichere("eins.pdf");
    await speichere("zwei.pdf");

    const result = await renameFile("eins.pdf", "zwei.pdf");
    expect(result.ok === false && result.error).toContain("zwei-2.pdf");
  });

  test("Hinweis und Freischaltung ziehen mit um", async () => {
    await speichere("bild.png");
    await setNote("bild.png", "Quelle: irgendwo");
    await setReleased("bild.png", true);

    await renameFile("bild.png", "aufbau.png");

    const [file] = await listFiles();
    expect(file?.name).toBe("aufbau.png");
    expect(file?.note).toBe("Quelle: irgendwo");
    expect(file?.released).toBe(true);
    // Sonst verschwände das Bild beim Umbenennen aus der öffentlichen Liste.
    expect((await listVisibleFiles()).map((f) => f.path)).toEqual(["aufbau.png"]);
  });

  test("eine Datei, die es nicht gibt, lässt sich nicht umbenennen", async () => {
    expect((await renameFile("gibtsnicht.pdf", "egal.pdf")).ok).toBe(false);
  });

  test("derselbe Name ist keine Umbenennung", async () => {
    await speichere("blatt.pdf");
    expect((await renameFile("blatt.pdf", "blatt.pdf")).ok).toBe(false);
  });

  test("aus dem Verzeichnis heraus führt kein Name", async () => {
    // Ein Pfad wird nicht abgelehnt, sondern auf sein letztes Segment
    // eingedampft – genau wie beim Hochladen. Die Datei bleibt also im
    // Verzeichnis, sie heisst nur anders als getippt.
    await speichere("blatt.pdf");
    const result = await renameFile("blatt.pdf", "../entwischt.pdf");

    expect(result).toEqual({ ok: true, path: "entwischt.pdf" });
    expect(await readdir(dir)).toEqual(["entwischt.pdf"]);
  });
});

describe("verschieben", () => {
  test("die Datei liegt danach im anderen Ordner", async () => {
    await createFolder("", "bilder");
    await speichere("aufbau.png", "inhalt");

    const result = await moveFile("aufbau.png", "bilder");

    expect(result).toEqual({ ok: true, path: "bilder/aufbau.png" });
    expect((await listFiles()).map((f) => f.path)).toEqual(["bilder/aufbau.png"]);
    expect(await Bun.file(join(dir, "bilder", "aufbau.png")).text()).toBe("inhalt");
  });

  test("und wieder zurück an die oberste Ebene", async () => {
    await createFolder("", "bilder");
    await speichere("aufbau.png", "x", "bilder");
    expect(await moveFile("bilder/aufbau.png", "")).toEqual({
      ok: true,
      path: "aufbau.png",
    });
  });

  test("Hinweis und Freischaltung ziehen mit um", async () => {
    await createFolder("", "bilder");
    await speichere("aufbau.png");
    await setNote("aufbau.png", "Quelle: irgendwo");
    await setReleased("aufbau.png", true);

    await moveFile("aufbau.png", "bilder");

    const [file] = await listFiles();
    expect(file?.note).toBe("Quelle: irgendwo");
    expect(file?.released).toBe(true);
  });

  test("in einen Ordner, den es nicht gibt, nicht", async () => {
    await speichere("x.py");
    expect((await moveFile("x.py", "gibtsnicht")).ok).toBe(false);
  });

  test("auf eine belegte Adresse wird nichts überschrieben", async () => {
    await createFolder("", "bilder");
    await speichere("bild.png", "oben");
    await speichere("bild.png", "unten", "bilder");

    expect((await moveFile("bild.png", "bilder")).ok).toBe(false);
    expect(await Bun.file(join(dir, "bilder", "bild.png")).text()).toBe("unten");
  });

  test("nach draussen führt kein Ziel", async () => {
    await speichere("x.py");
    for (const ziel of ["..", "../raus", "/etc"]) {
      expect((await moveFile("x.py", ziel)).ok).toBe(false);
    }
    expect(await readdir(dir)).toContain("x.py");
  });
});

describe("Ordner", () => {
  test("anlegen, verschachteln, auflisten", async () => {
    expect(await createFolder("", "kurs")).toEqual({ ok: true, path: "kurs" });
    expect(await createFolder("kurs", "tag-1")).toEqual({
      ok: true,
      path: "kurs/tag-1",
    });
    expect(await listFolders()).toEqual(["kurs", "kurs/tag-1"]);
  });

  test("der Name wird bereinigt wie ein Dateiname", async () => {
    expect(await createFolder("", "Arbeitsblätter 2026!")).toEqual({
      ok: true,
      path: "arbeitsblaetter-2026",
    });
  });

  test("zweimal derselbe Ordner wird abgelehnt", async () => {
    await createFolder("", "kurs");
    expect((await createFolder("", "kurs")).ok).toBe(false);
  });

  test("in einen Elternordner, den es nicht gibt, nicht", async () => {
    expect((await createFolder("gibtsnicht", "kurs")).ok).toBe(false);
  });

  /**
   * Ein getippter Name wird bereinigt, nicht abgelehnt - dieselbe Zusage wie
   * beim Hochladen und beim Umbenennen. Was zählt, ist: was dabei herauskommt,
   * liegt immer im Verzeichnis.
   */
  test("ein Name, der hinausführen soll, wird eingedampft statt befolgt", async () => {
    expect(await createFolder("", "../raus")).toEqual({ ok: true, path: "raus" });
    expect(await listFolders()).toEqual(["raus"]);

    // Und was gar nichts übrig lässt, wird abgelehnt statt geraten.
    expect((await createFolder("", "..")).ok).toBe(false);
    expect((await createFolder("", "...")).ok).toBe(false);
  });

  /**
   * Der Schrägstrich ist das eine Zeichen, das nicht zu einem Bindestrich
   * wird. Vorher hiess „esp32/lightsleep" ein Ordner namens
   * `esp32-lightsleep`, und die Meldung sagte trotzdem Erfolg.
   */
  test("ein Pfad legt die Ebenen nacheinander an", async () => {
    expect(await createFolder("", "esp32/lightsleep")).toEqual({
      ok: true,
      path: "esp32/lightsleep",
    });
    expect(await listFolders()).toEqual(["esp32", "esp32/lightsleep"]);
  });

  test("ein Pfad unter einem vorhandenen Ordner", async () => {
    await createFolder("", "kurs");
    expect(await createFolder("kurs", "tag-1/blaetter")).toEqual({
      ok: true,
      path: "kurs/tag-1/blaetter",
    });
    expect(await listFolders()).toEqual([
      "kurs",
      "kurs/tag-1",
      "kurs/tag-1/blaetter",
    ]);
  });

  /** Jede Ebene wird für sich bereinigt, wie ein einzelner Name. */
  test("die Ebenen eines Pfades werden einzeln bereinigt", async () => {
    expect(await createFolder("", "Arbeitsblätter 2026!/Tag 1")).toEqual({
      ok: true,
      path: "arbeitsblaetter-2026/tag-1",
    });
  });

  test("eine Zwischenebene darf schon dastehen, die letzte nicht", async () => {
    await createFolder("", "a/b");
    expect(await createFolder("", "a/c")).toEqual({ ok: true, path: "a/c" });
    expect((await createFolder("", "a/b")).ok).toBe(false);
  });

  test("ein Elternordner, der hinausführt, wird abgelehnt", async () => {
    for (const parent of ["..", "../raus", "/etc"]) {
      expect((await createFolder(parent, "kurs")).ok).toBe(false);
    }
    expect(await readdir(dir)).toEqual([]);
  });

  test("umbenennen nimmt den Inhalt und die Buchhaltung mit", async () => {
    await createFolder("", "kurs");
    await createFolder("kurs", "tag-1");
    await speichere("blatt.pdf", "inhalt", "kurs/tag-1");
    await setNote("kurs/tag-1/blatt.pdf", "dazu");
    await setReleased("kurs/tag-1/blatt.pdf", true);

    expect(await renameFolder("kurs", "workshop")).toEqual({
      ok: true,
      path: "workshop",
    });

    const [file] = await listFiles();
    expect(file?.path).toBe("workshop/tag-1/blatt.pdf");
    expect(file?.note).toBe("dazu");
    expect(file?.released).toBe(true);
    expect(await Bun.file(join(dir, "workshop", "tag-1", "blatt.pdf")).text()).toBe(
      "inhalt",
    );
  });

  test("auf einen vorhandenen Ordner wird nicht umbenannt", async () => {
    await createFolder("", "eins");
    await createFolder("", "zwei");
    expect((await renameFolder("eins", "zwei")).ok).toBe(false);
  });

  test("ein leerer Ordner lässt sich löschen", async () => {
    await createFolder("", "leer");
    expect(await deleteFolder("leer")).toEqual({ ok: true, path: "leer" });
    expect(await listFolders()).toEqual([]);
  });

  /** Ein Klick soll nicht ein Semester Material mitnehmen können. */
  test("ein Ordner mit Inhalt nicht, und die Absage sagt warum", async () => {
    await createFolder("", "voll");
    await speichere("x.py", "x", "voll");

    const result = await deleteFolder("voll");
    expect(result.ok).toBe(false);
    expect("error" in result && result.error).toContain("nicht leer");
    expect(await listFiles()).toHaveLength(1);
  });

  test("auch nicht, wenn nur ein Unterordner darin liegt", async () => {
    await createFolder("", "voll");
    await createFolder("voll", "drin");
    expect((await deleteFolder("voll")).ok).toBe(false);
  });

  test("nach draussen löscht nichts", async () => {
    expect((await deleteFolder("../..")).ok).toBe(false);
  });
});

/**
 * The second of the two bolts on the download route.
 *
 * `isSafePath` decides by shape and is tested in lib/uploads.test.ts; this one
 * decides by asking where the string actually points. They fail differently,
 * which is the whole reason there are two.
 */
describe("resolveInUploads", () => {
  test("ein gewöhnlicher Pfad ergibt einen Ort im Verzeichnis", () => {
    const resolved = resolveInUploads("bilder/aufbau.png");
    expect(resolved).toStartWith(dir);
    expect(resolved).toEndWith("/bilder/aufbau.png");
  });

  test("alles, was herausführt, ergibt null", () => {
    for (const pfad of [
      "..",
      "../passwd",
      "../../etc/passwd",
      "/etc/passwd",
      "bilder/../../passwd",
      "./passwd",
      "bilder//aufbau.png",
      "bilder/",
      "/bilder/x.png",
      "%2e%2e/passwd",
      "..%2fpasswd",
      "../passwd",
      "",
    ]) {
      expect(resolveInUploads(pfad)).toBeNull();
    }
  });

  /**
   * Der Grund für das Trennzeichen im Vergleich: ohne es wäre `/tmp/x` ein
   * Präfix von `/tmp/x-alt`, und ein Nachbarverzeichnis gälte als „innen".
   */
  test("ein Nachbarverzeichnis mit ähnlichem Namen zählt nicht als innen", () => {
    Bun.env.UPLOAD_DIR = `${dir}-alt`;
    const fremd = resolveInUploads("x.png");
    Bun.env.UPLOAD_DIR = dir;
    expect(fremd).toStartWith(`${dir}-alt`);
    expect(fremd).not.toBe(`${dir}/x.png`);
  });
});

/**
 * Nothing here should ever create a directory outside the upload root. The
 * checks above say each call refuses; this says the file system agrees.
 */
describe("nach dem Ganzen liegt nichts daneben", () => {
  test("keine Spur im Elternverzeichnis", async () => {
    const vorher = await readdir(join(dir, ".."));
    await createFolder("", "../raus");
    await speichere("x.py", "x", "../raus");
    await mkdir(join(dir, "ordner"), { recursive: true });
    await moveFile("x.py", "../raus");
    expect(await readdir(join(dir, ".."))).toEqual(vorher);
  });
});
