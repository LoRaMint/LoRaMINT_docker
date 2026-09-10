import Layout from "../../components/layout/Layout";
import PageHeading from "../../components/PageHeading";
import Notice from "../../components/Notice";
import { PAGES } from "../../../lib";
import { DELETE_STEP_LABELS } from "../../../services";
import type { DeviceDeleteOutcome, RegistrationStep } from "../../../services";

/**
 * What a removal did, register by register.
 *
 * Reads like the page after a registration, and differs in the one way that
 * matters: nothing was rolled back, so a step is either gone, refused, or not
 * reached yet. There is no fourth state.
 *
 * A failure is not a dead end. As long as the Identity Server entry stands the
 * device is still addressable, and running the same route again picks up where
 * this stopped - a register already removed answers 404, which counts as done.
 * Hence the button rather than an apology.
 */

/** The order a removal walks: the registry last, so it stays reachable longest. */
const ORDER: RegistrationStep[] = ["as", "ns", "js", "is"];

/** Spelled out, because "2 von 4" reads like a score rather than a sentence. */
const COUNT_WORDS = ["Keines", "Eines", "Zwei", "Drei", "Vier"];

const DeviceDeletedPage = (props: {
  outcome: DeviceDeleteOutcome;
  /** The reason, carried along so a retry needs no retyping. */
  reason: string;
  logError?: string | null;
}) => {
  const outcome = props.outcome;
  const removed = new Set(outcome.done);
  const clean = outcome.failed === null;
  const path = `/management/devices/${encodeURIComponent(outcome.deviceId)}`;

  return (
    <Layout>
      <PageHeading
        title={clean ? "Gerät entfernt" : "Gerät nicht entfernt"}
        back={PAGES.devices}
      />

      {clean ? (
        <Notice tone="success">
          <strong>{outcome.deviceId}</strong> ist aus allen vier Registern von TTN
          entfernt. Die Messwerte bleiben – sie stehen in der Übersicht jetzt als{" "}
          <strong>verwaist</strong>.
        </Notice>
      ) : (
        <Notice tone="error">
          <strong>Das Gerät {outcome.deviceId} ist noch in TTN.</strong>{" "}
          {COUNT_WORDS[outcome.done.length] ?? outcome.done.length} von vier
          Registern sind entfernt, der Eintrag selbst steht noch. Damit bleibt das
          Gerät ansprechbar und ein zweiter Versuch möglich.
        </Notice>
      )}

      {props.logError && (
        <Notice tone="warning">
          Der Vorgang steht nicht im Geräteprotokoll: {props.logError}
        </Notice>
      )}

      <ul class="max-w-2xl grid gap-2 mt-4">
        {ORDER.map((step) => {
          const failed = outcome.failed?.step === step;
          const done = removed.has(step);
          return (
            <li class="rounded-box border border-base-300 px-4 py-3 flex gap-3 items-start">
              <span
                class={`badge badge-sm mt-0.5 ${
                  failed ? "badge-error" : done ? "badge-success" : "badge-ghost"
                }`}
              >
                {failed ? "✕" : done ? "✓" : "–"}
              </span>
              <div>
                <div class="font-semibold">{DELETE_STEP_LABELS[step]}</div>
                {failed && (
                  <div class="text-sm text-error mt-1">{outcome.failed!.error}</div>
                )}
                {!done && !failed && (
                  <div class="text-sm text-base-content/70 mt-1">
                    Nicht mehr versucht.
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <div class="flex flex-wrap gap-3 mt-6">
        <a href={PAGES.devices.href} class="btn btn-ghost">
          Zur Übersicht
        </a>
        {!clean && (
          // The same route, with the same fields. Nothing about where it
          // stopped needs carrying: a register that is already gone answers
          // 404, and the run counts that as done.
          <form method="post" action={`${path}/delete`}>
            <input type="hidden" name="device_id" value={outcome.deviceId} />
            <input type="hidden" name="reason" value={props.reason} />
            <button type="submit" class="btn btn-primary">
              Nochmal versuchen
            </button>
          </form>
        )}
      </div>
    </Layout>
  );
};

export default DeviceDeletedPage;
