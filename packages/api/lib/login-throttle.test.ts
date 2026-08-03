import { describe, expect, test } from "bun:test";
import { LoginThrottle, DEFAULT_LIMITS } from "./login-throttle";

/**
 * Time is passed in rather than waited for, so five minutes cost nothing.
 */
const T0 = 1_700_000_000_000;
const MINUTE = 60_000;
const LOCK = 5 * MINUTE;

const fresh = () => new LoginThrottle(DEFAULT_LIMITS);

/** Fails `count` times from one address, one second apart. */
const failTimes = (
  throttle: LoginThrottle,
  name: string,
  address: string,
  count: number,
  from = T0,
) => {
  let last = 0;
  for (let i = 0; i < count; i++) {
    last = throttle.recordFailure(name, address, from + i * 1000);
  }
  return last;
};

describe("the address is what gets counted", () => {
  test("five failures are allowed, the sixth locks the address", () => {
    const throttle = fresh();
    expect(failTimes(throttle, "mruf", "1.2.3.4", 5)).toBe(0);
    expect(throttle.recordFailure("mruf", "1.2.3.4", T0 + 5000)).toBe(LOCK);
  });

  test("the count is per address, not per name", () => {
    const throttle = fresh();
    // Three names from one address: still six failures from that address.
    failTimes(throttle, "mruf", "1.2.3.4", 2);
    failTimes(throttle, "aschmidt", "1.2.3.4", 2, T0 + 10_000);
    expect(failTimes(throttle, "extern", "1.2.3.4", 1, T0 + 20_000)).toBe(0);
    expect(throttle.recordFailure("extern", "1.2.3.4", T0 + 21_000)).toBe(LOCK);
  });

  test("a locked address cannot try any name", () => {
    const throttle = fresh();
    failTimes(throttle, "mruf", "1.2.3.4", 6);
    expect(throttle.lockedFor("aschmidt", "1.2.3.4", T0 + 6000)).toBeGreaterThan(0);
  });

  test("another address is unaffected", () => {
    const throttle = fresh();
    failTimes(throttle, "mruf", "1.2.3.4", 6);
    expect(throttle.lockedFor("mruf", "9.9.9.9", T0 + 6000)).toBe(0);
  });
});

describe("one attacker cannot lock out a real user", () => {
  test("hundreds of attempts from one address leave the victim able to sign in", () => {
    const throttle = fresh();
    // The whole point of the design, stated as a test.
    for (let i = 0; i < 500; i++) {
      throttle.recordFailure("matthias.ruf", "6.6.6.6", T0 + i * 1000);
    }
    expect(throttle.lockedFor("matthias.ruf", "6.6.6.6", T0 + 500_000)).toBeGreaterThan(0);
    expect(throttle.lockedFor("matthias.ruf", "10.0.0.7", T0 + 500_000)).toBe(0);
  });

  test("the user's own typos never lock their name either", () => {
    const throttle = fresh();
    // Five wrong tries, a pause past the window, five more - from their own
    // address, which is one address.
    failTimes(throttle, "matthias.ruf", "10.0.0.7", 5);
    failTimes(throttle, "matthias.ruf", "10.0.0.7", 5, T0 + 6 * MINUTE);
    expect(throttle.lockedFor("matthias.ruf", "10.0.0.7", T0 + 6 * MINUTE + 5000)).toBe(0);
  });
});

