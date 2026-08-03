/**
 * The switch between reading and editing a table.
 *
 * Two links, not a client-side toggle. In read mode the server renders the cells
 * as plain text: there are no input fields in the document at all, no disabled
 * ones and no `readonly` attributes that could be removed in the developer
 * tools. Nothing to touch is a stronger promise than something that refuses to
 * be touched.
 *
 * When the server cannot write at all - no management connection configured -
 * the switch is replaced by the reason, rather than by a button that would
 * explain nothing when it failed.
 */
export default function ModeSwitch(props: {
  editing: boolean;
  readHref: string;
  editHref: string;
  /** False when DATABASE_URL_MANAGE is unset on this server. */
  available: boolean;
}) {
  if (!props.available) {
    return (
      <p class="text-sm text-base-content/60 mb-4">
        Diese Ansicht ist auf diesem Server nur lesend – für das Ändern von Daten
        ist keine eigene Datenbankverbindung eingerichtet.
      </p>
    );
  }

  return (
    <div class="flex items-center gap-3 mb-4 flex-wrap">
      <div class="join">
        <a
          href={props.readHref}
          class={`btn btn-sm join-item ${props.editing ? "" : "btn-active"}`}
          aria-current={props.editing ? undefined : "true"}
        >
          Lesen
        </a>
        <a
          href={props.editHref}
          class={`btn btn-sm join-item ${props.editing ? "btn-active" : ""}`}
          aria-current={props.editing ? "true" : undefined}
        >
          Bearbeiten
        </a>
      </div>
      <span class="text-sm text-base-content/60">
        {props.editing
          ? "Zellen sind beschreibbar. Ungespeichertes geht beim Filtern und Blättern verloren."
          : "Nur ansehen – versehentlich lässt sich hier nichts ändern."}
      </span>
    </div>
  );
}
