import Layout from "../../components/layout/Layout";
import TableFrame from "../../components/TableFrame";
import LocalTime from "../../components/LocalTime";
import PageHeading from "../../components/PageHeading";
import Notice from "../../components/Notice";
import SectionHeading from "../../components/SectionHeading";
import {
  GROUP_SECTIONS,
  type FeatureState,
  type Group,
  type Origin,
} from "../../../lib/config-catalog";

/** The fragment a category is reached under, and the panel's id. */
const panelId = (group: Group | "overview") => `bereich-${group}`;

/** One small outline icon per category, in the manner of the rest of the header. */
const ICONS: Record<Group | "overview", string> = {
  overview: "M3 12h4l3 8 4-16 3 8h4",
  setup: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M4 12h2m12 0h2m-8-8v2m0 12v2",
  auth: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8",
  core: "M4 7h16M4 12h16M4 17h16",
  manage: "M12 5c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3M4 8v8c0 1.7 3.6 3 8 3s8-1.3 8-3V8",
  sql: "M8 9l-4 3 4 3m8-6l4 3-4 3M14 5l-4 14",
  board: "M4 15a8 8 0 0 1 16 0M12 15l4-4",
  devices: "M6 4h12v16H6zM10 20h4",
  legal: "M6 3h9l3 3v15H6zM14 3v4h4",
};

function Icon(props: { path: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="h-4 w-4 shrink-0 text-base-content/70"
      aria-hidden="true"
    >
      <path d={props.path} />
    </svg>
  );
}

/** A sidebar entry: icon, label, and how many settings sit behind it. */
function NavEntry(props: {
  group: Group | "overview";
  label: string;
  count?: number;
  /** Settings in this category that the page has something to complain about. */
  warnings?: number;
}) {
  return (
    <li>
      <a
        href={`#${panelId(props.group)}`}
        data-config-link
        class="flex items-center gap-2 md:gap-3 px-3 py-2 rounded-btn hover:bg-base-200 whitespace-nowrap"
      >
        <Icon path={ICONS[props.group]} />
        <span class="flex-1 truncate">{props.label}</span>
        {/* The count and the warning are two different things, so they are two
            different marks. One badge that meant "settings" here and "problems"
            there would be read as the wrong one every time. */}
        {props.warnings ? (
          <span
            class="badge badge-warning badge-xs px-1"
            title={`${props.warnings} Einstellung(en) mit einem Hinweis`}
          >
            !
          </span>
        ) : null}
        {props.count !== undefined ? (
          <span class="text-xs text-base-content/70 tabular-nums">
            {props.count}
          </span>
        ) : null}
      </a>
    </li>
  );
}

/**
 * What this server is actually configured with.
 *
 * Read out of the running process, not out of a document that can go stale. The
 * distinction the page exists for is the "Herkunft" column: it tells "stands at
 * 1 because somebody set 1" apart from "stands at 1 because that is the
 * default". Neither the compose file nor `.env.example` can answer that - the
 * first lists what is passed through, the second what could be set.
 *
 * Laid out as a sidebar of categories beside one panel at a time. Every panel is
 * in the document; the island at the bottom shows one and hides the rest, so
 * switching costs nothing and only a real change goes back to the server. Without
 * JavaScript the panels simply stand underneath each other and the sidebar links
 * are anchors that jump to them - which is the same page, only longer.
 *
 * What is editable here lives in the settings table; the rest is in the
 * environment and is shown, not offered. See docs/konfiguration-verwalten.md.
 */

export type ConfigRow = {
  key: string;
  meaning: string;
  /** Already redacted where it had to be - this page never receives a secret. */
  display: string;
  origin: Origin;
  required: boolean;
  /** True for secrets an administrator may reveal. */
  revealable: boolean;
  warnings: string[];
  /** True when this setting lives in the table and can be changed here. */
  editable: boolean;
  /** What to put in the input. Empty for secrets, which are never sent out. */
  editValue: string;
  /** True when the same name is still set in the environment, where it is ignored. */
  stranded: boolean;
  /** True for longer text: a box instead of a one-line field. */
  multiline: boolean;
  /** What somebody wrote down about this setting. */
  note: string;
  updatedBy: string | null;
  updatedAt: Date | null;
};

