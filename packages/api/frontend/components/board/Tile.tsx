import type { BoardTile } from "../../../services/dashboard";
import Gauge from "./Gauge";
import LocalTime from "../LocalTime";

/**
 * One board tile: name, gauge, device, measurand, unit and when the value was
 * recorded, top to bottom - pure presentational, no data fetching.
 */
export default function Tile(props: { tile: BoardTile }) {
  const { entry, unit, value, lastSeen, min, max, hasRange } = props.tile;
  return (
    <div class="aspect-square border border-base-300 rounded-box p-3 flex flex-col items-center gap-1 bg-base-100">
      <div class="shrink-0 font-bold text-center">{entry.name}</div>
      <div class="flex-1 min-h-0 min-w-0 w-full flex items-center justify-center overflow-hidden">
        <Gauge id={entry.id} value={value} unit={unit} min={min} max={max} hasRange={hasRange} />
      </div>
      {/* The unit now sits with the value inside the gauge, so it is no longer
          a line of its own three rows below the number it belongs to. */}
      <div class="shrink-0 text-sm">{entry.measurand}</div>
      <div class="shrink-0 font-mono text-xs text-base-content/70">{entry.deviceEui}</div>
      <div class="shrink-0 text-xs text-base-content/70">
        {lastSeen ? (
          <>
            Stand: <LocalTime at={lastSeen} />
          </>
        ) : (
          "Noch kein Messwert"
        )}
      </div>
    </div>
  );
}
