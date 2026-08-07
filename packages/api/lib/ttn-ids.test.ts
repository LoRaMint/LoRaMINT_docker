import { describe, expect, test } from "bun:test";
import {
  deviceProblems,
  formatEui,
  MAX_NAME_LENGTH,
  normaliseAppKey,
  normaliseDevice,
  nextDeviceId,
  normaliseDeviceId,
  normaliseEui,
} from "./ttn-ids";

/** The values of a real LA66, as the TTN console shows them. */
const DEV_EUI = "A8 40 41 D6 C1 84 DB 82";
const JOIN_EUI = "A8 40 41 00 00 00 01 01";
const APP_KEY = "11223344556677881122334455667788";

const VALID = {
  deviceId: "device-1",
  name: "Fenster 8b",
  devEui: DEV_EUI,
  joinEui: JOIN_EUI,
  appKey: APP_KEY,
};

describe("normaliseEui", () => {
  test("accepts the console's byte pairs and strips them", () => {
    expect(normaliseEui(DEV_EUI)).toBe("A84041D6C184DB82");
  });

  test("accepts the other separators values get copied with", () => {
    expect(normaliseEui("a8:40:41:d6:c1:84:db:82")).toBe("A84041D6C184DB82");
    expect(normaliseEui("a8-40-41-d6-c1-84-db-82")).toBe("A84041D6C184DB82");
    expect(normaliseEui("a84041d6c184db82")).toBe("A84041D6C184DB82");
  });

  test("upper-cases, so one device cannot appear twice on the overview", () => {
    expect(normaliseEui("a84041d6c184db82")).toBe(normaliseEui("A84041D6C184DB82"));
  });

  test("refuses the wrong length", () => {
    expect(normaliseEui("A84041D6C184DB")).toBeNull();
    expect(normaliseEui("A84041D6C184DB8200")).toBeNull();
    expect(normaliseEui("")).toBeNull();
  });

  test("refuses non-hex, including a separator that is not one", () => {
    expect(normaliseEui("A84041D6C184DBZZ")).toBeNull();
    // Dropping dots too would turn a typo into a silently different device.
    expect(normaliseEui("a8.40.41.d6.c1.84.db.82")).toBeNull();
  });
});

describe("normaliseAppKey", () => {
  test("takes 32 hex characters, separators and all", () => {
    expect(normaliseAppKey("11 22 33 44 55 66 77 88 11 22 33 44 55 66 77 88")).toBe(
      APP_KEY,
    );
  });

  test("refuses an EUI-length value", () => {
    expect(normaliseAppKey(DEV_EUI)).toBeNull();
  });
});

describe("normaliseDeviceId", () => {
  test("accepts what The Things Stack accepts", () => {
    expect(normaliseDeviceId("device-1")).toBe("device-1");
    expect(normaliseDeviceId("eui-a84041d6c184db82")).toBe("eui-a84041d6c184db82");
    expect(normaliseDeviceId("abc")).toBe("abc");
  });

  test("trims and lower-cases rather than refusing", () => {
    expect(normaliseDeviceId("  Device-1 ")).toBe("device-1");
  });

  test("refuses what TTN would refuse", () => {
    expect(normaliseDeviceId("ab")).toBeNull(); // too short
    expect(normaliseDeviceId("a".repeat(37))).toBeNull(); // too long
    expect(normaliseDeviceId("-device")).toBeNull(); // leading dash
    expect(normaliseDeviceId("device-")).toBeNull(); // trailing dash
    expect(normaliseDeviceId("de--vice")).toBeNull(); // doubled dash
    expect(normaliseDeviceId("device_1")).toBeNull(); // underscore
    expect(normaliseDeviceId("gerät-1")).toBeNull(); // umlaut
  });

  test("accepts exactly 36 characters", () => {
    expect(normaliseDeviceId("a".repeat(36))).toBe("a".repeat(36));
  });
});

