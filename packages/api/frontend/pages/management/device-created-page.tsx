import Layout from "../../components/layout/Layout";
import PageHeading from "../../components/PageHeading";
import Notice from "../../components/Notice";
import { STEP_LABELS, type CreateOutcome, type RegistrationStep } from "../../../services/ttn";
import { PAGES } from "../../../lib";

/**
 * What became of a registration, step by step.
 *
 * Registering a device is four calls to four servers and they are not one
 * transaction, so "es hat nicht geklappt" is not an honest answer: it hides
 * whether nothing happened, or whether three quarters of a device is now sitting
 * in TTN. This page names each step, and when the cleanup could not undo
 * everything it says which parts are still there and what to do about them -
 * because the next attempt with the same Geräte-ID would otherwise fail with a
 * conflict nobody can explain.
 */

const ORDER: RegistrationStep[] = ["is", "js", "ns", "as"];

export default function DeviceCreatedPage(props: {
  outcome: CreateOutcome;
  /** Set when the operation could not be written to the device log. */
  logError?: string | null;
}) {
  const { outcome } = props;
  const succeeded = new Set(outcome.done);
  const leftovers = new Set(outcome.leftovers);
  const clean = outcome.failed === null;

  return (
    <Layout>
      <PageHeading
        title={clean ? "Gerät angelegt" : "Gerät nicht angelegt"}
        back={PAGES.devices}
      />

      {clean ? (
        <Notice tone="success">
          <strong>{outcome.deviceId}</strong> ist in The Things Network
          registriert. Sobald das Modul das erste Mal joint, erscheint es in der
          Übersicht als „aktiv".
        </Notice>
      ) : leftovers.size > 0 ? (
        <Notice tone="error">
          <p>
            <strong>Es ist etwas in TTN zurückgeblieben.</strong> Ein Schritt
            schlug fehl, und das Aufräumen danach ebenfalls. Das Gerät{" "}
            <code>{outcome.deviceId}</code> ist deshalb halb registriert.
          </p>
          <p class="text-sm mt-2">
            Bitte in der TTN-Console unter dieser Geräte-ID nachsehen und den
            Rest entfernen. Ohne das schlägt ein zweiter Versuch mit derselben
            Geräte-ID fehl, weil die Kennung dort schon vergeben ist.
          </p>
        </Notice>
      ) : (
        <Notice tone="warning">
          Es wurde nichts angelegt. Was bis zum Fehler schon eingetragen war,
          wurde wieder entfernt – in TTN ist von diesem Versuch nichts
          zurückgeblieben.
        </Notice>
      )}

      {props.logError && (
        <Notice tone="warning">
          Der Vorgang selbst ist durch, aber er konnte nicht ins Geräteprotokoll
          geschrieben werden: {props.logError}
        </Notice>
      )}

      <ul class="max-w-2xl grid gap-2 mt-4">
        {ORDER.map((step) => {
          const failed = outcome.failed?.step === step;
          const done = succeeded.has(step);
          const leftover = leftovers.has(step);
          return (
            <li class="rounded-box border border-base-300 px-4 py-3 flex gap-3 items-start">
              <span
                class={`badge badge-sm mt-0.5 ${
                  failed
                    ? "badge-error"
                    : leftover
                      ? "badge-warning"
                      : done
                        ? "badge-success"
                        : "badge-ghost"
                }`}
              >
                {failed ? "✕" : done && clean ? "✓" : leftover ? "!" : done ? "↩" : "–"}
              </span>
              <div>
                <div class="font-semibold">{STEP_LABELS[step]}</div>
                {failed && (
                  <div class="text-sm text-error mt-1">{outcome.failed!.error}</div>
                )}
                {leftover && (
                  <div class="text-sm text-warning mt-1">
                    Ging durch und liess sich danach nicht zurücknehmen – dieser
                    Teil steht noch in TTN.
                  </div>
                )}
                {done && !leftover && !clean && (
                  <div class="text-sm text-base-content/70 mt-1">
                    Ging durch und wurde wieder entfernt.
                  </div>
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
        <a href="/management/devices" class="btn btn-ghost">
          Zur Übersicht
        </a>
        {!clean && (
          <a href="/management/devices/new" class="btn btn-primary">
            Erneut versuchen
          </a>
        )}
      </div>
    </Layout>
  );
}
