import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// config.ts throws on a missing TTN_APP_KEY at import time; the handler reaches
// it for the upload directory. Dynamic import for the same reason as in
// services/uploads.test.ts - a static one would be hoisted above this line.
process.env.TTN_APP_KEY ??= "integration-test";
const { downloadHandler } = await import("./downloads");

/*
 * A real directory and a real Hono app, because what is under test is the
 * *response*: which content type goes out, whether it is inline, whether a
 * hostile path gets anywhere. None of that is visible from the function's return
 * value alone.
 */
let dir: string;
const app = new Hono();
app.get("/downloads/:name", downloadHandler);

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
  await writeFile(join(dir, ".hidden"), "bild.png\n");
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

  /**
   * The header that closes the hole `serveStatic` would have left open: our type
   * is the only type, and a browser must not sniff the body and decide better.
   */
  test("nosniff steht auf jeder Antwort", async () => {
    for (const pfad of ["/downloads/blatt.pdf", "/downloads/messung.py"]) {
      const response = await get(pfad);
      expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    }
  });

  test("ausgeblendete Dateien bleiben erreichbar", async () => {
    // "Ausgeblendet" ist eine Frage der Darstellung, kein Zugriffsschutz - die
    // Bearbeitungsseite sagt das auch so.
    const response = await get("/downloads/bild.png");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/png");
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
    expect((await get("/downloads/.hidden")).status).toBe(404);
  });

  test("und nichts, was aus dem Verzeichnis herausführt", async () => {
    for (const pfad of [
      "/downloads/..%2f..%2fetc%2fpasswd",
      "/downloads/%2e%2e%2fpasswd",
      "/downloads/....//passwd",
      "/downloads/gibtsnicht.py",
      "/downloads/GROSS.PDF",
    ]) {
      expect((await get(pfad)).status).toBe(404);
    }
  });

  /**
   * A sub-directory is not forbidden, it is unreachable: the route matches one
   * path segment, so a path with a slash in it never gets here at all.
   */
  test("ein Unterverzeichnis passt nicht einmal auf die Route", async () => {
    expect((await get("/downloads/unter/x.py")).status).toBe(404);
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
