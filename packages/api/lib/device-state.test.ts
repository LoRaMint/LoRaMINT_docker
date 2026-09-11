import { describe, expect, test } from "bun:test";
import { ACTIVE_WINDOW_MS, deviceState, deviceStates, laterOf } from "./device-state";

const NOW = new Date("2026-09-11T12:00:00Z").getTime();
const ago = (ms: number) => new Date(NOW - ms);

describe("deviceState", () => {
  test("registered and heard from within the window is aktiv", () => {
    expect(deviceState(true, ago(60 * 1000), NOW)).toBe("active");
  });

  test("registered and quiet for longer than the window is stumm", () => {
    expect(deviceState(true, ago(ACTIVE_WINDOW_MS + 1000), NOW)).toBe("silent");
  });

  test("the boundary counts as aktiv, so a device is not flagged on the second", () => {
    expect(deviceState(true, ago(ACTIVE_WINDOW_MS), NOW)).toBe("active");
  });

  test("registered and never heard from at all is stumm, not verwaist", () => {
    expect(deviceState(true, null, NOW)).toBe("silent");
  });

  test("not registered is verwaist, however recent the data is", () => {
    expect(deviceState(false, ago(1000), NOW)).toBe("orphan");
    expect(deviceState(false, null, NOW)).toBe("orphan");
  });
});

describe("laterOf", () => {
  test("picks the later of two times", () => {
    expect(laterOf(ago(1000), ago(5000))).toEqual(ago(1000));
    expect(laterOf(ago(5000), ago(1000))).toEqual(ago(1000));
  });

  test("a missing time never wins over a present one", () => {
    expect(laterOf(null, ago(5000))).toEqual(ago(5000));
    expect(laterOf(ago(5000), null)).toEqual(ago(5000));
  });

  test("two missing times stay missing", () => {
    expect(laterOf(null, null)).toBeNull();
  });
});

describe("deviceStates", () => {
  const ROWS = [
    { deviceEui: "AAAA000000000001", lastSeen: ago(ACTIVE_WINDOW_MS + 5000) },
    { deviceEui: "AAAA000000000001", lastSeen: ago(2000) },
    { deviceEui: "AAAA000000000002", lastSeen: ago(ACTIVE_WINDOW_MS + 5000) },
    { deviceEui: "bbbb000000000003", lastSeen: ago(2000) },
  ];

  test("folds several rows per device to its newest one", () => {
    const states = deviceStates(ROWS, new Set(["AAAA000000000001"]), NOW);
    expect(states["AAAA000000000001"]).toBe("active");
  });

  test("a registered device whose newest row is old is stumm", () => {
    const states = deviceStates(ROWS, new Set(["AAAA000000000002"]), NOW);
    expect(states["AAAA000000000002"]).toBe("silent");
  });

  test("an EUI TTN does not know is verwaist", () => {
    const states = deviceStates(ROWS, new Set(["AAAA000000000001"]), NOW);
    expect(states["AAAA000000000002"]).toBe("orphan");
  });

  test("keys and lookups are upper case, whatever the rows hold", () => {
    const states = deviceStates(ROWS, new Set(["BBBB000000000003"]), NOW);
    expect(states["BBBB000000000003"]).toBe("active");
    expect(states["bbbb000000000003"]).toBeUndefined();
  });
});
