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
        <Gauge id={entry.id} value={value} min={min} max={max} hasRange={hasRange} />
      </div>
      <div class="shrink-0 font-mono text-xs text-base-content/70">{entry.deviceEui}</div>
      <div class="shrink-0 text-sm">{entry.measurand}</div>
      <div class="shrink-0 text-sm text-base-content/70">{unit ?? "–"}</div>
      <div class="shrink-0 text-xs text-base-content/50">
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
