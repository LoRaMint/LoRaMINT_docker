import Layout from "../../components/layout/Layout";
import TableFrame, { EmptyRow } from "../../components/TableFrame";
import LocalTime from "../../components/LocalTime";
import PageHeading from "../../components/PageHeading";
import type { LogEntry, TokenAction } from "../../../services/api-tokens";

const ACTIONS: Record<TokenAction, string> = {
  create: "angelegt",
  delete: "gelöscht",
  grant: "Freigabe erteilt",
  revoke: "Freigabe entzogen",
  extend: "verlängert",
  visibility: "Sichtbarkeit geändert",
  reveal: "Wert offengelegt",
  announce: "bekannt gemacht",
  unannounce: "Bekanntmachung zurückgezogen",
};

/** The one line under an entry that says what actually changed. */
const detailOf = (entry: LogEntry): string | null => {
  const details = entry.details;
  if (entry.action === "grant") {
    const filter = (details.filter ?? {}) as Record<string, string>;
    const parts = Object.entries(filter).map(([key, value]) => `${key}=${value}`);
    return parts.length === 0 ? "alles der Gruppe" : parts.join(", ");
  }
  if (entry.action === "extend" || entry.action === "create") {
    return typeof details.expiresAt === "string"
      ? `läuft ab ${new Date(details.expiresAt).toLocaleDateString("de-DE")}`
      : null;
  }
  if (entry.action === "visibility") {
    return details.visibility === "signed_in" ? "alle Angemeldeten" : "nur die eigene Gruppe";
  }
  return null;
};

/**
 * Every change to the permission structure, and nothing else.
 *
 * **Read-only, and not because a button is missing.** The database role behind
 * these pages holds SELECT and INSERT on the table and nothing more, so an
 * entry cannot be edited or removed afterwards - see scripts/ensure-roles.ts.
 * There is no "undo" either, unlike the change log for measurements: a
 * withdrawn permission is not taken back, it is granted anew, and both stand
 * here afterwards.
 *
 * The entries outlive the tokens they describe. They hold the token's id and
 * name as plain values rather than a reference, so deleting a token - which any
 * group member may do - cannot erase its own trail.
 */
export default function TokenHistoryPage(props: { entries: LogEntry[] }) {
  return (
    <Layout>
      <PageHeading
        title="API-Token: Historie"
        back={{ href: "/management/tokens", label: "Zurück zu den Token" }}
        intro={
          <>
            Wer wann welche Berechtigung erteilt, entzogen oder ein Token
            angelegt hat. Nur einsehbar – Einträge lassen sich nicht ändern oder
            entfernen, und sie bleiben stehen, wenn das Token gelöscht wird.
          </>
        }
      />

      <TableFrame>
        <thead>
          <tr>
            <th>Wann</th>
            <th>Wer</th>
            <th>Was</th>
            <th>Token</th>
            <th>Gruppe</th>
          </tr>
        </thead>
        <tbody>
          {props.entries.length === 0 ? (
            <EmptyRow columns={5}>Noch keine Einträge</EmptyRow>
          ) : (
            props.entries.map((entry) => {
              const detail = detailOf(entry);
              return (
                <tr>
                  <td class="whitespace-nowrap text-base-content/70">
                    <LocalTime at={entry.occurredAt} />
                  </td>
                  <td>{entry.displayName ?? entry.username}</td>
                  <td>
                    {ACTIONS[entry.action]}
                    {detail && (
                      <div class="text-xs text-base-content/60">{detail}</div>
                    )}
                  </td>
                  <td>{entry.tokenName}</td>
                  <td>{entry.groupName ? <code>{entry.groupName}</code> : "–"}</td>
                </tr>
              );
            })
          )}
        </tbody>
      </TableFrame>
    </Layout>
  );
}
