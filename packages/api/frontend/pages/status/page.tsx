import Layout from "../../components/layout/Layout";
import PageHeading from "../../components/PageHeading";
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
      <PageHeading
        title="Status"
        intro={
          <>
            Debugging-Übersicht: letzter Messwert je Gerät und Sensor sowie
            letzter Log-Eintrag je Gerät, sortiert nach letzter Aktivität.
            Aktualisiert sich automatisch alle {REFRESH_SECONDS} Sekunden.
          </>
        }
      />

      <StatusBoard sensors={props.sensors} logs={props.logs} />

      {/* Auto-refresh: reload the whole (server-rendered) page periodically. */}
      <script>{`setTimeout(function () { location.reload(); }, ${REFRESH_SECONDS * 1000});`}</script>
    </Layout>
  );
}
