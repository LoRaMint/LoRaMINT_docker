/**
 * Every page once: where it lives and what it is called.
 *
 * **A page has one name, and it is the same everywhere** - in the menu, in the
 * browser title (`c.get("page").title`) and in the heading the page renders.
 * Before this file the name was typed out again at each of those places and in
 * every `back` link besides: "Geräte verwalten" stood in eight files, "Daten
 * verwalten" in five. Renaming meant finding all of them, and the one that got
 * missed was never the one anybody noticed.
 *
 * The form follows from the rule:
 *
 *   - A page where a **collection is looked after** is called "&lt;Dinge&gt; verwalten".
 *   - Every other page is called after the thing itself.
 *
 * So `config` is a plain noun: it is one settings page, not a collection being
 * tended. That is the second half of the rule rather than an exception to it.
 *
 * The shape `{ href, label }` is what `PageHeading`'s `back` prop already
 * expects, so a sub-page writes `back={PAGES.devices}` and cannot drift.
 *
 * Pure: no configuration, no imports. Which pages a given person may *see* is
 * decided in Layout.tsx and again by each route - this only says what they are
 * called.
 */

export type PageRef = { href: string; label: string };

export const PAGES = {
  //---- Daten: ansehen, meist ohne Anmeldung ----
  home: { href: "/", label: "LoRaMINT" },
  plots: { href: "/plots", label: "Plots" },
  export: { href: "/export", label: "Export" },
  status: { href: "/status", label: "Status" },
  board: { href: "/board", label: "Dashboard" },
  sql: { href: "/sql", label: "SQL-Konsole" },

  //---- Verwaltung: was die Schule betreibt ----
  data: { href: "/management/data", label: "Daten verwalten" },
  /** Reached from the data hub, not from the menu - it needs the data role. */
  audit: { href: "/management/data/audit", label: "Änderungsprotokoll" },
  devices: { href: "/management/devices", label: "Geräte verwalten" },
  deviceLog: { href: "/management/devices/log", label: "Geräteprotokoll" },
  boardManage: { href: "/management/board", label: "Dashboard verwalten" },
  tokens: { href: "/management/tokens", label: "API-Token verwalten" },
  tokenLog: { href: "/management/tokens/history", label: "Token-Protokoll" },
  /** The tree: creating, moving, publishing - see management/guides-routes.tsx. */
  guidesManage: { href: "/management/anleitungen", label: "Anleitungen verwalten" },
  /**
   * One place for every file, with folders.
   *
   * Its own page *and* a panel inside every guide editor. The address of a file
   * is what gets written into a text, so the browser has to be within reach
   * while somebody is writing - but it is not a part of any one guide, which is
   * what the separate page says.
   */
  filesManage: { href: "/management/dateien", label: "Dateien verwalten" },

  //---- System: der Server selbst ----
  groups: { href: "/management/groups", label: "Datengruppen verwalten" },
  config: { href: "/management/config", label: "Konfiguration" },

  //---- Anleitungen ----
  /**
   * The overview, and the root of everything under it.
   *
   * Every guide lives at `/anleitungen/<pfad>`, so this is both a page somebody
   * wrote and the prefix of the whole tree. The wildcard route that resolves
   * the tree is registered *last* - see frontend/pages/index.tsx, and the test
   * beside it.
   */
  guides: { href: "/anleitungen", label: "Anleitungen" },
  /**
   * The listing, one level above the files themselves.
   *
   * `/downloads/<pfad>` serves a single file and `/paket/<ordner>` a ZIP of
   * one folder (index.ts, services/downloads.ts). Both are registered on the
   * root app rather than here, and neither matches this bare path.
   */
  downloads: { href: "/downloads", label: "Downloads" },

  //---- Entwicklung ----
  apiDocs: { href: "/api/v1/docs", label: "API-Dokumentation" },
  github: {
    href: "https://github.com/LoRaMint/LoRaMINT_docker",
    label: "GitHub",
  },

  //---- Konto ----
  profile: { href: "/profile", label: "Profil" },
} as const satisfies Record<string, PageRef>;
