import type { JSX } from "solid-js";
import Layout from "../../components/layout/Layout";
import Row from "../../components/Row";
import Notice from "../../components/Notice";
import LocalTime from "../../components/LocalTime";
import type { Session } from "../../../lib";
import { COMMON_ZONES, otherZones } from "../../../lib";
import type { Role } from "../../../lib/roles";
import type { UserRecord } from "../../../services";
import SectionHeading from "../../components/SectionHeading";
import PageHeading from "../../components/PageHeading";

/**
 * What the application knows about the signed-in user, and the two things they
 * may change about it.
 *
 * The page is worth having beyond curiosity: it is the only place to see which
 * groups were picked up at sign-in and therefore why something is or is not
 * reachable, and when the session runs out.
 *
 * Note what is *not* editable here. Groups decide what somebody may do and,
 * later, which measurements they may see; they come from the directory and no
 * page in this application can write them. The two fields below decide how a
 * page looks. Keeping the two on the same screen but only one of them writable
 * is deliberate - see docs/benutzereinstellungen.md.
 */

export default function ProfilePage(props: {
  user: Session;
  roles: Role[];
  record: UserRecord | null;
  /** The declared data groups this user is in - directory ∩ declaration. */
  dataGroups: string[];
  saved?: boolean;
  error?: string;
}) {
  // The session is the copy that was signed at the last save, so it and the row
  // agree. The row is preferred anyway: it is the source, and it is right even
  // in the one case they can differ - a save that went through while an older
  // cookie was still in flight.
  const timezone = props.record?.timezone ?? props.user.timezone ?? "";
  const darkMode = props.record?.darkMode ?? props.user.darkMode ?? false;

  // A handful of likely answers first, then everything the platform knows. The
  // shortlist alone would leave anybody outside it without a way in; the full
  // list alone buries the one plausible choice among four hundred.
  const rest = otherZones();

  // Whatever is stored belongs in the list even when neither contains it - a zone
  // the tz database has since dropped, say - or the form would silently change it
  // on the next save.
  const known = new Set<string>([...COMMON_ZONES, ...rest]);
  const stranded = timezone && !known.has(timezone) ? timezone : null;

  return (
    <Layout>
      <PageHeading title="Profil" />

      {props.saved && <Notice tone="success">Einstellungen gespeichert.</Notice>}
      {props.error && <Notice tone="error">{props.error}</Notice>}

      <div class="max-w-3xl">
        <Row label="Anmeldename">
          <code>{props.user.username}</code>
        </Row>

        <Row label="Anzeigename">
          {props.user.displayName === props.user.username ? (
            <span class="text-base-content/60">
              {props.user.displayName} (kein eigener Anzeigename im Verzeichnis)
            </span>
          ) : (
            props.user.displayName
          )}
        </Row>

        <Row label="Gruppen im Verzeichnis">
          {props.user.groups.length === 0 ? (
            <span class="text-base-content/60">keine</span>
          ) : (
            <div class="flex flex-wrap gap-2">
              {props.user.groups.map((group) => (
                <code class="rounded-box border border-base-300 px-2 py-0.5 text-sm">
                  {group}
                </code>
              ))}
            </div>
          )}
        </Row>

        {/* The other axis, and the reason both are shown side by side: one
            says what this person may do, the other which data it is about. */}
        <Row label="Datengruppen">
          {props.dataGroups.length === 0 ? (
            <span class="text-base-content/60">
              keine – deine Verzeichnisgruppen sind (noch) nicht als
              Datengruppen erklärt
            </span>
          ) : (
            <div class="flex flex-wrap gap-2">
              {props.dataGroups.map((group) => (
                <code class="rounded-box border border-base-300 px-2 py-0.5 text-sm">
                  {group}
                </code>
              ))}
            </div>
          )}
        </Row>

        <Row label="Anmeldung gültig bis">
          <LocalTime at={props.user.expiresAt} />
        </Row>

        {props.record && (
          <Row label="Erstmals angemeldet">
            <LocalTime at={props.record.createdAt} />
          </Row>
        )}
      </div>

      <SectionHeading>
        Darstellung
      </SectionHeading>

      <form method="post" action="/profile" class="max-w-3xl">
        <Row label="Zeitzone" for="timezone">
            <select
              id="timezone"
              name="timezone"
              class="select w-full max-w-xs"
            >
              <option value="" selected={timezone === ""}>
                Zeitzone des Browsers
              </option>
              {stranded && (
                <optgroup label="Gespeichert">
                  <option value={stranded} selected>
                    {stranded}
                  </option>
                </optgroup>
              )}
              <optgroup label="Häufig">
                {COMMON_ZONES.map((zone) => (
                  <option value={zone} selected={zone === timezone}>
                    {zone}
                  </option>
                ))}
              </optgroup>
              {rest.length > 0 && (
                <optgroup label="Alle Zeitzonen">
                  {rest.map((zone) => (
                    <option value={zone} selected={zone === timezone}>
                      {zone}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            <p class="text-sm text-base-content/60 mt-2">
              Gespeichert wird immer UTC – die Einstellung betrifft nur die
              Anzeige. Zeiten, die in einer <em>anderen</em> Zone stehen, tragen
              das Kürzel dahinter; in deiner eigenen Zone steht keines.
            </p>
          </Row>

        <Row label="Farbschema" for="dark-mode">
            {/* Named at both ends rather than left as a bare switch. On its own a
                toggle says it is on or off but not what of; with a word on each
                side the knob sits beside the one that applies, so the position
                carries the meaning and no script has to keep a caption in step
                while somebody flips it back and forth before saving.

                Plain spans, not labels: the row label above is already tied to
                the input, and a second one would leave assistive technology
                announcing "Farbschema Hell Dunkel" as the name of the control. */}
            <div class="inline-flex items-center gap-3">
              <span class={darkMode ? "text-base-content/50" : "font-medium"}>
                Hell
              </span>
              <input
                id="dark-mode"
                name="darkMode"
                type="checkbox"
                value="on"
                checked={darkMode}
                class="toggle"
              />
              <span class={darkMode ? "font-medium" : "text-base-content/50"}>
                Dunkel
              </span>
            </div>
            <p class="text-sm text-base-content/60 mt-2">
              Gilt für diesen Browser auch nach dem Abmelden.
            </p>
          </Row>

        {/* In a row of its own rather than carrying the spacing itself: the
            button's own margin would collapse against the paragraph below,
            which sits outside the form, and the gap would come out smaller
            than it reads here. */}
        <div class="py-6">
          <button type="submit" class="btn btn-primary">
            Speichern
          </button>
        </div>
      </form>

      <div class="max-w-3xl mt-8 text-sm text-base-content/60">
        <p class="mb-2">
          Gespeichert werden dein Anmeldename, der Anzeigename aus dem
          Verzeichnis, der Zeitpunkt der letzten Anmeldung und die beiden
          Einstellungen oben. Kein Passwort und kein Verlauf. Deine Gruppen
          stehen ausschließlich im Sitzungs-Cookie, signiert, damit sie nicht
          verändert werden können.
        </p>
        <p>
          Gruppen werden nur bei der Anmeldung gelesen. Ändert sich im
          Verzeichnis etwas, wirkt das hier erst nach dem nächsten Anmelden –
          dafür genügt einmal abmelden und wieder anmelden.
        </p>
      </div>
    </Layout>
  );
}
