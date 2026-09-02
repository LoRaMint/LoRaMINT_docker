/**
 * Vergleicht das Frontend mit `tokens.json`.
 *
 *     bun guidelines/design/pruefung.ts
 *
 * Warum es das gibt: Die Regeln des Corporate Designs standen eine Weile nur im
 * Text, und geprueft wurde von Hand. Dabei rutschte ein zweiter Schatten durch,
 * weil die Suche nur nach `shadow-lg` sah und die Datei `shadow-2xl` benutzte.
 * Eine Regel, die niemand nachrechnen kann, ist eine Absichtserklaerung.
 *
 * Die Pruefung ist bewusst grob: Sie liest Dateien als Text statt sie zu
 * parsen. Ein Parser fuer CSS und TSX waere genauer und wuerde bei jeder
 * Formatierungsaenderung brechen; hier zaehlt, dass sie ohne Pflege ueberlebt.
 * Was sie nicht sehen kann, steht am Ende als offene Punkte.
 *
 * Beendet sich mit 1, sobald etwas abweicht - damit sie in CI taugt.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const hier = dirname(fileURLToPath(import.meta.url));
const wurzel = join(hier, "..", "..");
const frontend = join(wurzel, "packages", "api", "frontend");

const tokens = JSON.parse(readFileSync(join(hier, "tokens.json"), "utf8"));

type Befund = { regel: string; text: string };
const befunde: Befund[] = [];
let geprueft = 0;

const pruefe = (regel: string, ok: boolean, text: string) => {
  geprueft++;
  if (!ok) befunde.push({ regel, text });
};

const lies = (pfad: string) => readFileSync(join(frontend, pfad), "utf8");

/** Alle Dateien unter frontend/, als Text. */
const alleDateien = (): { pfad: string; inhalt: string }[] => {
  const { execSync } = require("node:child_process");
  const liste = execSync(`find ${frontend} -type f \\( -name '*.ts' -o -name '*.tsx' -o -name '*.css' \\)`)
    .toString().trim().split("\n");
  return liste.map((p: string) => ({ pfad: p.replace(frontend + "/", ""), inhalt: readFileSync(p, "utf8") }));
};
const dateien = alleDateien();
const irgendwo = (muster: RegExp) =>
  dateien.filter((d) => muster.test(d.inhalt)).map((d) => d.pfad);

// ---- 1. Die Themewerte stehen so in global.css ------------------------------
const css = lies("styles/global.css");
const dunkelAb = css.indexOf('name: "loramint-dark"');
const bloecke: Record<string, string> = {
  hell: css.slice(0, dunkelAb),
  dunkel: css.slice(dunkelAb),
};
for (const [theme, rollen] of Object.entries(tokens.theme) as [string, Record<string, string>][]) {
  for (const [rolle, soll] of Object.entries(rollen)) {
    const treffer = new RegExp(`--color-${rolle}:\\s*(#[0-9A-Fa-f]{6})`).exec(bloecke[theme]!);
    const ist = treffer?.[1]?.toUpperCase();
    pruefe("TOKEN", ist === soll.toUpperCase(),
      `${theme}/${rolle}: Code ${ist ?? "fehlt"}, Leitfaden ${soll}`);
  }
}

