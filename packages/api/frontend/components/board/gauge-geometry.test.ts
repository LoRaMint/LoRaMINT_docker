import { describe, expect, test } from "bun:test";
import { arcPath, fillEndAngle, pointOnCircle, GAP_START_DEG } from "./gauge-geometry";

describe("fillEndAngle", () => {
  test("fraction 0 stays at the gap start", () => {
    expect(fillEndAngle(0)).toBe(GAP_START_DEG);
  });

  test("fraction 1 sweeps the full 270°", () => {
    expect(fillEndAngle(1)).toBe(GAP_START_DEG + 270);
  });

  test("fraction 0.5 sweeps 135°", () => {
    expect(fillEndAngle(0.5)).toBe(GAP_START_DEG + 135);
  });

  test("clamps outside [0, 1]", () => {
    expect(fillEndAngle(-1)).toBe(GAP_START_DEG);
    expect(fillEndAngle(2)).toBe(GAP_START_DEG + 270);
  });
});

describe("pointOnCircle", () => {
  test("0° is straight up from the center", () => {
    const p = pointOnCircle(0, 0, 10, 0);
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(-10);
  });

  test("90° is straight right", () => {
    const p = pointOnCircle(0, 0, 10, 90);
    expect(p.x).toBeCloseTo(10);
    expect(p.y).toBeCloseTo(0);
  });
});

describe("arcPath", () => {
  test("large-arc-flag flips exactly where the swept angle crosses 180°", () => {
    // fraction = 2/3 sweeps exactly 270 * 2/3 = 180° - not yet "large".
    const at180 = arcPath(100, 110, 85, GAP_START_DEG, fillEndAngle(2 / 3));
    expect(at180).toContain(" 0 1 "); // large-arc-flag 0, sweep-flag 1

    const justOver = arcPath(100, 110, 85, GAP_START_DEG, fillEndAngle(2 / 3 + 0.01));
    expect(justOver).toContain(" 1 1 "); // large-arc-flag 1, sweep-flag 1
  });

  test("starts and ends with the moveto/arc command shape", () => {
    const d = arcPath(100, 110, 85, GAP_START_DEG, GAP_START_DEG + 270);
    expect(d.startsWith("M ")).toBe(true);
    expect(d).toContain("A 85 85 0 1 1");
  });
});
