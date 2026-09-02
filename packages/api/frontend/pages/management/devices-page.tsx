import Layout from "../../components/layout/Layout";
import TableFrame, { EmptyRow } from "../../components/TableFrame";
import LocalTime from "../../components/LocalTime";
import PageHeading from "../../components/PageHeading";
import Notice from "../../components/Notice";
import Planned from "../../components/Planned";
import { formatEui } from "../../../lib/ttn-ids";

/**
 * The devices, from both sides at once.
 *
 * The TTN console can already list what is registered, and the data pages can
 * already show what has arrived. What neither can do is put the two next to each
 * other, and that is where the interesting cases live: a device registered
 * months ago that has never sent anything, and measurements piling up under an
 * EUI nobody can find in the console any more. This page exists for those two
 * rows, not for the ones where everything is fine.
 */

//====================================
// MESSAGES
//====================================

/**
 * Feedback travels as a code in the query string and becomes a fixed sentence
 * here, exactly like on the data pages. Nothing a caller supplies is rendered.
 */
export const DEVICE_MESSAGES: Record<
  string,
  { text: string; tone: "success" | "error" }
> = {
  renamed: { text: "Gerät umbenannt.", tone: "success" },
  assigned: {
    text:
      "Zuordnung gespeichert. Sie gilt für Messwerte, die ab jetzt eintreffen – " +
      "bereits empfangene behalten ihre bisherige Gruppe.",
    tone: "success",
  },
  notagroup: {
    text:
      "Die gewählte Gruppe ist nicht als Datengruppe erklärt. Erst unter " +
      "Verwaltung → Datengruppen eintragen.",
    tone: "error",
  },
  renamefailed: {
    text:
      "The Things Network hat das Umbenennen abgelehnt. Der Name ist unverändert; " +
      "was TTN gesagt hat, steht im Geräteprotokoll.",
    tone: "error",
  },
  nowrite: {
    text:
      "Auf diesem Server ist keine Verbindung zum Protokollieren eingerichtet. " +
      "Ohne sie lässt sich kein Gerätevorgang festhalten, und ohne Protokoll " +
      "wird keiner ausgeführt.",
    tone: "error",
  },
  noreason: {
    text:
      "Ohne Grund geht es nicht: er steht später im Geräteprotokoll und ist das " +
      "Einzige, was den Vorgang dort erklärt. Es wurde nichts geändert.",
    tone: "error",
  },
  badrequest: { text: "Die Anfrage war nicht eindeutig.", tone: "error" },
  nochange: { text: "Der Name war schon so.", tone: "success" },
};

//====================================
// ROWS
//====================================

/**
 * What a device looks like once both sides have been consulted.
 *
 *   active   registered in TTN and something arrived recently.
 *   silent   registered in TTN, but nothing arrived, or nothing for a long time.
 *   orphan   measurements under an EUI TTN does not know - no `deviceId`.
 */
export type DeviceState = "active" | "silent" | "orphan";

export type DeviceRow = {
  deviceId: string | null;
  name: string | null;
  devEui: string | null;
  state: DeviceState;
  count: number;
  lastSeen: Date | null;
};

const STATE: Record<DeviceState, { label: string; badge: string; title: string }> = {
  active: {
    label: "aktiv",
    badge: "badge-success",
    title: "In TTN registriert, und es kommen Messwerte an.",
  },
  silent: {
    label: "stumm",
    badge: "badge-warning",
    title:
      "In TTN registriert, aber es kommt nichts (mehr) an – der Aufbau steht " +
      "noch im Schrank, oder er ist defekt.",
  },
  orphan: {
    label: "verwaist",
    badge: "badge-error",
    title:
      "Messwerte unter einer DevEUI, die in TTN nicht (mehr) registriert ist.",
  },
};

//====================================
// PAGE
//====================================

