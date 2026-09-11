import type { DeviceState } from "../../lib/device-state";

/**
 * The three states a device can be in, as one badge with the explanation behind
 * it. Shared by the device overview and the status board, so the same device
 * cannot be described differently on two pages - the rule itself is in
 * lib/device-state.ts.
 */
const STATE: Record<DeviceState, { label: string; badge: string; title: string }> = {
  active: {
    label: "aktiv",
    badge: "badge-success",
    title: "In TTN registriert, und es kommen Messwerte oder Logs an.",
  },
  silent: {
    label: "stumm",
    badge: "badge-warning",
    title:
      "In TTN registriert, aber es kommt nichts (mehr) an – weder Messwerte " +
      "noch Logs. Der Aufbau steht noch im Schrank, oder er ist defekt.",
  },
  orphan: {
    label: "verwaist",
    badge: "badge-error",
    title:
      "Messwerte oder Logs unter einer DevEUI, die in TTN nicht (mehr) " +
      "registriert ist.",
  },
};

export default function DeviceStateBadge(props: { state: DeviceState }) {
  const state = STATE[props.state];
  return (
    <span class={`badge badge-sm ${state.badge}`} title={state.title}>
      {state.label}
    </span>
  );
}
