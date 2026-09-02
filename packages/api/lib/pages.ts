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

  //---- System: der Server selbst ----
  groups: { href: "/management/groups", label: "Datengruppen verwalten" },
  config: { href: "/management/config", label: "Konfiguration" },

  //---- Anleitungen und Entwicklung ----
  guideEsp32: { href: "/guides/esp32", label: "ESP32" },
  apiDocs: { href: "/api/v1/docs", label: "API-Dokumentation" },
  github: {
    href: "https://github.com/LoRaMint/LoRaMINT_docker",
    label: "GitHub",
  },

  //---- Konto ----
  profile: { href: "/profile", label: "Profil" },
} as const satisfies Record<string, PageRef>;
