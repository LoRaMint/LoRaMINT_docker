import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { unzipSync } from "fflate";
import { Hono } from "hono";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// config.ts throws on a missing TTN_APP_KEY at import time; the handler reaches
// it for the upload directory. Dynamic import for the same reason as in
// services/uploads.test.ts - a static one would be hoisted above this line.
process.env.TTN_APP_KEY ??= "integration-test";
const { downloadHandler, packetHandler, MAX_PACKET_BYTES } = await import("./downloads");

/*
 * A real directory and a real Hono app, because what is under test is the
 * *response*: which content type goes out, whether it is inline, whether a
 * hostile path gets anywhere, what is inside the ZIP. None of that is visible
 * from the function's return value alone.
 */
let dir: string;
const app = new Hono();
app.get("/downloads/*", downloadHandler);
app.get("/paket/*", packetHandler);

const get = (path: string, headers: Record<string, string> = {}) =>
  app.fetch(new Request(`http://localhost${path}`, { headers }));

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "loramint-downloads-"));
  Bun.env.UPLOAD_DIR = dir;

  await writeFile(join(dir, "blatt.pdf"), "%PDF-1.4 fake");
  await writeFile(join(dir, "messung.py"), "print('hallo')\n");
  await writeFile(join(dir, "bild.png"), "not really a png");
  // Placed by hand, the way a file could arrive in the volume without passing
  // through the upload path.
  await writeFile(join(dir, "evil.html"), "<script>alert(1)</script>");

  await mkdir(join(dir, "kurs", "tag-1"), { recursive: true });
  await writeFile(join(dir, "kurs", "plan.pdf"), "%PDF plan");
  await writeFile(join(dir, "kurs", "intern.pdf"), "%PDF intern");
  await writeFile(join(dir, "kurs", "tag-1", "blatt.pdf"), "%PDF tag 1");

  // Freigeschaltet ist nur, was hier steht - alles andere erscheint weder auf
  // der Downloadseite noch im Paket.
  await writeFile(
    join(dir, ".released"),
    "bild.png\nkurs/plan.pdf\nkurs/tag-1/blatt.pdf\n",
  );
});

afterAll(async () => {
  delete Bun.env.UPLOAD_DIR;
  await rm(dir, { recursive: true, force: true });
});

describe("was ausgeliefert wird", () => {
  test("ein PDF wird angezeigt, mit unserem Typ", async () => {
    const response = await get("/downloads/blatt.pdf");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Content-Disposition")).toBe("inline");
    expect(await response.text()).toContain("%PDF");
  });

  /** Quelltext im Browser anzuzeigen ist harmlos, aber nicht das, was jemand wollte. */
  test("eine Codedatei wird heruntergeladen, mit ihrem Namen", async () => {
    const response = await get("/downloads/messung.py");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="messung.py"',
    );
  });

  /** Neu: Unterordner sind jetzt möglich, statt konstruktiv ausgeschlossen. */
  test("eine Datei in einem Unterordner, unter ihrem Pfad", async () => {
    const response = await get("/downloads/kurs/tag-1/blatt.pdf");
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("%PDF tag 1");
  });

  /** Der Dateiname im Disposition-Header ist das letzte Segment, nicht der Pfad. */
  test("der angebotene Name ist der Dateiname, nicht der Pfad", async () => {
    await writeFile(join(dir, "kurs", "code.py"), "x = 1\n");
    const response = await get("/downloads/kurs/code.py");
    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="code.py"',
    );
  });

  /**
   * The header that closes the hole `serveStatic` would have left open: our type
   * is the only type, and a browser must not sniff the body and decide better.
   */
  test("nosniff steht auf jeder Antwort", async () => {
    for (const pfad of [
      "/downloads/blatt.pdf",
      "/downloads/messung.py",
      "/paket/kurs",
    ]) {
      const response = await get(pfad);
      expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    }
  });

  /**
   * „Nicht freigeschaltet" ist eine Frage der Darstellung, kein Zugriffsschutz -
   * sonst verschwände ein im Text eingebundenes Bild aus der Anleitung.
   */
  test("nicht freigeschaltete Dateien bleiben erreichbar", async () => {
    const response = await get("/downloads/kurs/intern.pdf");
    expect(response.status).toBe(200);
  });
});

