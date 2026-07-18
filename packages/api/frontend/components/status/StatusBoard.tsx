import type { SensorStatus, LogStatus } from "../../../types";

/** Human-readable "vor X min/Std/Tagen" relative to now (German). */
function relativeTime(date: Date): string {
  const diffMs = Date.now() - new Date(date).getTime();
  const sec = Math.max(0, Math.round(diffMs / 1000));
  if (sec < 60) return "gerade eben";
  const min = Math.round(sec / 60);
  if (min < 60) return `vor ${min} min`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `vor ${hours} Std`;
  const days = Math.round(hours / 24);
  return `vor ${days} ${days === 1 ? "Tag" : "Tagen"}`;
}

/** Absolute timestamp in local (Berlin) time. */
function absoluteTime(date: Date): string {
  return new Date(date).toLocaleString("de-DE", { timeZone: "Europe/Berlin" });
}

/**
 * Status board tables: the latest measurement per device+sensor and the latest
 * log entry per device, ordered by most recent activity. Pure presentational
 * component (no Layout, no data fetching), so it can be embedded both on the
 * dedicated /status page and inline on the home page.
 */
export default function StatusBoard(props: {
  sensors: SensorStatus[];
  logs: LogStatus[];
}) {
  return (
    <>
      {/* Measurements */}
      <h3 class="text-lg font-semibold mb-3">Messwerte</h3>
      <div class="overflow-x-auto rounded-box border border-base-300 mb-8">
        <table class="table">
          <thead>
            <tr>
              <th>Gerät</th>
              <th>Sensor</th>
              <th>Location</th>
              <th>Messgröße</th>
              <th>Letzter Wert</th>
              <th>Zuletzt</th>
              <th class="text-right">Anzahl</th>
            </tr>
          </thead>
          <tbody>
            {props.sensors.length === 0 ? (
              <tr>
                <td colspan="7" class="text-center text-base-content/60 py-6">
                  Noch keine Daten
                </td>
              </tr>
            ) : (
              props.sensors.map((s) => (
                <tr>
                  <td class="font-mono text-sm">{s.deviceEui}</td>
                  <td>{s.sensor}</td>
                  <td>{s.location}</td>
                  <td>{s.measurand}</td>
                  <td>
                    {s.value} {s.unit}
                  </td>
                  <td>
                    <span title={absoluteTime(s.lastSeen)}>
                      {relativeTime(s.lastSeen)}
                    </span>
                  </td>
                  <td class="text-right">{s.count}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Logs */}
      <h3 class="text-lg font-semibold mb-3">Logs</h3>
      <div class="overflow-x-auto rounded-box border border-base-300">
        <table class="table">
          <thead>
            <tr>
              <th>Gerät</th>
              <th>Letzte Nachricht</th>
              <th>Zuletzt</th>
              <th class="text-right">Anzahl</th>
            </tr>
          </thead>
          <tbody>
            {props.logs.length === 0 ? (
              <tr>
                <td colspan="4" class="text-center text-base-content/60 py-6">
                  Noch keine Daten
                </td>
              </tr>
            ) : (
              props.logs.map((l) => (
                <tr>
                  <td class="font-mono text-sm">{l.deviceEui}</td>
                  <td>{l.message}</td>
                  <td>
                    <span title={absoluteTime(l.lastSeen)}>
                      {relativeTime(l.lastSeen)}
                    </span>
                  </td>
                  <td class="text-right">{l.count}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