export type ConfigGroup = {
  group: Group;
  label: string;
  rows: ConfigRow[];
};

const ORIGIN: Record<Origin, { label: string; badge: string; title: string }> = {
  database: {
    label: "Datenbank",
    badge: "badge-success",
    title:
      "Hier eingestellt und in der Tabelle `settings` gespeichert – die " +
      "gleichnamige Umgebungsvariable wird für diese Einstellung ignoriert.",
  },
  environment: {
    label: "Umgebung",
    badge: "badge-neutral",
    title: "In der Umgebung gesetzt – dieser Wert kommt von aussen.",
    },
  default: {
    label: "Default",
    badge: "badge-ghost",
    title: "Nicht gesetzt; die Anwendung benutzt ihren eingebauten Wert.",
  },
  unset: {
    label: "nicht gesetzt",
    badge: "badge-warning",
    title: "Weder gesetzt noch mit einer Vorgabe versehen.",
  },
};

export default function ConfigPage(props: {
  features: FeatureState[];
  groups: ConfigGroup[];
  /** Set only in the answer to the reveal button, for exactly one setting. */
  revealed?: { key: string; value: string } | null;
  revealError?: string | null;
  /** False when no management connection is configured, so nothing can be saved. */
  writable: boolean;
  message?: { text: string; tone: "success" | "error" } | null;
  /**
   * Which category to open, when the server already knows better than the
   * address bar does.
   *
   * The answer to the reveal button is a freshly rendered page reached by POST,
   * so it carries no fragment and the island would otherwise fall back to the
   * first category - throwing the reader back to the overview at the exact
   * moment they asked to see something specific.
   */
  openGroup?: Group | null;
}) {
  return (
    <Layout>
      <PageHeading
        title="Konfiguration"
        intro={
          <>
            Was dieser Server tatsächlich benutzt – aus der laufenden Anwendung
            gelesen, nicht aus einer Datei, die veraltet sein kann. Was hier
            änderbar ist, liegt in der Datenbank; der Rest steht in der Umgebung
            und ist nur zu sehen.
          </>
        }
      />

      {props.message && (
        <Notice tone={props.message.tone}>{props.message.text}</Notice>
      )}

      {props.revealError && <Notice tone="error">{props.revealError}</Notice>}

      {!props.writable && (
        <Notice tone="warning">
          Diese Seite zeigt nur an. Zum Ändern fehlt die Verbindung, über die der
          Vorgang protokolliert wird (<code>DATABASE_URL_MANAGE</code>) – und was
          nicht protokolliert werden kann, wird hier nicht ausgeführt.
        </Notice>
      )}

      <div class="flex flex-col md:flex-row gap-6 mt-2">
        {/* The categories. Anchors, so without JavaScript they jump to the
            section; the island turns them into a switch. */}
        <nav
          data-config-nav
          data-config-open={props.openGroup ? panelId(props.openGroup) : undefined}
          class="md:w-64 md:shrink-0 border-b border-base-300 pb-2 md:border-b-0 md:pb-0 md:border-r md:pr-2"
          aria-label="Bereiche der Konfiguration"
        >
          {/* On a phone the categories are a strip that scrolls sideways: a
              vertical list of eight would push the settings themselves off the
              screen, and scrolling past the navigation to reach the content is
              the thing a sidebar is supposed to prevent. From `md` up it is the
              column beside the content. */}
          <div class="flex gap-1 overflow-x-auto md:block md:overflow-visible">
            <ul class="menu menu-sm p-0 gap-1 flex-row flex-nowrap md:flex-col">
              <NavEntry group="overview" label="Überblick" />
            </ul>
          {GROUP_SECTIONS.map((section) => {
            const groups = section.groups
              .map((g) => props.groups.find((group) => group.group === g))
              .filter((group): group is ConfigGroup => group !== undefined);
            if (groups.length === 0) return null;
            return (
              <>
                {/* The headings order a column; in a sideways strip they would
                    only be words between the buttons. */}
                <div class="hidden md:block px-3 pt-4 pb-1 text-xs uppercase tracking-wide text-base-content/70">
                  {section.label}
                </div>
                <ul class="menu menu-sm p-0 gap-1 flex-row flex-nowrap md:flex-col">
                  {groups.map((group) => (
                    <NavEntry
                      group={group.group}
                      label={group.label}
                      count={group.rows.length}
                      warnings={
                        group.rows.filter(
                          (row) => row.warnings.length > 0 || row.stranded,
                        ).length
                      }
                    />
                  ))}
                </ul>
              </>
            );
          })}
          </div>
        </nav>

        <div class="min-w-0 flex-1">
          {/* The block that answers "why is this feature off" without a search. */}
          <section id={panelId("overview")} data-config-panel>
            <SectionHeading>Funktionen</SectionHeading>
            <TableFrame>
                <tbody>
                  {props.features.map((feature) => (
                    <tr>
                      <td class="w-56 font-semibold">{feature.label}</td>
                      <td class="w-20">
                        <span
                          class={`badge badge-sm ${
                            feature.on ? "badge-success" : "badge-ghost"
                          }`}
                        >
                          {feature.on ? "an" : "aus"}
                        </span>
                      </td>
                      <td class="text-base-content/70">{feature.because}</td>
                    </tr>
                  ))}
                </tbody>
              </TableFrame>
            <p class="text-sm text-base-content/70 mt-3 max-w-3xl">
              Jede optionale Funktion mit ihrem Zustand und der Einstellung, die
              ihn verursacht. Die Einzelheiten stehen in den Bereichen links.
            </p>
          </section>

          {props.groups.map((group) => (
        <section id={panelId(group.group)} data-config-panel>
          <SectionHeading>{group.label}</SectionHeading>
          <TableFrame>
              <thead>
                <tr>
                  <th class="w-64">Name</th>
                  <th>Wirksamer Wert</th>
                  <th class="w-32">Herkunft</th>
                </tr>
              </thead>
              <tbody>
                {group.rows.map((row) => {
                  const revealed =
                    props.revealed?.key === row.key ? props.revealed.value : null;
                  return (
                    <tr class="align-top">
                      <td>
                        <div class="font-mono text-xs">{row.key}</div>
                        <div class="text-xs text-base-content/70 mt-1 max-w-md">
                          {row.meaning}
                        </div>
                      </td>
                      <td>
                        {revealed ? (
                          <div>
                            <span class="font-mono text-xs break-all">
                              {revealed}
                            </span>
                            <div class="text-xs text-base-content/70 mt-1">
                              Nur in dieser Ansicht sichtbar – ein Neuladen
                              verdeckt den Wert wieder.
                            </div>
                          </div>
                        ) : (
                          <div class="flex flex-wrap items-center gap-2">
                            <span
                              class={`font-mono text-xs break-all ${
                                row.origin === "unset"
                                  ? "text-base-content/70 italic"
                                  : ""
                              }`}
                            >
                              {row.display}
                            </span>
                            {row.revealable && (
                              <form
                                method="post"
                                action="/management/config/reveal"
                              >
                                <input
                                  type="hidden"
                                  name="key"
                                  value={row.key}
                                />
                                <button
                                  type="submit"
                                  class="btn btn-xs btn-outline"
                                >
                                  anzeigen
                                </button>
                              </form>
                            )}
                          </div>
                        )}
                        {/* Editing, for the settings that live in the table.
                            One small form per row rather than one big one: a
                            value is saved with the note that explains it, and a
                            mistake in one field cannot take the rest with it.
                            Works without JavaScript, like every other writing
                            path here. */}
                        {row.editable && props.writable && (
                          <form
                            method="post"
                            action="/management/config/save"
                            class={`gap-2 mt-2 ${
                              row.multiline
                                ? "flex flex-col items-start"
                                : "flex flex-wrap items-center"
                            }`}
                          >
                            <input type="hidden" name="key" value={row.key} />
                            {row.multiline ? (
                              <>
                                <textarea
                                  name="value"
                                  rows={14}
                                  spellcheck={false}
                                  placeholder="leer = die Seite gibt es nicht"
                                  class="textarea font-mono text-xs w-full max-w-3xl leading-relaxed"
                                  aria-label={`Inhalt von ${row.key}`}
                                >
                                  {row.editValue}
                                </textarea>
                                <div class="text-xs text-base-content/70 max-w-3xl">
                                  Markdown: <code># Überschrift</code>,{" "}
                                  <code>## Unterüberschrift</code>,{" "}
                                  <code>- Aufzählung</code>,{" "}
                                  <code>1. nummeriert</code>,{" "}
                                  <code>**fett**</code>, <code>*kursiv*</code>,{" "}
                                  <code>[Text](https://…)</code>,{" "}
                                  <code>---</code> für eine Trennlinie. Eine
                                  Leerzeile trennt Absätze; einzelne Umbrüche
                                  bleiben erhalten, damit eine Anschrift eine
                                  Anschrift bleibt. HTML wird als Text
                                  dargestellt, nicht ausgeführt.
                                </div>
                              </>
                            ) : (
                              <input
                                type={row.revealable ? "password" : "text"}
                                name="value"
                                value={row.editValue}
                                autocomplete="off"
                                spellcheck={false}
                                placeholder={
                                  row.revealable
                                    ? "unverändert lassen"
                                    : "leer = nicht gesetzt"
                                }
                                class="input input-xs font-mono w-72"
                                aria-label={`Wert für ${row.key}`}
                              />
                            )}
                            {/* A note, not a reason: it explains why the setting
                                stands where it stands and stays beside the value
                                it explains. Prefilled, so saving does not wipe
                                what was written before. */}
                            <input
                              type="text"
                              name="note"
                              value={row.note}
                              placeholder="Notiz – warum steht das so?"
                              autocomplete="off"
                              class="input input-xs w-64"
                              aria-label={`Notiz zu ${row.key}`}
                            />
                            <button type="submit" class="btn btn-xs btn-primary">
                              Speichern
                            </button>
                          </form>
                        )}
                        {!row.editable && row.note && (
                          <div class="text-xs text-base-content/70 mt-2 italic">
                            {row.note}
                          </div>
                        )}
                        {row.stranded && (
                          <div role="alert" class="text-xs text-warning mt-2 max-w-xl">
                            Diese Einstellung steht auch in der Umgebung, wird
                            dort aber <strong>nicht mehr gelesen</strong>. Am
                            besten dort entfernen – sonst liest sie jemand und
                            glaubt ihr.
                          </div>
                        )}
                        {row.updatedBy && row.updatedAt && (
                          <div class="text-xs text-base-content/70 mt-2">
                            Zuletzt geändert von {row.updatedBy} am{" "}
                            <LocalTime at={row.updatedAt} />
                          </div>
                        )}
                        {row.warnings.map((warning) => (
                          <div
                            role="alert"
                            class="text-xs text-warning mt-2 max-w-xl"
                          >
                            {warning}
                          </div>
                        ))}
                        {row.required && row.origin === "unset" && (
                          <div role="alert" class="text-xs text-error mt-2">
                            Erforderlich – ohne diesen Wert startet der Server
                            nicht.
                          </div>
                        )}
                      </td>
                      <td>
                        <span
                          class={`badge badge-sm ${ORIGIN[row.origin].badge}`}
                          title={ORIGIN[row.origin].title}
                        >
                          {ORIGIN[row.origin].label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </TableFrame>

          <p class="text-sm text-base-content/70 mt-3 max-w-3xl">
            „Datenbank" heisst, dass der Wert hier eingestellt wurde;
            „Umgebung", dass er von aussen kommt; „Default", dass die Anwendung
            ihren eingebauten Wert benutzt. Geheimnisse und
            Verbindungszeichenfolgen werden nie vollständig gerendert; was ein
            Administrator aufdeckt, steht nur in dieser einen Antwort und wird
            nirgends gespeichert.
          </p>
        </section>
          ))}
        </div>
      </div>

      {/* Turns the sidebar into a switch. Without it every category simply
          stands underneath the next and the links jump to them. */}
      <script type="module" src="/public/config.js"></script>
    </Layout>
  );
}
