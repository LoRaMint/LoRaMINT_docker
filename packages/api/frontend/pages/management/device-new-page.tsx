import Layout from "../../components/layout/Layout";
import PageHeading from "../../components/manage/PageHeading";
import Notice from "../../components/manage/Notice";
import type { DeviceInput } from "../../../lib/ttn-ids";

/**
 * Registering a device, from the numbers printed on the module.
 *
 * The LA66 boards ship with DevEUI, AppEUI and AppKey on them, and the TTN
 * console writes them in byte pairs, so these fields are filled by pasting
 * rather than by typing. They accept the spaces along with the value - see
 * lib/ttn-ids.ts - because refusing a paste over its formatting only buys a
 * retype, and a retyped 32-digit key is where the actual errors come from.
 *
 * Frequency plan and LoRaWAN versions are shown but not offered: they are
 * properties of the deployment, one per school, and a field would be four more
 * ways to register a device that never joins.
 */

/** One labelled input, with its problem underneath when it has one. */
function Field(props: {
  name: string;
  label: string;
  value: string;
  problem?: string;
  hint?: string;
  type?: string;
  mono?: boolean;
  autocomplete?: string;
}) {
  return (
    <label class="form-control w-full">
      <div class="label">
        <span class="label-text">{props.label}</span>
      </div>
      <input
        type={props.type ?? "text"}
        name={props.name}
        value={props.value}
        autocomplete={props.autocomplete ?? "off"}
        class={`input input-bordered w-full ${props.problem ? "input-error" : ""} ${
          props.mono ? "font-mono" : ""
        }`}
      />
      {props.problem ? (
        <div class="label">
          <span class="label-text-alt text-error">{props.problem}</span>
        </div>
      ) : props.hint ? (
        <div class="label">
          <span class="label-text-alt text-base-content/60">{props.hint}</span>
        </div>
      ) : null}
    </label>
  );
}

export default function DeviceNewPage(props: {
  /** What was submitted, so a rejected form comes back filled in. */
  values: DeviceInput;
  reason: string;
  /** Field name to sentence, from `deviceProblems`. */
  problems: Record<string, string>;
  /** Missing reason, reported like the data pages do. */
  reasonProblem?: string | null;
  /** What TTN or the log said, when the attempt got that far. */
  error?: string | null;
  radio: { frequencyPlan: string; lorawanVersion: string; regionalParameters: string };
}) {
  return (
    <Layout>
      <PageHeading
        title="Gerät anlegen"
        back={{ href: "/management/devices", label: "Geräte verwalten" }}
        intro={
          <>
            Die Kenncodes stehen auf dem Modul und dürfen mit Leerzeichen
            eingefügt werden, genau wie die TTN-Console sie zeigt.
          </>
        }
      />

      {props.error && <Notice tone="error">{props.error}</Notice>}

      {Object.keys(props.problems).length > 0 && (
        <Notice tone="error">
          Es wurde nichts angelegt. Bitte die markierten Felder prüfen.
        </Notice>
      )}

      <form
        method="post"
        action="/management/devices/new"
        class="max-w-2xl grid gap-2"
      >
        <Field
          name="name"
          label="Name"
          value={props.values.name}
          problem={props.problems.name}
          hint="Steht später in der Übersicht, etwa „Fenster 8b“."
        />
        <Field
          name="devEui"
          label="DevEUI"
          value={props.values.devEui}
          problem={props.problems.devEui}
          hint="16 Hexzeichen, z. B. A8 40 41 D6 C1 84 DB 82"
          mono
        />
        <Field
          name="joinEui"
          label="AppEUI / JoinEUI"
          value={props.values.joinEui}
          problem={props.problems.joinEui}
          hint="16 Hexzeichen, bei den LA66-Modulen für alle gleich."
          mono
        />
        <Field
          name="appKey"
          label="AppKey"
          value={props.values.appKey}
          problem={props.problems.appKey}
          hint="32 Hexzeichen. Wird an TTN weitergereicht und hier nicht gespeichert."
          type="password"
          autocomplete="new-password"
          mono
        />
        <Field
          name="deviceId"
          label="Geräte-ID"
          value={props.values.deviceId}
          problem={props.problems.deviceId}
          hint={
            "Die Kennung in TTN – Kleinbuchstaben, Ziffern und Bindestriche, " +
            "3 bis 36 Zeichen. Sie lässt sich später nicht mehr ändern."
          }
          mono
        />

        <div class="rounded-box border border-base-300 px-4 py-3 my-2 text-sm text-base-content/70">
          <p class="font-semibold text-base-content mb-1">
            Fest eingestellt für alle Geräte dieser Anwendung
          </p>
          <p>Frequenzplan: {props.radio.frequencyPlan}</p>
          <p>LoRaWAN-Version: {props.radio.lorawanVersion}</p>
          <p>Regional Parameters: {props.radio.regionalParameters}</p>
          <p>Aktivierung: OTAA</p>
        </div>

        <label class="form-control w-full">
          <div class="label">
            <span class="label-text">Grund</span>
          </div>
          <input
            type="text"
            name="reason"
            value={props.reason}
            autocomplete="off"
            class={`input input-bordered w-full ${
              props.reasonProblem ? "input-error" : ""
            }`}
          />
          <div class="label">
            <span
              class={`label-text-alt ${
                props.reasonProblem ? "text-error" : "text-base-content/60"
              }`}
            >
              {props.reasonProblem ??
                "Steht im Geräteprotokoll und ist das Einzige, was den Vorgang dort erklärt."}
            </span>
          </div>
        </label>

        <div class="flex flex-wrap gap-3 mt-2">
          <button type="submit" class="btn btn-primary">
            Gerät in TTN anlegen
          </button>
          <a href="/management/devices" class="btn btn-ghost">
            Abbrechen
          </a>
        </div>
      </form>
    </Layout>
  );
}