describe("a name locks only when the attempt is distributed", () => {
  /** One failure for `name` from each address, a second apart. */
  const fromEach = (
    throttle: LoginThrottle,
    name: string,
    addresses: string[],
    from = T0,
  ) => {
    let last = 0;
    for (const [i, address] of addresses.entries()) {
      last = throttle.recordFailure(name, address, from + i * 1000);
    }
    return last;
  };

  const FIVE = ["1.1.1.1", "2.2.2.2", "3.3.3.3", "4.4.4.4", "5.5.5.5"];

  test("five different addresses do not lock the name", () => {
    const throttle = fresh();
    expect(fromEach(throttle, "mruf", FIVE)).toBe(0);
    expect(throttle.lockedFor("mruf", "9.9.9.9", T0 + 5000)).toBe(0);
  });

  test("the sixth locks it, for every address", () => {
    const throttle = fresh();
    fromEach(throttle, "mruf", FIVE);
    expect(throttle.recordFailure("mruf", "6.6.6.6", T0 + 5000)).toBe(LOCK);
    // Even an address that never tried anything is turned away.
    expect(throttle.lockedFor("mruf", "9.9.9.9", T0 + 5000)).toBe(LOCK);
  });

  test("addresses outside the window do not add up", () => {
    const throttle = fresh();
    fromEach(throttle, "mruf", FIVE);
    // Six minutes later the first five have aged out, so this is the first
    // address again rather than the sixth.
    expect(throttle.recordFailure("mruf", "6.6.6.6", T0 + 6 * MINUTE)).toBe(0);
  });
});

describe("the lock itself", () => {
  test("counts down and ends after exactly five minutes", () => {
    const throttle = fresh();
    failTimes(throttle, "mruf", "1.2.3.4", 6);
    const locked = T0 + 5000;

    expect(throttle.lockedFor("mruf", "1.2.3.4", locked + MINUTE)).toBe(4 * MINUTE);
    expect(throttle.lockedFor("mruf", "1.2.3.4", locked + LOCK - 1)).toBe(1);
    expect(throttle.lockedFor("mruf", "1.2.3.4", locked + LOCK)).toBe(0);
  });

  test("hammering a locked address does not extend it", () => {
    const throttle = fresh();
    failTimes(throttle, "mruf", "1.2.3.4", 6);
    const locked = T0 + 5000;
    for (let i = 0; i < 20; i++) {
      throttle.recordFailure("mruf", "1.2.3.4", locked + i * 10_000);
    }
    expect(throttle.lockedFor("mruf", "1.2.3.4", locked + LOCK)).toBe(0);
  });

  test("afterwards the allowance is full again", () => {
    const throttle = fresh();
    failTimes(throttle, "mruf", "1.2.3.4", 6);
    const after = T0 + 5000 + LOCK;
    expect(failTimes(throttle, "mruf", "1.2.3.4", 5, after)).toBe(0);
  });

  test("a successful sign-in clears both counts", () => {
    const throttle = fresh();
    failTimes(throttle, "mruf", "1.2.3.4", 5);
    throttle.recordSuccess("mruf", "1.2.3.4");
    expect(failTimes(throttle, "mruf", "1.2.3.4", 5, T0 + 10_000)).toBe(0);
  });

  test("the same name or address in different spellings is one entry", () => {
    const throttle = fresh();
    failTimes(throttle, "mruf", "1.2.3.4", 5);
    expect(throttle.recordFailure("  MRuf ", " 1.2.3.4 ", T0 + 5000)).toBe(LOCK);
  });

  test("an empty name or address is not tracked", () => {
    const throttle = fresh();
    for (let i = 0; i < 10; i++) throttle.recordFailure("  ", "1.2.3.4", T0 + i * 1000);
    for (let i = 0; i < 10; i++) throttle.recordFailure("mruf", "  ", T0 + i * 1000);
    expect(throttle.size).toBe(0);
  });
});

describe("memory", () => {
  test("forged addresses do not grow the maps without limit", () => {
    const throttle = fresh();
    // The most expensive thing an attacker can produce: a fresh address every
    // time, so nothing is ever a repeat.
    for (let i = 0; i < 5000; i++) {
      throttle.recordFailure(`ghost-${i}`, `10.0.${i >> 8}.${i & 255}`, T0 + i * 10);
    }
    expect(throttle.size).toBeLessThanOrEqual(2 * 1024);
  });

  test("entries whose window has passed are forgotten", () => {
    const throttle = fresh();
    for (let i = 0; i < 1100; i++) {
      throttle.recordFailure(`old-${i}`, `10.1.${i >> 8}.${i & 255}`, T0);
    }
    const before = throttle.size;
    throttle.recordFailure("later", "10.2.0.1", T0 + 60 * MINUTE);
    expect(throttle.size).toBeLessThan(before);
  });
});
