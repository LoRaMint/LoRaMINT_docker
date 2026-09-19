/**
 * German letters that have no place in an address, and what they become.
 *
 * One line of knowledge in what are now four places - a file name, a folder
 * name, a guide's slug and a heading anchor - and all four have to agree. They
 * did not have to before: two copies is duplication, four is a rule, and the
 * rule is that `Grüße` is `gruesse` everywhere.
 *
 * **It has to run before the generic replacement, not after.** `Übung` reduced
 * by `[^a-z0-9]` first becomes `-bung`; folded first it becomes `uebung`. Every
 * caller therefore calls this on the way in, not as a tidy-up afterwards.
 */
const UMLAUTE: Record<string, string> = {
  ä: "ae", ö: "oe", ü: "ue", Ä: "ae", Ö: "oe", Ü: "ue", ß: "ss",
};

export const foldUmlauts = (text: string): string =>
  text.replace(/[äöüÄÖÜß]/g, (zeichen) => UMLAUTE[zeichen] ?? zeichen);
