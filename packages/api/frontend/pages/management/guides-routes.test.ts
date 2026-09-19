import { describe, expect, test } from "bun:test";

/**
 * Every form on the guide and file pages has to reach a route, and the routes
 * have to be registered in an order that lets them all be reached.
 *
 * The same check the workshop page had, and here for two reasons rather than
 * one. A form action is a string, so neither the typecheck nor a rendering test
 * can tell that the other end is gone - that is the failure the original was
 * written after, found by somebody pressing a button in production and getting
 * a 404.
 *
 * The second reason is new and worse, because it produces no error at all:
 * **Hono takes the first matching route.** `/management/anleitungen/:id` would
 * swallow `/management/anleitungen/new`, and the wildcard under `/anleitungen`
 * would swallow
 * every fixed path under it. The result is not a 404 but the wrong page,
 * rendering perfectly. `devices-routes.test.ts` exists for exactly this and
 * these routes have two instances of it.
 *
 * Crude on purpose: the files are read as text. It cannot prove a route does
 * the right thing, and does not try.
 */

const DIR = new URL(".", import.meta.url).pathname;

const read = async (name: string) => Bun.file(`${DIR}${name}`).text();

/** `action={`${PATH}/upload`}` and `action={PATH}` alike, as "/upload" and "". */
const actionsIn = (source: string): Set<string> => {
  const found = new Set<string>();
  for (const match of source.matchAll(/(?:form)?action=\{`\$\{PATH\}([^`]*)`\}/g)) {
    // A template hole in the middle of a path - `${PATH}/${id}/slug` - is a
    // parameter, and the route side spells it `/:id/slug`.
    found.add((match[1] ?? "").replace(/\$\{[^}]+\}/g, ":id"));
  }
  if (/(?:form)?action=\{PATH\}/.test(source)) found.add("");
  return found;
};

/** The paths `pages.post` registers, in either the one-line or wrapped form. */
const routesIn = (source: string): Set<string> => {
  const found = new Set<string>();
  for (const match of source.matchAll(/pages\.post\(\s*`\$\{PATH\}([^`]*)`/g)) {
    found.add(match[1] ?? "");
  }
  if (/pages\.post\(\s*PATH\s*,/.test(source)) found.add("");
  return found;
};

describe("die Formulare der Anleitungsverwaltung", () => {
  test("jede Zieladresse ist auch als Route angemeldet", async () => {
    const [routes, ...pages] = await Promise.all([
      read("guides-routes.tsx"),
      read("guides-page.tsx"),
      read("guide-edit-page.tsx"),
    ]);

    const actions = new Set(pages.flatMap((page) => [...actionsIn(page)]));
    const registered = routesIn(routes!);

    // Ein leerer Vergleich wäre grün und würde nichts aussagen.
    expect(actions.size).toBeGreaterThan(4);

    const ohneRoute = [...actions].filter((path) => !registered.has(path));
    expect(ohneRoute).toEqual([]);
  });

  /**
   * Der Platzhalter steht zuletzt, sonst sucht Hono nach einer Anleitung
   * namens „new" und antwortet mit 404 - ohne dass am Aufruf oder an der Seite
   * etwas falsch wäre.
   */
  test("die festen Pfade stehen vor /:id", async () => {
    const routes = await read("guides-routes.tsx");
    const parameter = routes.indexOf("`${PATH}/:id`");
    expect(parameter).toBeGreaterThan(-1);
    for (const fest of [
      "`${PATH}/new`",
      "`${PATH}/move`",
      "`${PATH}/order`",
      "`${PATH}/delete`",
      "`${PATH}/forget`",
    ]) {
      expect(routes.indexOf(fest)).toBeGreaterThan(-1);
      expect(routes.indexOf(fest)).toBeLessThan(parameter);
    }
  });
});

describe("die Formulare der Dateiverwaltung", () => {
  /**
   * Die Dateirouten werden nicht alle einzeln geschrieben, sondern über einen
   * `action(...)`-Helfer angemeldet - die Seiten posten aber weiterhin an
   * `${PATH}/…`. Beide Schreibweisen zählen.
   */
  const fileRoutesIn = (source: string): Set<string> => {
    const found = routesIn(source);
    for (const match of source.matchAll(/\n\s*action\(\s*\n?\s*"([^"]+)"/g)) {
      found.add(match[1] ?? "");
    }
    for (const match of source.matchAll(/\baction\("([^"]+)",/g)) {
      found.add(match[1] ?? "");
    }
    return found;
  };

  test("jede Zieladresse ist auch als Route angemeldet", async () => {
    const [routes, browser] = await Promise.all([
      read("files-routes.tsx"),
      read("files-browser.tsx"),
    ]);

    const actions = actionsIn(browser);
    const registered = fileRoutesIn(routes);

    expect(actions.size).toBeGreaterThan(6);
    const ohneRoute = [...actions].filter((path) => !registered.has(path));
    expect(ohneRoute).toEqual([]);
  });

  /**
   * Der Dateibrowser steht auf zwei Seiten, also kann das Ziel des Redirects
   * keine Konstante sein - es kommt aus einem versteckten Feld. Ein „woher
   * kamst du"-Feld, das niemand prüft, ist genau das, was zu einer offenen
   * Weiterleitung wird.
   */
  test("das Rücksprungziel wird geprüft, nicht übernommen", async () => {
    const routes = await read("files-routes.tsx");
    expect(routes).toContain("const safeBack");
    expect(routes).toContain('startsWith("/management/")');
    expect(routes).toContain('!typed.startsWith("//")');
    // Und jede Route benutzt ihn: kein `text(form, "back")` ohne safeBack.
    const roh = [...routes.matchAll(/text\(form, "back"\)/g)].length;
    const geprueft = [...routes.matchAll(/safeBack\(text\(form, "back"\)\)/g)].length;
    expect(geprueft).toBe(roh);
  });
});

describe("die öffentlichen Adressen", () => {
  const readPages = () => Bun.file(`${DIR}../index.tsx`).text();

  /**
   * `/anleitungen/:pfad{.+}` passt auf alles darunter. Steht etwas Festes danach, wird
   * es nie erreicht - und zwar ohne Fehlermeldung, mit einer Seite, die
   * einwandfrei rendert und die falsche ist.
   */
  test("der Platzhalter unter /anleitungen wird zuletzt angemeldet", async () => {
    const source = await readPages();
    const platzhalter = source.indexOf("`${PAGES.guides.href}/:pfad{.+}`");
    expect(platzhalter).toBeGreaterThan(-1);

    // Nichts registriert danach noch eine Seite.
    const danach = source.slice(platzhalter + 1);
    expect(danach).not.toContain("pages.get(");
    expect(danach).not.toContain("pages.post(");
  });

  test("die Übersicht und die alten Adressen stehen davor", async () => {
    const source = await readPages();
    const platzhalter = source.indexOf("`${PAGES.guides.href}/:pfad{.+}`");
    for (const davor of ["PAGES.guides.href,", '["/workshop", "workshop"]']) {
      expect(source.indexOf(davor)).toBeGreaterThan(-1);
      expect(source.indexOf(davor)).toBeLessThan(platzhalter);
    }
  });

  /** Eine dauerhafte Umleitung, keine vorübergehende: die Seite ist umgezogen. */
  test("die alten Adressen leiten mit 301 um", async () => {
    const source = await readPages();
    expect(source).toContain('["/workshop", "workshop"]');
    expect(source).toContain('["/guides/esp32", "esp32"]');
    expect(source).toContain("301");
  });
});
