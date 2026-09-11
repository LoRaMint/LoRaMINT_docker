/**
 * A device, named: what TTN calls it, with its DevEUI underneath.
 *
 * Both lines, always, and in that order. The name is what tells a reader which
 * window in which room; the EUI is what the measurements, the webhook and every
 * filter in the API actually hold, so it has to stay copyable and comparable -
 * see lib/ttn-ids.ts's `deviceLabel` for the one-line form the dropdowns use.
 *
 * Without a name there is just the EUI, exactly as it looked before this existed.
 * A dimmed sub-line under an empty first line would read as a rendering fault.
 *
 * The EUI is shown in one piece rather than in byte pairs: `formatEui` adds seven
 * characters, which is a noticeably wider first column in a seven-column table.
 */
export default function DeviceLabel(props: { eui: string; name: string | null }) {
  if (!props.name) return <span class="font-mono text-sm">{props.eui}</span>;
  return (
    <span class="block leading-tight">
      <span class="block font-medium">{props.name}</span>
      <span class="block font-mono text-xs text-base-content/70">{props.eui}</span>
    </span>
  );
}
