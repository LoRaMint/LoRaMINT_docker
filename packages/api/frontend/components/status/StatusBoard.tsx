import type { SensorStatus, LogStatus } from "../../../types";
import TableFrame, { EmptyRow } from "../TableFrame";
import { localTimeText } from "../LocalTime";
import SectionHeading from "../SectionHeading";
import DeviceLabel from "../DeviceLabel";
import DeviceStateBadge from "../DeviceStateBadge";
import type { DeviceState } from "../../../lib/device-state";

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

/**
 * The tooltip behind the relative time ("vor 3 Std"). A `title` cannot hold an
 * element, so this is the string form - see frontend/components/LocalTime.tsx.
 */
const absoluteTime = (date: Date): string => localTimeText(date);

/**
 * Status board tables: the latest measurement per device+sensor and the latest
 * log entry per device, ordered by most recent activity. Pure presentational
 * component (no Layout, no data fetching), so it can be embedded both on the
 * dedicated /status page and inline on the home page.
 */
export default function StatusBoard(props: {
  sensors: SensorStatus[];
  logs: LogStatus[];
  /**
   * aktiv/stumm/verwaist per upper-case DevEUI. Null when this server cannot
   * tell - no TTN key, or a device list that never arrived - in which case no
   * badge is shown at all rather than every device being declared verwaist.
   */
  states: Record<string, DeviceState> | null;
}) {
  /** The badge for one row's device, or nothing when the state is unknown. */
  const stateOf = (deviceEui: string) =>
    props.states?.[deviceEui.toUpperCase()] ?? null;

  return (
    <>
      {/* Measurements */}
      <SectionHeading>Messwerte</SectionHeading>
      <TableFrame class="mb-8">
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
              <EmptyRow columns={7}>Noch keine Daten</EmptyRow>
            ) : (
              props.sensors.map((s) => (
                <tr>
                  <td>
                    <DeviceLabel eui={s.deviceEui} name={s.deviceName} />
                    {stateOf(s.deviceEui) && (
                      <div class="mt-0.5">
                        <DeviceStateBadge state={stateOf(s.deviceEui)!} />
                      </div>
                    )}
                  </td>
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
        </TableFrame>

      {/* Logs */}
      <SectionHeading>Logs</SectionHeading>
      <TableFrame>
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
              <EmptyRow columns={4}>Noch keine Daten</EmptyRow>
            ) : (
              props.logs.map((l) => (
                <tr>
                  <td>
                    <DeviceLabel eui={l.deviceEui} name={l.deviceName} />
                    {stateOf(l.deviceEui) && (
                      <div class="mt-0.5">
                        <DeviceStateBadge state={stateOf(l.deviceEui)!} />
                      </div>
                    )}
                  </td>
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
        </TableFrame>
    </>
  );
}
