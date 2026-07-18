import Layout from "../../components/layout/Layout";
import StatusBoard from "../../components/status/StatusBoard";
import type { SensorStatus, LogStatus } from "../../../types";

/** Auto-refresh interval for the status board, in seconds. */
const REFRESH_SECONDS = 30;

/**
 * Server-rendered status board (no client bundle). Shows the latest measurement
 * per device+sensor and the latest log entry per device, ordered by most recent
 * activity. Auto-refreshes every REFRESH_SECONDS via a tiny inline reload
 * script (the <head> is owned by the SSR template, so no <meta refresh>).
 */
export default function StatusPage(props: {
  sensors: SensorStatus[];
  logs: LogStatus[];
}) {
  return (
    <Layout>
      <h2 class="text-xl font-bold border-b border-base-300 pb-2 mb-4 mt-8">
        Status
      </h2>
      <p class="mb-6 max-w-2xl text-base-content/80">
        Debugging-Übersicht: letzter Messwert je Gerät und Sensor sowie letzter
        Log-Eintrag je Gerät, sortiert nach letzter Aktivität. Aktualisiert sich
        automatisch alle {REFRESH_SECONDS} Sekunden.
      </p>

      <StatusBoard sensors={props.sensors} logs={props.logs} />

      {/* Auto-refresh: reload the whole (server-rendered) page periodically. */}
      <script>{`setTimeout(function () { location.reload(); }, ${REFRESH_SECONDS * 1000});`}</script>
    </Layout>
  );
}
