import Layout from "../../components/layout/Layout";
import Row from "../../components/Row";
import LocalTime from "../../components/LocalTime";
import PageHeading from "../../components/PageHeading";
import Field from "../../components/Field";
import Notice from "../../components/Notice";
import { formatEui, formatHex } from "../../../lib/ttn-ids";
import type { TtnDeviceDetail } from "../../../services/ttn";
import { DEVICE_MESSAGES } from "./devices-page";
import SectionHeading from "../../components/SectionHeading";

/**
 * One device, laid out the way the TTN console lays it out - general
 * information, then activation information - so that someone who has both open
 * is looking at the same thing twice rather than at two different things.
 *
 * The AppKey is the one part that is a secret. It is not on the page: it is
 * fetched from the Join Server only when an administrator presses the button,
 * and only into that one response. Everyone else sees a sentence saying so
 * rather than a greyed-out control, because a disabled button invites a click
 * and then explains nothing.
 */

export default function DevicePage(props: {
  device: TtnDeviceDetail;
  activity: { count: number; lastSeen: Date | null };
  /** False when nothing can be written, because nothing could be logged. */
  writable: boolean;
  /** Whether this visitor may reveal the AppKey at all. */
  maySeeKey: boolean;
  /** Present only in the response to the reveal button. */
  appKey?: string | null;
  keyError?: string | null;
  message?: string | null;
}) {
  const device = props.device;
  const path = `/management/devices/${encodeURIComponent(device.deviceId)}`;
  const message = props.message ? DEVICE_MESSAGES[props.message] : undefined;
  // A device the Network Server does not know is the half-registered state
  // services/ttn.ts guards against - worth naming, because the module will never
  // join and nothing else on this page would say why.
  const incomplete = device.frequencyPlan === null;

  return (
    <Layout>
      <PageHeading
        title={device.name ?? device.deviceId}
        back={{ href: "/management/devices", label: "Geräte verwalten" }}
      />

      {message && <Notice tone={message.tone}>{message.text}</Notice>}

      {incomplete && (
        <Notice tone="warning">
          Der Network Server kennt dieses Gerät nicht. Es ist damit nur halb
          registriert und wird nicht joinen – vermutlich der Rest eines
          abgebrochenen Anlegevorgangs. In der TTN-Console entfernen und neu
          anlegen.
        </Notice>
      )}

      <SectionHeading>Allgemein</SectionHeading>
      <div class="rounded-box border border-base-300 px-4 py-2">
        <Row label="Geräte-ID">
          <span class="font-mono text-sm">{device.deviceId}</span>
        </Row>
        <Row label="Frequenzplan">{device.frequencyPlan ?? "–"}</Row>
        <Row label="LoRaWAN-Version">{device.lorawanVersion ?? "–"}</Row>
        <Row label="Regional Parameters">{device.regionalParameters ?? "–"}</Row>
        <Row label="Angelegt am">
          {device.createdAt ? <LocalTime at={device.createdAt} /> : "–"}
        </Row>
      </div>

      <SectionHeading>Aktivierung</SectionHeading>
      <div class="rounded-box border border-base-300 px-4 py-2">
        <Row label="AppEUI / JoinEUI">
          <span class="font-mono text-sm">
            {device.joinEui ? formatEui(device.joinEui) : "–"}
          </span>
        </Row>
        <Row label="DevEUI">
          <span class="font-mono text-sm">
            {device.devEui ? formatEui(device.devEui) : "–"}
          </span>
        </Row>
        <Row label="AppKey">
          {props.appKey ? (
            <div>
              <span class="font-mono text-sm break-all">
                {formatHex(props.appKey)}
              </span>
              <p class="text-xs text-base-content/60 mt-1">
                Nur in dieser Ansicht sichtbar – ein Neuladen der Seite verdeckt
                ihn wieder.
              </p>
            </div>
          ) : props.maySeeKey ? (
            <form method="post" action={`${path}/key`}>
              <button type="submit" class="btn btn-sm btn-outline">
                AppKey anzeigen
              </button>
              {props.keyError && (
                <span class="text-sm text-error ml-3">{props.keyError}</span>
              )}
            </form>
          ) : (
            <span class="text-base-content/60">
              Verdeckt. Den AppKey einzusehen ist Administratoren vorbehalten –
              er steht auch auf dem Modul und in der TTN-Console.
            </span>
          )}
        </Row>
      </div>

      <SectionHeading>Messwerte</SectionHeading>
      <div class="rounded-box border border-base-300 px-4 py-2">
        <Row label="Zuletzt empfangen">
          {props.activity.lastSeen ? (
            <LocalTime at={props.activity.lastSeen} />
          ) : (
            "Noch nichts empfangen."
          )}
        </Row>
        <Row label="Anzahl">{props.activity.count}</Row>
        <Row label="">
          {device.devEui ? (
            <a
              href={`/management/data/measurements?device_eui=${device.devEui}`}
              class="link"
            >
              Messwerte dieses Geräts ansehen
            </a>
          ) : (
            "–"
          )}
        </Row>
      </div>

      <SectionHeading>Umbenennen</SectionHeading>
      {props.writable ? (
        <form method="post" action={`${path}/rename`} class="max-w-2xl grid gap-2">
          <Field label="Name">
            <input
              type="text"
              name="name"
              value={device.name ?? ""}
              autocomplete="off"
              class="input w-full"
            />
          </Field>
          <Field
            label="Grund"
            hint="Steht im Geräteprotokoll. Die Messwerte bleiben unberührt – nur die Bezeichnung in TTN ändert sich."
          >
            <input
              type="text"
              name="reason"
              autocomplete="off"
              class="input w-full"
            />
          </Field>
          <div>
            <button type="submit" class="btn btn-primary">
              Namen speichern
            </button>
          </div>
        </form>
      ) : (
        <p class="text-base-content/70 max-w-3xl">
          Zum Umbenennen fehlt die Verbindung, über die der Vorgang protokolliert
          wird (<code>DATABASE_URL_MANAGE</code>).
        </p>
      )}
    </Layout>
  );
}