describe("nextDeviceId", () => {
  test("counts on from the highest number in use", () => {
    expect(nextDeviceId(["device-1", "device-2", "device-3"])).toBe("device-4");
  });

  test("starts at one in an empty application", () => {
    expect(nextDeviceId([])).toBe("device-1");
  });

  test("compares numerically, not as text", () => {
    // Sorted as text "device-9" would win over "device-10" and the proposal
    // would be a name that already exists.
    expect(nextDeviceId(["device-9", "device-10"])).toBe("device-11");
  });

  test("counts on rather than filling a gap", () => {
    // device-2 is most likely a device that was removed; handing its name to
    // different hardware would make two things share it in the history.
    expect(nextDeviceId(["device-1", "device-3"])).toBe("device-4");
  });

  test("ignores ids that are not part of the scheme", () => {
    expect(nextDeviceId(["klasse-8b-fenster", "eui-a84041d6c184db82"])).toBe(
      "device-1",
    );
    expect(nextDeviceId(["fenster", "device-2", "flur-eg"])).toBe("device-3");
  });

  test("is not fooled by lookalikes", () => {
    expect(nextDeviceId(["device-2b", "device-", "devices-5", "device-1"])).toBe(
      "device-2",
    );
  });

  test("takes ids as TTN hands them over, whatever their case or spacing", () => {
    expect(nextDeviceId([" Device-4 "])).toBe("device-5");
  });

  test("what it proposes is always a valid id", () => {
    expect(normaliseDeviceId(nextDeviceId(["device-41"]))).toBe("device-42");
  });
});

describe("formatEui", () => {
  test("renders in byte pairs like the console", () => {
    expect(formatEui("A84041D6C184DB82")).toBe(DEV_EUI);
  });

  test("round-trips with normaliseEui", () => {
    expect(normaliseEui(formatEui("A84041D6C184DB82"))).toBe("A84041D6C184DB82");
  });
});

describe("deviceProblems", () => {
  test("finds nothing wrong with a filled-in form", () => {
    expect(deviceProblems(VALID)).toEqual({});
  });

  test("names every wrong field at once, not just the first", () => {
    const problems = deviceProblems({
      deviceId: "-nope",
      name: "",
      devEui: "A840",
      joinEui: "",
      appKey: "zz",
    });
    expect(Object.keys(problems).sort()).toEqual([
      "appKey",
      "devEui",
      "deviceId",
      "joinEui",
      "name",
    ]);
  });

  test("insists on a name and bounds its length", () => {
    expect(deviceProblems({ ...VALID, name: "   " })).toHaveProperty("name");
    expect(
      deviceProblems({ ...VALID, name: "x".repeat(MAX_NAME_LENGTH + 1) }),
    ).toHaveProperty("name");
    expect(
      deviceProblems({ ...VALID, name: "x".repeat(MAX_NAME_LENGTH) }),
    ).not.toHaveProperty("name");
  });
});

describe("normaliseDevice", () => {
  test("hands back the values in the shape the TTN calls want", () => {
    expect(normaliseDevice(VALID)).toEqual({
      deviceId: "device-1",
      name: "Fenster 8b",
      devEui: "A84041D6C184DB82",
      joinEui: "A840410000000101",
      appKey: APP_KEY,
    });
  });

  test("refuses everything deviceProblems complains about", () => {
    expect(normaliseDevice({ ...VALID, devEui: "A840" })).toBeNull();
    expect(normaliseDevice({ ...VALID, deviceId: "-nope" })).toBeNull();
    expect(normaliseDevice({ ...VALID, name: "" })).toBeNull();
    expect(normaliseDevice({ ...VALID, appKey: "zz" })).toBeNull();
  });

  test("a form with no problems always normalises", () => {
    expect(deviceProblems(VALID)).toEqual({});
    expect(normaliseDevice(VALID)).not.toBeNull();
  });
});