describe("was nicht ausgeliefert wird", () => {
  /**
   * The reason this route exists instead of serveStatic: served by extension,
   * this file would go out as text/html, inline, from this origin - stored
   * scripting against whoever opens it.
   */
  test("eine von Hand hineingelegte HTML-Datei ist nicht abrufbar", async () => {
    expect((await get("/downloads/evil.html")).status).toBe(404);
  });

  test("Buchhaltungsdateien nicht", async () => {
    expect((await get("/downloads/.released")).status).toBe(404);
    expect((await get("/downloads/.notes")).status).toBe(404);
  });

  test("ein Ordner ist keine Datei", async () => {
    expect((await get("/downloads/kurs")).status).toBe(404);
    expect((await get("/downloads/kurs/")).status).toBe(404);
  });

  /**
   * Der eine Punkt, an dem aus „Ordner erlauben" „Dateisystem öffentlich"
   * würde.
   *
   * Zwei Riegel greifen hier: die Form des Pfades und der aufgelöste Ort.
   * Entschlüsselt wird nichts - der Pfad wird genommen, wie er ankam, also
   * scheitert `%2e%2e` schon am Prozentzeichen und ein wörtliches `..` am
   * fehlenden Buchstaben. Die Adressen mit echtem `../` erreichen diese Route
   * ohnehin nicht: sie werden von der URL selbst wegnormalisiert und landen
   * ausserhalb von /downloads.
   */
  test("und nichts, was aus dem Verzeichnis herausführt", async () => {
    for (const pfad of [
      "/downloads/../config.ts",
      "/downloads/../../etc/passwd",
      "/downloads/..%2f..%2fetc%2fpasswd",
      "/downloads/%2e%2e%2fpasswd",
      "/downloads/kurs/../../etc/passwd",
      "/downloads/kurs%2f..%2f..%2fetc%2fpasswd",
      "/downloads/....//passwd",
      "/downloads//etc/passwd",
      "/downloads/gibtsnicht.py",
      "/downloads/GROSS.PDF",
      "/downloads/%2e%2e%5cpasswd",
      // Unicode-Varianten des Punktes: keine davon ist ein a-z0-9.
      "/downloads/․․/passwd",
      "/downloads/．．/passwd",
    ]) {
      expect((await get(pfad)).status).toBe(404);
    }
  });

  /**
   * Ein `.` im Pfad erreicht den Server gar nicht: die URL normalisiert ihn
   * weg, und was ankommt, ist die gewöhnliche Adresse. Deshalb steht hier
   * keine Regel gegen `.` - es gibt nichts abzulehnen.
   */
  test("ein Punkt-Segment wird von der Adresse selbst wegnormalisiert", async () => {
    expect(new URL("http://x/downloads/./blatt.pdf").pathname).toBe(
      "/downloads/blatt.pdf",
    );
    expect((await get("/downloads/./blatt.pdf")).status).toBe(200);
  });

  /**
   * Der dritte Riegel, und der einzige, den die beiden Pfadprüfungen nicht
   * fangen können: ein Symlink hat eine völlig unauffällige Form, liegt im
   * Verzeichnis und zeigt trotzdem hinaus. `lstat` sieht ihn, `stat` folgt ihm.
   */
  test("auch nicht über einen Symlink, dessen Pfad harmlos aussieht", async () => {
    await symlink("/etc/hosts", join(dir, "hosts.txt"));
    expect((await get("/downloads/hosts.txt")).status).toBe(404);
  });
});

describe("Zwischenspeicher", () => {
  test("mit passendem ETag kommt 304 und kein Rumpf", async () => {
    const erste = await get("/downloads/blatt.pdf");
    const etag = erste.headers.get("ETag")!;
    expect(etag).toStartWith('W/"');

    const zweite = await get("/downloads/blatt.pdf", { "If-None-Match": etag });
    expect(zweite.status).toBe(304);
    expect(await zweite.text()).toBe("");
  });

  test("nach einer Änderung ist der ETag ein anderer", async () => {
    const vorher = (await get("/downloads/blatt.pdf")).headers.get("ETag");
    await writeFile(join(dir, "blatt.pdf"), "%PDF-1.4 deutlich laenger geworden");
    const nachher = (await get("/downloads/blatt.pdf")).headers.get("ETag");
    expect(nachher).not.toBe(vorher);
  });

  /** Namen sind nicht inhaltsadressiert: dieselbe Adresse kann neuen Inhalt bekommen. */
  test("nur kurz und nur mit Rückfrage", async () => {
    const response = await get("/downloads/messung.py");
    expect(response.headers.get("Cache-Control")).toContain("must-revalidate");
  });
});