// ---- 2. Die Datenpalette, in der festen Reihenfolge -------------------------
const plots = lies("pages/plots/client.ts");
for (const [feld, schluessel] of [["PALETTE_LIGHT", "hell"], ["PALETTE_DARK", "dunkel"]] as const) {
  const roh = new RegExp(`${feld}\\s*=\\s*\\[([^\\]]+)\\]`).exec(plots)?.[1] ?? "";
  const ist = roh.split(",").map((x) => x.trim().replace(/"/g, "").toUpperCase()).filter(Boolean);
  const soll = tokens.daten.slots.map((s: Record<string, string>) => s[schluessel]!.toUpperCase());
  pruefe("DATEN-01", JSON.stringify(ist) === JSON.stringify(soll),
    `Palette ${schluessel} weicht ab: ${ist.join(",")}`);
}

// ---- 3. Was es nicht mehr geben darf ----------------------------------------
const verboten: [string, RegExp, string][] = [
  ["MARKE-03", /--color-accent|--color-info\b/, "accent oder info sind wieder da"],
  ["MARKE-05", /text-base-content\/(50|60)\b/, "Textdeckkraft unter 70 % im hellen Theme"],
  ["KOPF-02", /tab-lifted/, "die alte Reiter-Optik ohne Anschluss"],
  ["FORM-05", /shadow-(sm|md|lg|xl|2xl)\b/, "eine zweite Schattenstufe"],
  ["KACH-01", /#22c55e|#eab308|#ef4444/i, "der Ampelverlauf der Gauges"],
  ["SCHRIFT-01", /\\itshape|<i>/, "Kursive"],
];
for (const [regel, muster, text] of verboten) {
  const treffer = irgendwo(muster);
  pruefe(regel, treffer.length === 0, `${text} — in ${treffer.join(", ")}`);
}

// ---- 4. Gefuellte rote Buttons nur auf Bestaetigungsseiten ------------------
const bestaetigung = /(confirm-|continue-|pages\/sql\/)/;
const roteButtons = dateien
  .filter((d) => /class="[^"]*\bbtn-error\b/.test(d.inhalt) && !/btn-outline/.test(d.inhalt))
  .map((d) => d.pfad)
  .filter((p) => !bestaetigung.test(p));
pruefe("BUTTON-01", roteButtons.length === 0,
  `gefuellter roter Button ausserhalb einer Bestaetigungsseite — ${roteButtons.join(", ")}`);

// ---- 5. Form: Radien und Rahmen --------------------------------------------
for (const [name, soll] of [["--radius-box", tokens.form.radius_box],
                            ["--radius-field", tokens.form.radius_field],
                            ["--border", tokens.form.rahmen]] as const) {
  const ist = new RegExp(`${name}:\\s*([^;]+);`).exec(css)?.[1]?.trim();
  pruefe("FORM", ist === soll, `${name}: Code ${ist ?? "fehlt"}, Leitfaden ${soll}`);
}

// ---- 6. Der Fokusring, wie FOKUS-03 ihn beschreibt --------------------------
pruefe("FOKUS-03",
  css.includes("0 0 0 2px var(--color-base-100)") && css.includes("0 0 0 4px var(--color-primary)"),
  "der zweifarbige Fokusring fehlt oder wurde geaendert");
pruefe("FOKUS-02", css.includes(":focus-visible"), ":focus-visible fehlt");

// ---- 7. Die Hausschrift -----------------------------------------------------
pruefe("SCHRIFT", /--font-sans:\s*"Rubik"/.test(css), "Rubik ist nicht die Grundschrift");

// ---- Ergebnis ---------------------------------------------------------------
const rot = (t: string) => `\x1b[31m${t}\x1b[0m`;
const gruen = (t: string) => `\x1b[32m${t}\x1b[0m`;

if (befunde.length === 0) {
  console.log(gruen(`  ${geprueft} Pruefungen, keine Abweichung.`));
} else {
  console.log(rot(`  ${befunde.length} von ${geprueft} Pruefungen schlagen an:\n`));
  for (const b of befunde) console.log(`    ${b.regel.padEnd(12)} ${b.text}`);
  console.log("");
}

console.log("  Nicht maschinell pruefbar und weiterhin Handarbeit:");
console.log("    - ob Farbe allein eine Information traegt (GRUND-03)");
console.log("    - ob ein leerer Zustand einen naechsten Schritt nennt (TAB-07)");
console.log("    - ob \\alert{} zum Warnen oder zum Betonen benutzt wird (LATEX-07)");
console.log("    - alles, was Druck und Folien betrifft: liegt in ma-fdpi/design/latex/");

process.exit(befunde.length === 0 ? 0 : 1);
