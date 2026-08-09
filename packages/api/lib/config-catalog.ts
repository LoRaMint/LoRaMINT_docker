import { storedSetting } from "./settings-store";

/**
 * Every setting this application reads, described once.
 *
 * The page at /management/config renders this catalogue against the live
 * environment: what is set, what merely uses the built-in default, and what is
 * missing. That distinction exists nowhere else - not in `.env.example`, which
 * cannot know a deployment, and not in the compose file, which lists what is
 * *passed through* rather than what took effect.
 *
 * It is written as data rather than as markup so it stays pure: no config
 * import, no network, no `Bun.env` at module level. The environment is handed in
 * by the caller, which is what lets the tests describe a deployment instead of
 * having one.
 *
 * `config-catalog.test.ts` reads config.ts and insists that every key it reads
 * appears below. A new setting therefore cannot be added without a sentence
 * saying what it is for - which is precisely the omission that let a missing
 * TTN variable go unnoticed through a whole release.
 */

//====================================
// TYPES
//====================================

/** How a value must be treated when it is shown. */
export type SettingKind =
  | "text"
  | "number"
  | "flag"
  /** Shown in full; a URL is not a secret. */
  | "url"
  /** A connection string: the password is masked even from administrators' eyes by default. */
  | "dsn"
  /** Never rendered; only its shape is described. */
  | "secret"
  /** Longer text in Markdown - gets a text box rather than a one-line field. */
  | "markdown";

/**
 * Where a setting will live once the configuration page can write.
 *
 * `environment` is the group that must stay outside the database: needed before
 * the application can reach its own configuration, or load-bearing for the
 * security model. Everything else can move. See docs/konfiguration-verwalten.md.
 */
export type Tier = "environment" | "movable";

export type Group =
  | "core"
  | "setup"
  | "auth"
  | "manage"
  | "sql"
  | "devices"
  | "legal";

export type Setting = {
  key: string;
  group: Group;
  kind: SettingKind;
  /** One sentence, in the language of the person reading the page. */
  meaning: string;
  /** What the application uses when the variable is absent, or null when there is none. */
  fallback: string | null;
  /** True when the application refuses to start without it. */
  required?: boolean;
  tier: Tier;
};

export const GROUP_LABELS: Record<Group, string> = {
  core: "Kern",
  setup: "Einrichtungskonto",
  auth: "Anmeldung (LDAP)",
  manage: "Datenverwaltung",
  sql: "SQL-Seite",
  devices: "Geräteverwaltung (TTN)",
  legal: "Rechtsseiten",
};

/** The order the groups appear in. */
export const GROUP_ORDER: Group[] = [
  "core",
  "setup",
  "auth",
  "manage",
  "sql",
  "devices",
  "legal",
];

/**
 * The sidebar, as sections with a heading each.
 *
 * Seven entries in one flat list is a list one reads from the top every time.
 * Grouped by what somebody came to do - get in, run the thing, connect it to
 * something else - they can be aimed at instead.
 */
export const GROUP_SECTIONS: { label: string; groups: Group[] }[] = [
  { label: "Zugang", groups: ["setup", "auth"] },
  { label: "Betrieb", groups: ["core", "manage", "sql"] },
  { label: "Angebundenes", groups: ["devices", "legal"] },
];

//====================================
// THE CATALOGUE
//====================================

