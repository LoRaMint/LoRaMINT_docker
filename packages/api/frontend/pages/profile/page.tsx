import type { JSX } from "solid-js";
import Layout from "../../components/layout/Layout";
import type { Session } from "../../../lib";
import type { Role } from "../../../lib/roles";

/**
 * Everything the application knows about the signed-in user - which is exactly
 * what fits in the session cookie, and nothing else. There is no user table.
 *
 * That makes the page worth having beyond curiosity: it is the only way to see
 * which groups were picked up at sign-in and therefore why something is or is
 * not reachable, and when the session runs out.
 */

function Row(props: { label: string; children: JSX.Element }) {
  return (
    <div class="grid sm:grid-cols-[14rem_1fr] gap-1 sm:gap-4 py-3 border-b border-base-300">
      <div class="text-base-content/70">{props.label}</div>
      <div>{props.children}</div>
    </div>
  );
}

const formatDateTime = (date: Date) =>
  date.toLocaleString("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  });

export default function ProfilePage(props: { user: Session; roles: Role[] }) {
  return (
    <Layout>
      <h2 class="text-xl font-bold border-b border-base-300 pb-2 mb-4 mt-8">
        Profil
      </h2>
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

        <Row label="Anmeldung gültig bis">
          {formatDateTime(props.user.expiresAt)}
        </Row>
      </div>

      <div class="max-w-3xl mt-6 text-sm text-base-content/60">
        <p class="mb-2">
          Mehr wird nicht gespeichert: kein Passwort, kein Verlauf, kein Eintrag
          in der Datenbank. Die Angaben oben stehen ausschließlich in deinem
          Sitzungs-Cookie, signiert, damit sie nicht verändert werden können.
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
