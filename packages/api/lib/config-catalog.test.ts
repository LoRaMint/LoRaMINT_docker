import { afterEach, describe, expect, test } from "bun:test";
import {
  CATALOG,
  displayValue,
  effectiveValue,
  featureStates,
  maskDsn,
  originOf,
  settingFor,
  strandedInEnv,
  warningsFor,
  type Env,
} from "./config-catalog";
import { replaceSettings, resetSettings } from "./settings-store";

/** A deployment, described rather than had. */
const env = (values: Env = {}): Env => values;

/**
 * The settings table, described the same way. Movable settings are read from
 * here and not from the environment, so a test about one of them has to say so.
 */
const stored = (values: Record<string, string> = {}) =>
  replaceSettings(Object.entries(values));

afterEach(() => resetSettings());

describe("Vollständigkeit gegenüber config.ts", () => {
  /**
   * The test this whole file exists for.
   *
   * config.ts is the only place that decides which environment variables matter.
   * If a setting can be added there without appearing here, the configuration
   * page silently stops being the truth - and a variable nobody documented is
   * exactly what let a broken TTN deployment go unnoticed through a release.
   */
  test("jede von config.ts gelesene Variable steht im Katalog", async () => {
    const source = await Bun.file(
      new URL("../config.ts", import.meta.url),
    ).text();

    const keys = new Set<string>();
    for (const [, key] of source.matchAll(
      /(?:requireEnv|optionalInt|optional)\(\s*"([A-Z][A-Z0-9_]*)"/g,
    )) {
      keys.add(key!);
    }
    for (const [, key] of source.matchAll(/Bun\.env\.([A-Z][A-Z0-9_]*)/g)) {
      keys.add(key!);
    }

    // A sanity floor: if the extraction ever silently matches nothing, the test
    // would pass while checking absolutely nothing.
    expect(keys.size).toBeGreaterThan(30);

    const documented = new Set(CATALOG.map((setting) => setting.key));
    const missing = [...keys].filter((key) => !documented.has(key)).sort();
    expect(missing).toEqual([]);
  });

  test("der Katalog erfindet keine Variablen, die es nicht gibt", async () => {
    const source = await Bun.file(
      new URL("../config.ts", import.meta.url),
    ).text();
    const stale = CATALOG.filter(
      (setting) => !source.includes(`"${setting.key}"`) &&
        !source.includes(`Bun.env.${setting.key}`),
    ).map((setting) => setting.key);
    expect(stale).toEqual([]);
  });

  test("jeder Eintrag trägt einen erklärenden Satz", () => {
    for (const setting of CATALOG) {
      expect(setting.meaning.length).toBeGreaterThan(20);
    }
  });

  test("keine Schlüssel doppelt", () => {
    const keys = CATALOG.map((setting) => setting.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("originOf", () => {
  const port = settingFor("PORT")!;
  const ldapUrl = settingFor("LDAP_URL")!;

  test("gesetzt heisst Umgebung", () => {
    expect(originOf(port, env({ PORT: "9000" }))).toBe("environment");
  });

  test("nicht gesetzt, aber mit Vorgabe, heisst Vorgabe", () => {
    expect(originOf(port, env())).toBe("default");
  });

  test("nicht gesetzt und ohne Vorgabe heisst nicht gesetzt", () => {
    expect(originOf(ldapUrl, env())).toBe("unset");
  });

  /**
   * The case that caused the trouble: compose passes an unresolved variable
   * through as an empty string, and config.ts treats that as absent. The page
   * has to agree, or it would claim a feature is configured when it is not.
   */
  test("leer zählt wie nicht gesetzt – wie in config.ts", () => {
    expect(originOf(ldapUrl, env({ LDAP_URL: "" }))).toBe("unset");
    expect(originOf(ldapUrl, env({ LDAP_URL: "   " }))).toBe("unset");
    expect(originOf(port, env({ PORT: "" }))).toBe("default");
  });

  test("der wirksame Wert ist die Umgebung, sonst die Vorgabe", () => {
    expect(effectiveValue(port, env({ PORT: "9000" }))).toBe("9000");
    expect(effectiveValue(port, env())).toBe("8090");
    expect(effectiveValue(ldapUrl, env())).toBeNull();
  });
});

describe("nichts Geheimes auf der Seite", () => {
  test("ein Geheimnis wird beschrieben, nicht gezeigt", () => {
    const key = settingFor("TTN_APP_KEY")!;
    const secret = "NNSXS.CMH3BORV76OQ3FGJ.XLUEWCBSCH2RSNHL33KYX64YEG2LKOLXYQ";
    const shown = displayValue(key, env({ TTN_APP_KEY: secret }));

    expect(shown).not.toContain(secret);
    expect(shown).toContain(String(secret.length));
    expect(shown).toContain("NNSXS.");
  });

  test("eine DSN verliert ihr Passwort", () => {
    const dsn = settingFor("DATABASE_URL")!;
    const shown = displayValue(
      dsn,
      env({ DATABASE_URL: "postgres://loramint:98e62ae15a9f@db:5432/loramint_db" }),
    );
    expect(shown).toBe("postgres://loramint:***@db:5432/loramint_db");
    expect(shown).not.toContain("98e62ae15a9f");
  });

  test("auch eine DSN ohne Passwort bleibt lesbar", () => {
    expect(maskDsn("postgres://loramint@db:5432/loramint_db")).toBe(
      "postgres://loramint@db:5432/loramint_db",
    );
  });

  /**
   * A DSN that does not parse must not slip through unredacted - that is exactly
   * when a password would end up on the screen.
   */
  test("eine unverständliche DSN gibt trotzdem nichts preis", () => {
    for (const setting of CATALOG.filter((s) => s.kind === "dsn")) {
      const shown = displayValue(
        setting,
        env({ [setting.key]: "postgres://user:geheim@host/db?x=1" }),
      );
      expect(shown).not.toContain("geheim");
    }
  });

  test("kein Geheimnis und keine DSN gibt seinen Wert je unverändert zurück", () => {
    for (const setting of CATALOG.filter(
      (s) => s.kind === "secret" || s.kind === "dsn",
    )) {
      const shown = displayValue(
        setting,
        env({ [setting.key]: "postgres://u:supergeheim@h/d" }),
      );
      expect(shown).not.toContain("supergeheim");
    }
  });
});

describe("Ampelblock", () => {
  /** Exactly the state of the production server after the 1.6.1 deployment. */
  const wieProduktiv = env({
    DATABASE_URL: "postgres://loramint:pw@db:5432/loramint_db",
    DATABASE_URL_MANAGE: "postgres://loramint_manage:pw@db:5432/loramint_db",
    DATABASE_URL_READONLY: "postgres://loramint_readonly:pw@db:5432/loramint_db",
    DATABASE_URL_ADMIN: "postgres://loramint_admin_sql:pw@db:5432/loramint_db",
    LDAP_URL: "ldap://lldap:3890",
    LEGAL_IMPRESSUM: "…",
    LEGAL_DATENSCHUTZ: "…",
    TTN_APP_KEY: "NNSXS.abc",
  });

  test("nennt die Geräteverwaltung als aus und sagt warum", () => {
    const devices = featureStates(wieProduktiv).find(
      (f) => f.label === "Geräteverwaltung",
    )!;
    expect(devices.on).toBe(false);
    expect(devices.because).toContain("TTN_API_KEY");
    expect(devices.because).toContain("TTN_APPLICATION_ID");
  });

  test("nennt beim halb konfigurierten Fall genau das fehlende Stück", () => {
    stored({ TTN_API_KEY: "NNSXS.xyz" });
    const devices = featureStates(wieProduktiv).find(
      (f) => f.label === "Geräteverwaltung",
    )!;
    expect(devices.on).toBe(false);
    expect(devices.because).toContain("TTN_APPLICATION_ID");
    expect(devices.because).not.toContain("TTN_API_KEY und");
  });

  test("an, sobald beide da sind", () => {
    stored({ TTN_API_KEY: "NNSXS.xyz", TTN_APPLICATION_ID: "loramint" });
    const devices = featureStates(wieProduktiv).find(
      (f) => f.label === "Geräteverwaltung",
    )!;
    expect(devices.on).toBe(true);
  });

  test("jede Zeile begründet sich", () => {
    for (const state of featureStates(wieProduktiv)) {
      expect(state.because.length).toBeGreaterThan(5);
    }
  });
});

describe("Plausibilitätsprüfungen", () => {
  test("erkennt die Console-Adresse in TTN_URL", () => {
    const setting = settingFor("TTN_URL")!;
    stored({
      TTN_URL:
        "https://eu1.cloud.thethings.network/console/applications/test-loramint",
    });
    const warnings = warningsFor(setting, env());
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("Weboberfläche");
  });

  test("schweigt beim richtigen Cluster-Ursprung", () => {
    const setting = settingFor("TTN_URL")!;
    expect(warningsFor(setting, env())).toEqual([]);
    stored({ TTN_URL: "https://nam1.cloud.thethings.network" });
    expect(warningsFor(setting, env())).toEqual([]);
  });

  test("warnt vor abgeschalteter Zertifikatsprüfung", () => {
    const setting = settingFor("LDAP_TLS_REJECT_UNAUTHORIZED")!;
    stored({ LDAP_TLS_REJECT_UNAUTHORIZED: "false" });
    expect(warningsFor(setting, env())).toHaveLength(1);
    resetSettings();
    expect(warningsFor(setting, env())).toEqual([]);
  });

  test("warnt vor TRUSTED_PROXIES=0, nicht vor der Vorgabe", () => {
    const setting = settingFor("TRUSTED_PROXIES")!;
    expect(warningsFor(setting, env({ TRUSTED_PROXIES: "0" }))).toHaveLength(1);
    expect(warningsFor(setting, env())).toEqual([]);
  });

  test("erkennt eine Application-Kennung, die ein Pfad ist", () => {
    const setting = settingFor("TTN_APPLICATION_ID")!;
    stored({ TTN_APPLICATION_ID: "console/applications/x" });
    expect(warningsFor(setting, env())).toHaveLength(1);
    stored({ TTN_APPLICATION_ID: "test-loramint" });
    expect(warningsFor(setting, env())).toEqual([]);
  });

  test("eine gesunde Konfiguration erzeugt gar keine Warnung", () => {
    const healthy = env();
    stored({
      TTN_URL: "https://eu1.cloud.thethings.network",
      TTN_APPLICATION_ID: "loramint",
    });
    const all = CATALOG.flatMap((setting) => warningsFor(setting, healthy));
    expect(all).toEqual([]);
  });
});

describe("verschiebbare Einstellungen kommen aus der Tabelle", () => {
  const ldapUrl = settingFor("LDAP_URL")!;
  const port = settingFor("PORT")!;

  test("ein gespeicherter Wert heisst Datenbank", () => {
    stored({ LDAP_URL: "ldap://lldap:3890" });
    expect(originOf(ldapUrl, env())).toBe("database");
    expect(effectiveValue(ldapUrl, env())).toBe("ldap://lldap:3890");
  });

  /**
   * The point of the whole move: for a movable setting the environment is not a
   * fallback but noise. A page that showed it would claim a source the
   * application does not use.
   */
  test("die Umgebung wird für sie ignoriert", () => {
    resetSettings();
    expect(originOf(ldapUrl, env({ LDAP_URL: "ldap://alt:389" }))).toBe("unset");
    expect(effectiveValue(ldapUrl, env({ LDAP_URL: "ldap://alt:389" }))).toBeNull();
  });

  test("ein dort vergessener Wert wird als solcher erkannt", () => {
    expect(strandedInEnv(ldapUrl, env({ LDAP_URL: "ldap://alt:389" }))).toBe(true);
    expect(strandedInEnv(ldapUrl, env())).toBe(false);
    // Nothing to strand: PORT belongs to the environment.
    expect(strandedInEnv(port, env({ PORT: "9000" }))).toBe(false);
  });

  test("Einstellungen der Umgebung bleiben unberührt vom Speicher", () => {
    stored({ PORT: "1234" });
    expect(originOf(port, env())).toBe("default");
    expect(effectiveValue(port, env())).toBe("8090");
  });
});