export const CATALOG: Setting[] = [
  //---- Kern ----
  {
    key: "DATABASE_URL",
    group: "core",
    kind: "dsn",
    meaning:
      "Die Verbindung des Eigentümers. Sie besitzt das Schema und führt die " +
      "Migrationen aus; die übrigen Rollen werden aus ihr abgeleitet. Der " +
      "laufende Betrieb benutzt sie nicht.",
    fallback: null,
    required: true,
    tier: "environment",
  },
  {
    key: "TTN_APP_KEY",
    group: "core",
    kind: "secret",
    meaning:
      "Das Wort, das der TTN-Webhook als X-Downlink-Apikey mitschickt. " +
      "Anfragen ohne passenden Wert werden abgewiesen.",
    fallback: null,
    required: true,
    tier: "environment",
  },
  {
    key: "PORT",
    group: "core",
    kind: "number",
    meaning: "Der Port, auf dem der Server lauscht.",
    fallback: "8090",
    tier: "environment",
  },
  {
    key: "NODE_ENV",
    group: "core",
    kind: "text",
    meaning:
      "„development\" schaltet die SSR-Hilfen frei und lässt das Secure-Flag " +
      "am Sitzungs-Cookie weg. Alles andere gilt als Produktion.",
    fallback: "production",
    tier: "environment",
  },
  {
    key: "TRUSTED_PROXIES",
    group: "core",
    kind: "number",
    meaning:
      "Wie viele Proxys vor der Anwendung stehen. Nur die Anmeldesperre " +
      "benutzt es, um einen Besucher vom anderen zu unterscheiden.",
    fallback: "1",
    tier: "environment",
  },

  //---- Einrichtungskonto ----
  {
    key: "ADMIN_USERNAME",
    group: "setup",
    kind: "text",
    meaning:
      "Anmeldename eines lokalen Administrators neben dem Verzeichnis – der " +
      "Weg hinein, bevor LDAP eingerichtet ist.",
    fallback: null,
    tier: "environment",
  },
  {
    key: "ADMIN_PASSWORD_HASH",
    group: "setup",
    kind: "secret",
    meaning:
      "Argon2-Hash des Passworts. Die empfohlene Form: wer die Umgebung liest, " +
      "hält damit keinen Zugang. Erzeugen mit scripts/hash-password.ts.",
    fallback: null,
    tier: "environment",
  },
  {
    key: "ADMIN_PW",
    group: "setup",
    kind: "secret",
    meaning:
      "Passwort im Klartext – nur der Bequemlichkeit halber zugelassen und vom " +
      "Hash überstimmt, falls beides gesetzt ist.",
    fallback: null,
    tier: "environment",
  },

  //---- Anmeldung ----
  {
    key: "LDAP_URL",
    group: "auth",
    kind: "url",
    meaning:
      "Adresse des Verzeichnisses. Ohne sie gibt es keine Anmeldung, keine " +
      "Rollen und keinen Verwaltungsbereich.",
    fallback: null,
    tier: "movable",
  },
  {
    key: "SESSION_SECRET",
    group: "auth",
    kind: "secret",
    meaning:
      "Signierschlüssel des Sitzungs-Cookies. Wird er gewechselt, sind alle " +
      "Sitzungen sofort ungültig.",
    fallback: null,
    tier: "environment",
  },
  {
    key: "SESSION_TTL_HOURS",
    group: "auth",
    kind: "number",
    meaning: "Wie lange eine Anmeldung gilt, in Stunden.",
    fallback: "8",
    tier: "movable",
  },
  {
    key: "LDAP_USER_DN_TEMPLATE",
    group: "auth",
    kind: "text",
    meaning:
      "Direkte Bindung: der DN wird aus dem Anmeldenamen gebaut. Alternative " +
      "zu LDAP_BIND_DN plus LDAP_SEARCH_BASE.",
    fallback: null,
    tier: "movable",
  },
  {
    key: "LDAP_BIND_DN",
    group: "auth",
    kind: "text",
    meaning: "Dienstkonto, das den Benutzer im Verzeichnis zuerst nachschlägt.",
    fallback: null,
    tier: "movable",
  },
  {
    key: "LDAP_BIND_PASSWORD",
    group: "auth",
    kind: "secret",
    meaning: "Passwort dieses Dienstkontos.",
    fallback: null,
    tier: "movable",
  },
  {
    key: "LDAP_SEARCH_BASE",
    group: "auth",
    kind: "text",
    meaning: "Unterhalb welchen Knotens nach Benutzern gesucht wird.",
    fallback: null,
    tier: "movable",
  },
  {
    key: "LDAP_SEARCH_FILTER",
    group: "auth",
    kind: "text",
    meaning:
      "Wonach gesucht wird. {username} wird eingesetzt und dabei escaped.",
    fallback: "(uid={username})",
    tier: "movable",
  },
  {
    key: "LDAP_DISPLAY_NAME_ATTRIBUTE",
    group: "auth",
    kind: "text",
    meaning:
      "Attribut, das im Kopf als Name erscheint; fällt auf den Anmeldenamen zurück.",
    fallback: "cn",
    tier: "movable",
  },
  {
    key: "LDAP_GROUP_ATTRIBUTE",
    group: "auth",
    kind: "text",
    meaning:
      "Attribut am Benutzereintrag, das die Gruppen nennt – etwa memberOf.",
    fallback: null,
    tier: "movable",
  },
  {
    key: "LDAP_GROUP_SEARCH_BASE",
    group: "auth",
    kind: "text",
    meaning:
      "Statt eines Attributs die Gruppeneinträge durchsuchen – nötig bei " +
      "OpenLDAP ohne memberof-Overlay.",
    fallback: null,
    tier: "movable",
  },
  {
    key: "LDAP_GROUP_FILTER",
    group: "auth",
    kind: "text",
    meaning: "Wonach bei dieser Gruppensuche gesucht wird.",
    fallback: "(member={dn})",
    tier: "movable",
  },
  {
    key: "LDAP_GROUP_NAME_ATTRIBUTE",
    group: "auth",
    kind: "text",
    meaning: "Attribut, aus dem der Gruppenname gelesen wird.",
    fallback: "cn",
    tier: "movable",
  },
  {
    key: "LDAP_DATA_GROUP",
    group: "auth",
    kind: "text",
    meaning:
      "Gruppe für die unterste Stufe (Daten lesen). Nicht gesetzt heisst " +
      "„keine Einschränkung konfiguriert\" – jeder Angemeldete darf lesen.",
    fallback: null,
    tier: "movable",
  },
  {
    key: "LDAP_MANAGEMENT_GROUP",
    group: "auth",
    kind: "text",
    meaning:
      "Gruppe für den Verwaltungsbereich. Nicht gesetzt heisst: niemand " +
      "erreicht ihn.",
    fallback: null,
    tier: "movable",
  },
  {
    key: "LDAP_ADMIN_GROUP",
    group: "auth",
    kind: "text",
    meaning:
      "Gruppe für Administratoren. Nicht gesetzt heisst: niemand erreicht sie.",
    fallback: null,
    tier: "movable",
  },
  {
    key: "LDAP_PASSWORD_RESET_URL",
    group: "auth",
    kind: "url",
    meaning:
      "Ziel des Links „Passwort ändern in der Nutzerverwaltung\" auf der " +
      "Anmeldeseite.",
    fallback: null,
    tier: "movable",
  },
  {
    key: "LDAP_TIMEOUT_MS",
    group: "auth",
    kind: "number",
    meaning: "Verbindungs- und Antwortzeit gegenüber dem Verzeichnis.",
    fallback: "5000",
    tier: "movable",
  },
  {
    key: "LDAP_TLS_REJECT_UNAUTHORIZED",
    group: "auth",
    kind: "flag",
    meaning:
      "Auf „false\" nur gegen ein Testverzeichnis mit selbstsigniertem Zertifikat.",
    fallback: "true",
    tier: "movable",
  },

  //---- Datenverwaltung ----
  {
    key: "DATA_EDITING_ENABLED",
    group: "manage",
    kind: "flag",
    meaning:
      "Ob Daten überhaupt geändert werden dürfen. Auf „false\" öffnen die " +
      "Verwaltungsseiten nur lesend – für eine Installation, die nur anzeigen soll.",
    fallback: "true",
    tier: "movable",
  },
  {
    key: "MANAGE_MAX_DELETE",
    group: "manage",
    kind: "number",
    meaning:
      "Wie viele Zeilen ein Block einer Löschung entfernt – keine Obergrenze, " +
      "sondern die Blockgrösse.",
    fallback: "10000",
    tier: "movable",
  },
  {
    key: "MANAGE_TIMEOUT_MS",
    group: "manage",
    kind: "number",
    meaning: "Nach wie vielen Millisekunden eine Verwaltungsanweisung abbricht.",
    fallback: "30000",
    tier: "movable",
  },

  //---- SQL-Seite ----
  {
    key: "SQL_CONSOLE_ENABLED",
    group: "sql",
    kind: "flag",
    meaning:
      "Ob es die SQL-Seite gibt. Auf „false\" verschwindet sie aus dem Menü und " +
      "antwortet mit 404.",
    fallback: "true",
    tier: "movable",
  },
  {
    key: "QUERY_MAX_ROWS",
    group: "sql",
    kind: "number",
    meaning: "Wie viele Zeilen ein Ergebnis höchstens zeigt.",
    fallback: "200",
    tier: "movable",
  },
  {
    key: "QUERY_TIMEOUT_MS",
    group: "sql",
    kind: "number",
    meaning: "Nach wie vielen Millisekunden eine Abfrage abgebrochen wird.",
    fallback: "5000",
    tier: "movable",
  },

  //---- Geräteverwaltung ----
  {
    key: "TTN_API_KEY",
    group: "devices",
    kind: "secret",
    meaning:
      "Schlüssel, mit dem Geräte in TTN angelegt und deren Root-Keys gelesen " +
      "werden. NICHT dasselbe wie TTN_APP_KEY.",
    fallback: null,
    tier: "movable",
  },
  {
    key: "TTN_APPLICATION_ID",
    group: "devices",
    kind: "text",
    meaning: "Kennung der TTN-Application, etwa „loramint\".",
    fallback: null,
    tier: "movable",
  },
  {
    key: "TTN_URL",
    group: "devices",
    kind: "url",
    meaning:
      "Cluster-Ursprung der Application – nur der Ursprung, nicht die Adresse " +
      "der Console.",
    fallback: "https://eu1.cloud.thethings.network",
    tier: "movable",
  },
  {
    key: "TTN_TIMEOUT_MS",
    group: "devices",
    kind: "number",
    meaning: "Wie lange auf The Things Network gewartet wird.",
    fallback: "5000",
    tier: "movable",
  },
  {
    key: "TTN_FREQUENCY_PLAN",
    group: "devices",
    kind: "text",
    meaning: "Frequenzplan, den jedes hier angelegte Gerät bekommt.",
    fallback: "EU_863_870_TTN",
    tier: "movable",
  },
  {
    key: "TTN_LORAWAN_VERSION",
    group: "devices",
    kind: "text",
    meaning: "LoRaWAN-Version für neu angelegte Geräte.",
    fallback: "MAC_V1_0_3",
    tier: "movable",
  },
  {
    key: "TTN_REGIONAL_PARAMETERS",
    group: "devices",
    kind: "text",
    meaning: "Regional Parameters für neu angelegte Geräte.",
    fallback: "PHY_V1_0_3_REV_A",
    tier: "movable",
  },

  //---- Rechtsseiten ----
  {
    key: "LEGAL_IMPRESSUM",
    group: "legal",
    kind: "markdown",
    meaning:
      "Inhalt der Impressumsseite, als Markdown: # Überschrift, - Aufzählung, " +
      "**fett**, [Text](https://…). Ohne Inhalt gibt es die Seite nicht.",
    fallback: null,
    tier: "movable",
  },
  {
    key: "LEGAL_DATENSCHUTZ",
    group: "legal",
    kind: "markdown",
    meaning:
      "Inhalt der Datenschutzseite, als Markdown – dieselben Auszeichnungen wie " +
      "beim Impressum. Ohne Inhalt gibt es die Seite nicht.",
    fallback: null,
    tier: "movable",
  },
];

