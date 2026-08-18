/**
 * Pure geometry for the board gauge: a 270° arc with a 90° gap centered at the
 * bottom, read clockwise from the top like a speedometer. Kept separate from
 * the JSX component so the math is testable without a DOM.
 *
 * Angle convention: degrees, clockwise from north (0° = top, 90° = right,
 * 180° = bottom, 270° = left) - this maps directly onto SVG's y-down canvas:
 *
 *   x = cx + r·sin(θ), y = cy − r·cos(θ)
 *
 * The gap sits on 135°–225°; the arc itself runs from 225° (bottom-left, the
 * low end) clockwise through the top to 135° (bottom-right, the high end).
 */

export const GAP_START_DEG = 225;
export const SWEEP_DEG = 270;

const toRad = (deg: number) => (deg * Math.PI) / 180;

/** The point on a circle of radius `r` around (cx, cy) at angle `deg`. */
export const pointOnCircle = (cx: number, cy: number, r: number, deg: number) => ({
  x: cx + r * Math.sin(toRad(deg)),
  y: cy - r * Math.cos(toRad(deg)),
});

/** The angle (in the 225°-start convention above) the fill arc ends at. */
export const fillEndAngle = (fraction: number): number =>
  GAP_START_DEG + SWEEP_DEG * Math.max(0, Math.min(1, fraction));

/**
 * An SVG arc path from `startDeg` to `endDeg`, sweeping clockwise, on a circle
 * of radius `r` around (cx, cy).
 *
 * `large-arc-flag` is 1 exactly when the swept angle exceeds 180° - for the
 * fill arc that is the point where `fraction` crosses 2/3 (270°·2/3 = 180°).
 */
export const arcPath = (
  cx: number,
  cy: number,
  r: number,
  startDeg: number,
  endDeg: number,
): string => {
  const start = pointOnCircle(cx, cy, r, startDeg);
  const end = pointOnCircle(cx, cy, r, endDeg);
  const largeArcFlag = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`;
};