export default function ManageDevicesPage(props: {
  /** False when this server has no TTN key configured. */
  enabled: boolean;
  /** False when nothing can be written, because nothing could be logged. */
  writable: boolean;
  rows: DeviceRow[];
  /** What TTN said when the list could not be fetched. */
  error?: string | null;
  message?: string | null;
}) {
  const message = props.message ? DEVICE_MESSAGES[props.message] : undefined;

  if (!props.enabled) {
    return (
      <Layout>
        <Planned
          title="Geräte verwalten"
          intro={
            <>
              Geräte hier anlegen und umbenennen, statt dafür in die TTN-Console
              zu wechseln. Die Seite spricht dazu die REST-API von The Things
              Network an; die Geräte selbst bleiben in TTN registriert, diese
              Anwendung sieht sie nur.
            </>
          }
          features={[
            {
              label: "Übersicht",
              description:
                "Die in TTN registrierten Geräte neben denen anzeigen, von denen " +
                "tatsächlich Messwerte eintreffen – so fallen Karteileichen auf.",
            },
            {
              label: "Gerät anlegen",
              description:
                "Ein neues Gerät in der TTN-Application registrieren – DevEUI, " +
                "AppEUI und AppKey vom Modul eintragen.",
            },
            {
              label: "Gerät umbenennen",
              description:
                "Die Bezeichnung eines Geräts ändern, ohne seine Messdaten zu berühren.",
            },
            {
              label: "Gerät entfernen",
              description:
                "Noch nicht hier: Löschen sind vier Aufrufe an vier Server und " +
                "bleibt vorerst der TTN-Console vorbehalten.",
            },
          ]}
          note={
            <>
              Dafür braucht der Server einen TTN-API-Schlüssel mit Schreibrechten
              auf die Application (<code>TTN_API_KEY</code>) und die Kennung der
              Application (<code>TTN_APPLICATION_ID</code>). Bis die konfiguriert
              sind, bleibt die Seite eine Ankündigung.
            </>
          }
        />
      </Layout>
    );
  }

  return (
    <Layout>
      <PageHeading
        title="Geräte verwalten"
        intro={
          <>
            Was in The Things Network registriert ist, neben dem, was tatsächlich
            sendet. Die Geräte bleiben in TTN; diese Seite legt sie dort an,
            benennt sie um und zeigt sie – gelöscht wird weiterhin in der Console.
          </>
        }
      />

      {message && <Notice tone={message.tone}>{message.text}</Notice>}

      {props.error && (
        <Notice tone="error">
          Die Geräteliste konnte nicht geladen werden: {props.error}
        </Notice>
      )}

      {!props.writable && !props.error && (
        <Notice tone="warning">
          Diese Seite zeigt nur an. Zum Anlegen und Umbenennen fehlt die
          Verbindung, über die der Vorgang protokolliert wird
          (<code>DATABASE_URL_MANAGE</code>) – und was nicht protokolliert werden
          kann, wird hier nicht ausgeführt.
        </Notice>
      )}

      <div class="flex flex-wrap gap-3 mb-4">
        {props.writable && (
          <a href="/management/devices/new" class="btn btn-primary btn-sm">
            Gerät anlegen
          </a>
        )}
        <a href="/management/devices/log" class="btn btn-ghost btn-sm">
          Geräteprotokoll
        </a>
      </div>

      <TableFrame>
          <thead>
            <tr>
              <th>Name</th>
              <th>Geräte-ID</th>
              <th>DevEUI</th>
              <th>Letzter Messwert</th>
              <th class="text-right">Messwerte</th>
              <th>Zustand</th>
            </tr>
          </thead>
          <tbody>
            {props.rows.length === 0 && (
              <EmptyRow columns={6}>In dieser Application ist noch kein Gerät registriert, und
                  Messwerte sind auch keine da.</EmptyRow>
            )}
            {props.rows.map((row) => (
              <tr>
                <td>
                  {row.deviceId ? (
                    <a
                      href={`/management/devices/${encodeURIComponent(row.deviceId)}`}
                      class="link no-underline"
                    >
                      {row.name ?? row.deviceId}
                    </a>
                  ) : (
                    <span class="text-base-content/70 italic">
                      nicht in TTN
                    </span>
                  )}
                </td>
                <td class="font-mono text-xs">{row.deviceId ?? "–"}</td>
                <td class="font-mono text-xs whitespace-nowrap">
                  {row.devEui ? (
                    <a
                      href={`/management/data/measurements?device_eui=${row.devEui}`}
                      class="link no-underline"
                      title="Messwerte dieses Geräts"
                    >
                      {formatEui(row.devEui)}
                    </a>
                  ) : (
                    "–"
                  )}
                </td>
                <td class="whitespace-nowrap">
                  {row.lastSeen ? <LocalTime at={row.lastSeen} /> : "–"}
                </td>
                <td class="text-right">{row.count}</td>
                <td>
                  <span
                    class={`badge badge-sm ${STATE[row.state].badge}`}
                    title={STATE[row.state].title}
                  >
                    {STATE[row.state].label}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </TableFrame>

      <p class="text-sm text-base-content/70 mt-3 max-w-3xl">
        „stumm" heisst: in TTN registriert, aber in den letzten 24 Stunden kam
        nichts an. „verwaist" heisst: es kommen Messwerte unter einer DevEUI an,
        die in TTN nicht registriert ist – die Werte bleiben erhalten, aber
        niemand kann das Gerät dort noch konfigurieren.
      </p>
    </Layout>
  );
}
