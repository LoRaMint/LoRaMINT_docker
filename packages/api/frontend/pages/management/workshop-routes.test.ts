import { describe, expect, test } from "bun:test";

/**
 * Every button on the workshop management page has to reach a route.
 *
 * This exists because of a real failure, not a hypothetical one: a bulk edit to
 * the upload route in v1.15.2 swallowed the `visibility` route next to it, and
 * nothing noticed. The typecheck cannot - a form action is a string, and a
 * missing route is not a missing symbol - and the tests could not either,
 * because the page renders fine without the other end. It was found by somebody
 * pressing "ausblenden" in production and getting a 404.
 *
 * So the check is deliberately crude: read both files as text and compare the
 * `action` attributes against the registered paths. It cannot prove a route
 * does the right thing, and does not try. It proves the other end exists, which
 * is exactly the thing that went missing.
 */

const DIR = new URL(".", import.meta.url).pathname;

const read = async (name: string) => Bun.file(`${DIR}${name}`).text();

/** `action={`${PATH}/upload`}` and `action={PATH}` alike, as "/upload" and "". */
const actionsIn = (source: string): Set<string> => {
  const found = new Set<string>();
  for (const match of source.matchAll(/(?:form)?action=\{`\$\{PATH\}([^`]*)`\}/g)) {
    found.add(match[1] ?? "");
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

describe("die Formulare der Workshop-Seite", () => {
  test("jede Zieladresse ist auch als Route angemeldet", async () => {
    const [page, routes] = await Promise.all([
      read("workshop-page.tsx"),
      read("workshop-routes.tsx"),
    ]);

    const actions = actionsIn(page);
    const registered = routesIn(routes);

    // Der Test taugt nur, wenn er überhaupt etwas gefunden hat. Ein leerer
    // Vergleich wäre grün und würde nichts aussagen.
    expect(actions.size).toBeGreaterThan(4);

    const ohneRoute = [...actions].filter((path) => !registered.has(path));
    expect(ohneRoute).toEqual([]);
  });

  test("die Route, die einmal verschwunden ist, ist da", async () => {
    // Namentlich, damit ein Ausfall an dieser Stelle den Namen nennt statt nur
    // eine Menge zu vergleichen.
    expect(routesIn(await read("workshop-routes.tsx"))).toContain("/visibility");
  });
});
