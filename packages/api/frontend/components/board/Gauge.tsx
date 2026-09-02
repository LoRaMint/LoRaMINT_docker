import { arcPath, fillEndAngle, GAP_START_DEG, SWEEP_DEG, pointOnCircle } from "./gauge-geometry";

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
 * A 270°-arc gauge: a grey track behind a fill that grows from the low
 * (bottom-left) end towards the high (bottom-right) end as `value` approaches
 * `max`. Pure SSR - no client JS, matching the rest of /board.
 *
 * The fill is a single hue, not a traffic light. A green-to-red gradient says
 * "high is bad", and for temperature, pressure or brightness that is simply
 * untrue - 25 °C is not worse than 15. Colour would be earning its meaning only
 * where a target range is configured, and none is.
 *
 * `min` and `max` are written at the ends of the arc, because a bar filled to
 * 60 % says nothing without them.
 */
export default function Gauge(props: {
  id: string;
  value: number | null;
  /** Written next to the value - a reading without its unit is incomplete. */
  unit?: string | null;
  min: number;
  max: number;
  hasRange: boolean;
}) {
  const drawable = props.hasRange && props.value !== null;
  const fraction = drawable
    ? Math.max(0, Math.min(1, (props.value! - props.min) / (props.max - props.min)))
    : 0;
  const gradientId = `gauge-grad-${props.id}`;
  const lowEnd = pointOnCircle(CX, CY, R, GAP_START_DEG);
  const highEnd = pointOnCircle(CX, CY, R, GAP_START_DEG + SWEEP_DEG);

  return (
    <svg viewBox="0 0 200 190" class="w-full h-full" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id={gradientId} gradientUnits="userSpaceOnUse" x1={CX - R} y1={CY} x2={CX + R} y2={CY}>
          <stop offset="0%" stop-color="var(--gauge-from)" />
          <stop offset="100%" stop-color="var(--gauge-to)" />
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

      {/* The ends of the scale, just outside the arc's low and high points. */}
      {props.hasRange && (
        <>
          <text
            x={lowEnd.x}
            y={lowEnd.y + 16}
            text-anchor="middle"
            font-size={String(R * 0.15)}
            fill="currentColor"
            opacity="0.7"
          >
            {formatValue(props.min)}
          </text>
          <text
            x={highEnd.x}
            y={highEnd.y + 16}
            text-anchor="middle"
            font-size={String(R * 0.15)}
            fill="currentColor"
            opacity="0.7"
          >
            {formatValue(props.max)}
          </text>
        </>
      )}

      <text
        x={CX}
        y={props.unit ? CY - 6 : CY}
        text-anchor="middle"
        dominant-baseline="middle"
        font-size={String(R * 0.32)}
        font-weight="bold"
        fill="currentColor"
      >
        {props.value !== null ? formatValue(props.value) : "–"}
      </text>
      {props.unit && (
        <text
          x={CX}
          y={CY + R * 0.24}
          text-anchor="middle"
          dominant-baseline="middle"
          font-size={String(R * 0.16)}
          fill="currentColor"
          opacity="0.7"
        >
          {props.unit}
        </text>
      )}
    </svg>
  );
}