/** Ein Ordner als eine Datei. Eigene Adresse, damit nichts mit loramint.zip kollidiert. */
describe("das Paket", () => {
  const entpacke = async (pfad: string) => {
    const response = await get(pfad);
    expect(response.status).toBe(200);
    return unzipSync(new Uint8Array(await response.arrayBuffer()));
  };

  test("enthält den Ordner samt Unterordnern, mit der Struktur darin", async () => {
    const zip = await entpacke("/paket/kurs");
    expect(Object.keys(zip).sort()).toEqual(["plan.pdf", "tag-1/blatt.pdf"]);
    expect(new TextDecoder().decode(zip["tag-1/blatt.pdf"]!)).toBe("%PDF tag 1");
  });

  /**
   * Der Grund, warum das Paket `releasedUnder` benutzt und nicht den Ordner
   * liest: die Downloadseite ist öffentlich, ein Umweg über das Paket darf die
   * Freischaltung nicht aushebeln.
   */
  test("und nichts Unfreigeschaltetes", async () => {
    const zip = await entpacke("/paket/kurs");
    expect(Object.keys(zip)).not.toContain("intern.pdf");
  });

  test("die Pfade darin sind relativ zum gepackten Ordner", async () => {
    const zip = await entpacke("/paket/kurs/tag-1");
    expect(Object.keys(zip)).toEqual(["blatt.pdf"]);
  });

  test("wird als Download angeboten, benannt nach dem Ordner", async () => {
    const response = await get("/paket/kurs");
    expect(response.headers.get("Content-Type")).toBe("application/zip");
    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="kurs.zip"',
    );
  });

  /** Es wird bei jedem Abruf gebaut, also darf es niemand zwischenspeichern. */
  test("wird nicht zwischengespeichert", async () => {
    expect((await get("/paket/kurs")).headers.get("Cache-Control")).toBe("no-store");
  });

  test("ein Ordner ohne Freigeschaltetes ergibt kein leeres Paket", async () => {
    await mkdir(join(dir, "leer"), { recursive: true });
    await writeFile(join(dir, "leer", "x.py"), "x = 1\n");
    expect((await get("/paket/leer")).status).toBe(404);
    expect((await get("/paket/gibtsnicht")).status).toBe(404);
  });

  test("und nichts, was aus dem Verzeichnis herausführt", async () => {
    for (const pfad of [
      "/paket/..",
      "/paket/../..",
      "/paket/%2e%2e",
      "/paket/kurs/../..",
      "/paket//etc",
    ]) {
      expect((await get(pfad)).status).toBe(404);
    }
  });

  /** Ein Klick darf kein Speicherproblem sein - `zipSync` baut alles im RAM. */
  test("zu gross wird mit einer Meldung abgelehnt statt gepackt", async () => {
    await mkdir(join(dir, "schwer"), { recursive: true });
    await writeFile(join(dir, "schwer", "gross.txt"), "x".repeat(1024));
    await writeFile(
      join(dir, ".released"),
      "bild.png\nkurs/plan.pdf\nkurs/tag-1/blatt.pdf\nschwer/gross.txt\n",
    );

    const echt = MAX_PACKET_BYTES;
    // Die Grenze ist eine Konstante des Moduls; statt sie umzuschreiben, wird
    // der Ordner für diesen Test grösser gemacht, als eine Grenze von 1 kB
    // zulässt - so bleibt die geprüfte Zahl die ausgelieferte.
    expect(echt).toBeGreaterThan(1024);

    await writeFile(join(dir, "schwer", "gross.txt"), "x".repeat(echt + 1));
    const response = await get("/paket/schwer");
    expect(response.status).toBe(413);
    expect(await response.text()).toContain("zu gross");
  });
});