export const settingFor = (key: string): Setting | undefined =>
  CATALOG.find((setting) => setting.key === key);

//====================================
// READING THE ENVIRONMENT
//====================================

export type Env = Record<string, string | undefined>;

export type Origin = "database" | "environment" | "default" | "unset";

/**
 * The same rule config.ts applies: a variable that is absent *or* set to nothing
 * counts as unset. Compose passes an unresolved variable through as an empty
 * string, so treating empty as absent is what keeps one compose file usable for
 * a deployment that wants none of the optional features.
 */
const rawValue = (key: string, env: Env): string | null => {
  const value = env[key];
  return value !== undefined && value.trim().length > 0 ? value : null;
};

/**
 * Where the effective value comes from.
 *
 * This is the column the page exists for: it tells "stands at 1 because somebody
 * set 1" apart from "stands at 1 because that is the default", and no other
 * place in this application can answer that.
 */
export const originOf = (setting: Setting, env: Env): Origin => {
  // A movable setting is read from the table and from nowhere else, exactly as
  // config.ts reads it. Consulting the environment here as well would make the
  // page claim a source the application does not actually use - the one thing
  // it must never do.
  if (setting.tier === "movable") {
    if (storedSetting(setting.key) !== null) return "database";
    return setting.fallback !== null ? "default" : "unset";
  }
  if (rawValue(setting.key, env) !== null) return "environment";
  return setting.fallback !== null ? "default" : "unset";
};

