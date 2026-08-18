import { arcPath, fillEndAngle, GAP_START_DEG } from "./gauge-geometry";

const CX = 100;
const CY = 110;
const R = 85;
const STROKE = 16;

/** Renders "12.3" as "12,3" and drops a trailing ".0" - German number reading. */
const formatValue = (value: number): string => {
  const rounded = Math.round(value * 10) / 10;
  return rounded.toFixed(Number.isInteger(rounded) ? 0 : 1).replace(".", ",");
};

/**
 * A 270°-arc gauge: a grey track behind a colour-graded fill that grows from
 * the low (bottom-left) end towards the high (bottom-right) end as `value`
 * approaches `max`. Pure SSR - no client JS, matching the rest of /board.
 */
export default function Gauge(props: {
  id: string;
  value: number | null;
  min: number;
  max: number;
  hasRange: boolean;
}) {
  const drawable = props.hasRange && props.value !== null;
  const fraction = drawable
    ? Math.max(0, Math.min(1, (props.value! - props.min) / (props.max - props.min)))
    : 0;
  const gradientId = `gauge-grad-${props.id}`;

  return (
    <svg viewBox="0 0 200 190" class="w-full h-auto">
      <defs>
        <linearGradient id={gradientId} gradientUnits="userSpaceOnUse" x1={CX - R} y1={CY} x2={CX + R} y2={CY}>
          <stop offset="0%" stop-color="#22c55e" />
          <stop offset="50%" stop-color="#eab308" />
          <stop offset="100%" stop-color="#ef4444" />
        </linearGradient>
      </defs>

      {/* Track: the full 270° sweep, greyed out. */}
      <path
        d={arcPath(CX, CY, R, GAP_START_DEG, GAP_START_DEG + 270)}
        fill="none"
        stroke="currentColor"
        class="text-base-300"
        stroke-width={STROKE}
        stroke-linecap="round"
      />

      {/* Fill: from the low end up to the current value's position. */}
      {drawable && fraction > 0 && (
        <path
          d={arcPath(CX, CY, R, GAP_START_DEG, fillEndAngle(fraction))}
          fill="none"
          stroke={`url(#${gradientId})`}
          stroke-width={STROKE}
          stroke-linecap="round"
        />
      )}

      <text
        x={CX}
        y={CY}
        text-anchor="middle"
        dominant-baseline="middle"
        font-size={String(R * 0.32)}
        font-weight="bold"
        fill="currentColor"
      >
        {props.value !== null ? formatValue(props.value) : "–"}
      </text>
    </svg>
  );
}