/** The value the application actually uses, or null when there is none. */
export const effectiveValue = (setting: Setting, env: Env): string | null =>
  (setting.tier === "movable"
    ? storedSetting(setting.key)
    : rawValue(setting.key, env)) ?? setting.fallback;

/**
 * True when a movable setting is still set in the environment, where it now has
 * no effect.
 *
 * Worth saying out loud: after the move, a value left in the compose file is not
 * merely redundant but misleading - somebody will read it and believe it.
 */
export const strandedInEnv = (setting: Setting, env: Env): boolean =>
  setting.tier === "movable" && rawValue(setting.key, env) !== null;

//====================================
// SHOWING WITHOUT LEAKING
//====================================

/** A secret described by its shape rather than its content. */
const describeSecret = (value: string) => {
  const head = value.slice(0, 6);
  return `gesetzt (${value.length} Zeichen, beginnt mit ${head}…)`;
};

/**
 * A connection string with the password replaced.
 *
 * Built by hand rather than with `new URL`, because a DSN that does not parse
 * must not fall through unredacted - the whole point is that nothing here can
 * put a password on the screen.
 */
export const maskDsn = (value: string): string =>
  value.replace(/^([a-zA-Z][\w+.-]*:\/\/[^:/?#@]*):[^@]*@/, "$1:***@");

/**
 * What may be rendered for this setting.
 *
 * Secrets never travel to the page at all; DSNs travel with the password
 * removed. Everything else is shown as it is - a timeout or a frequency plan is
 * not worth hiding, and hiding it would make the page useless.
 */
export const displayValue = (setting: Setting, env: Env): string => {
  const value = effectiveValue(setting, env);
  if (value === null) return "nicht gesetzt";
  if (setting.kind === "secret") return describeSecret(value);
  if (setting.kind === "dsn") return maskDsn(value);
  return value;
};

//====================================
// WHAT THE PAGE CAN NOTICE BY ITSELF
//====================================

/**
 * Problems the application can see in its own configuration.
 *
 * Only things that are wrong or nearly always wrong - a page that warns about
 * everything is one nobody reads. Each entry names the setting it belongs to, so
 * the page can put it where the eye already is.
 */
export const warningsFor = (setting: Setting, env: Env): string[] => {
  const value = effectiveValue(setting, env);
  const warnings: string[] = [];

  if (setting.key === "TTN_URL" && value?.includes("/console/")) {
    warnings.push(
      "Das ist die Adresse der Weboberfläche, nicht der API. Erwartet wird nur " +
        "der Cluster-Ursprung, etwa https://eu1.cloud.thethings.network – mit " +
        "diesem Wert geht jeder Aufruf ins Leere.",
    );
  }
  if (setting.key === "LDAP_TLS_REJECT_UNAUTHORIZED" && value === "false") {
    warnings.push(
      "Zertifikate des Verzeichnisses werden nicht geprüft. Nur gegen ein " +
        "Testverzeichnis vertretbar.",
    );
  }
  if (setting.key === "TRUSTED_PROXIES" && value === "0") {
    warnings.push(
      "Steht die Anwendung hinter einem Proxy, zählt die Anmeldesperre alle " +
        "Besucher als einen – sechs falsche Passwörter sperren dann die ganze " +
        "Seite aus.",
    );
  }
  if (setting.key === "SESSION_TTL_HOURS") {
    const hours = Number(value);
    if (Number.isFinite(hours) && hours > 24 * 30) {
      warnings.push(
        "Eine Sitzung, die länger als einen Monat gilt, überlebt auch einen " +
          "Gruppenentzug im Verzeichnis so lange.",
      );
    }
  }
  if (setting.key === "ADMIN_PW" && value !== null) {
    warnings.push(
      rawValue("ADMIN_PASSWORD_HASH", env) !== null
        ? "Wird nicht benutzt, weil ADMIN_PASSWORD_HASH gesetzt ist – entfernen, " +
            "damit das Klartextpasswort nicht in der Umgebung liegen bleibt."
        : "Das Passwort steht im Klartext in der Umgebung. Wer sie lesen kann – " +
            "über docker inspect, die Container-Oberfläche oder eine Kopie der " +
            "compose-Datei – meldet sich als Administrator an. Besser " +
            "ADMIN_PASSWORD_HASH; erzeugen mit scripts/hash-password.ts.",
    );
  }
  if (
    setting.key === "TTN_APPLICATION_ID" &&
    value !== null &&
    (value.includes("/") || value.includes("."))
  ) {
    warnings.push(
      "Erwartet wird nur die Kennung der Application, etwa „loramint\" – kein " +
        "Pfad und keine Adresse.",
    );
  }

  return warnings;
};

//====================================
// THE TRAFFIC LIGHTS
//====================================

export type FeatureState = {
  label: string;
  on: boolean;
  /** Why it is on or off, naming the setting responsible. */
  because: string;
};

/**
 * Which optional features are switched on, and by what.
 *
 * The second half is the point. "Geräteverwaltung AUS" alone sends somebody
 * hunting through three files; "AUS – TTN_API_KEY fehlt" ends the search. This
 * block is the answer to the question that cost an evening after the 1.6.1
 * deployment.
 */
export const featureStates = (env: Env): FeatureState[] => {
  const set = (key: string) => {
    const setting = settingFor(key);
    if (setting === undefined) return false;
    return effectiveValue(setting, env) !== null;
  };

  const ttnKey = set("TTN_API_KEY");
  const ttnApp = set("TTN_APPLICATION_ID");
  const missingTtn = [
    ...(ttnKey ? [] : ["TTN_API_KEY"]),
    ...(ttnApp ? [] : ["TTN_APPLICATION_ID"]),
  ];

  // A flag setting is on unless it says "false" - the same reading config.ts
  // applies, so the block cannot disagree with the application.
  const flagOn = (key: string) => {
    const setting = settingFor(key);
    return setting === undefined || effectiveValue(setting, env) !== "false";
  };
  const editingOn = flagOn("DATA_EDITING_ENABLED");
  const consoleOn = flagOn("SQL_CONSOLE_ENABLED");

  const setupUser = set("ADMIN_USERNAME");
  const setupHash = set("ADMIN_PASSWORD_HASH");
  const setupPlain = set("ADMIN_PW");

  return [
    {
      label: "Einrichtungskonto",
      on: setupUser && (setupHash || setupPlain),
      because: !setupUser
        ? "ADMIN_USERNAME fehlt – ohne Verzeichnis gibt es dann gar keine Anmeldung"
        : setupHash
          ? "ADMIN_USERNAME und ADMIN_PASSWORD_HASH gesetzt"
          : setupPlain
            ? "ADMIN_USERNAME und ADMIN_PW gesetzt – das Passwort steht im Klartext in der Umgebung"
            : "ADMIN_USERNAME gesetzt, aber weder ADMIN_PASSWORD_HASH noch ADMIN_PW",
    },
    {
      label: "Anmeldung (LDAP)",
      on: set("LDAP_URL"),
      because: set("LDAP_URL")
        ? "LDAP_URL gesetzt"
        : "LDAP_URL fehlt – ohne Anmeldung gibt es keinen Verwaltungsbereich",
    },
    // Both used to be decided by whether a connection string was configured.
    // The roles are derived and always exist now, so what is left to decide is a
    // setting - and "off" here means somebody chose it, not that something is
    // missing.
    {
      label: "Daten ändern",
      on: editingOn,
      because: editingOn
        ? "eingeschaltet – Messwerte und Logeinträge sind änderbar"
        : "durch DATA_EDITING_ENABLED abgeschaltet – die Verwaltungsseiten öffnen nur lesend",
    },
    {
      label: "SQL-Seite",
      on: consoleOn,
      because: consoleOn
        ? "eingeschaltet – für Administratoren auf einer schreibenden Verbindung"
        : "durch SQL_CONSOLE_ENABLED abgeschaltet",
    },
    {
      label: "Geräteverwaltung",
      on: ttnKey && ttnApp,
      because:
        missingTtn.length === 0
          ? "TTN_API_KEY und TTN_APPLICATION_ID gesetzt"
          : `${missingTtn.join(" und ")} fehlt – die Seite bleibt eine Ankündigung`,
    },
    {
      label: "Rechtsseiten",
      on: set("LEGAL_IMPRESSUM") || set("LEGAL_DATENSCHUTZ"),
      because:
        set("LEGAL_IMPRESSUM") && set("LEGAL_DATENSCHUTZ")
          ? "Impressum und Datenschutz gesetzt"
          : set("LEGAL_IMPRESSUM")
            ? "nur LEGAL_IMPRESSUM gesetzt"
            : set("LEGAL_DATENSCHUTZ")
              ? "nur LEGAL_DATENSCHUTZ gesetzt"
              : "weder LEGAL_IMPRESSUM noch LEGAL_DATENSCHUTZ gesetzt",
    },
  ];
};
