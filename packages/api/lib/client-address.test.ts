import { describe, expect, test } from "bun:test";
import { clientAddress, UNKNOWN_ADDRESS } from "./client-address";

/**
 * The rule under test: a proxy appends what it saw, so the trustworthy entry is
 * counted from the *right*. Everything to the left of it is whatever the sender
 * felt like writing.
 */
describe("behind one proxy (the shipped setup)", () => {
  test("a plain header is the client", () => {
    expect(clientAddress("203.0.113.9", "172.18.0.2", 1)).toBe("203.0.113.9");
  });

  test("an invented entry on the left is ignored", () => {
    // The attacker sent "1.2.3.4"; Traefik appended what it actually saw.
    expect(clientAddress("1.2.3.4, 203.0.113.9", "172.18.0.2", 1)).toBe("203.0.113.9");
  });

  test("a whole invented chain is ignored", () => {
    expect(
      clientAddress("10.0.0.1, 10.0.0.2, 10.0.0.3, 203.0.113.9", "172.18.0.2", 1),
    ).toBe("203.0.113.9");
  });

  test("without the header the socket address is used", () => {
    expect(clientAddress(null, "203.0.113.9", 1)).toBe("203.0.113.9");
  });
});

describe("other topologies", () => {
  test("no trusted proxy means the header is not believed at all", () => {
    expect(clientAddress("1.2.3.4", "203.0.113.9", 0)).toBe("203.0.113.9");
  });

  test("two proxies: the client is one further left", () => {
    // CDN in front of Traefik: [client, cdn] with Traefik's append making
    // [client, cdn, ...] - the client is two from the right.
    expect(clientAddress("203.0.113.9, 198.51.100.5", "172.18.0.2", 2)).toBe(
      "203.0.113.9",
    );
  });

  test("a header shorter than the expected chain is not believed", () => {
    // Two proxies configured but only one entry: the request did not come the
    // way it was supposed to.
    expect(clientAddress("1.2.3.4", "172.18.0.2", 2)).toBe("172.18.0.2");
  });

  test("nothing at all is one shared bucket, not a crash", () => {
    expect(clientAddress(null, null, 1)).toBe(UNKNOWN_ADDRESS);
    expect(clientAddress("", "  ", 1)).toBe(UNKNOWN_ADDRESS);
  });
});

describe("shapes an address arrives in", () => {
  test("a port is not part of the address", () => {
    expect(clientAddress(null, "203.0.113.9:54321", 1)).toBe("203.0.113.9");
    expect(clientAddress("[2001:db8::1]:443", "172.18.0.2", 1)).toBe("2001:db8::1");
  });

  test("IPv6 without a port survives intact", () => {
    expect(clientAddress("2001:DB8::1", "172.18.0.2", 1)).toBe("2001:db8::1");
  });

  test("spacing and case do not make two addresses out of one", () => {
    expect(clientAddress("  203.0.113.9  ", null, 1)).toBe("203.0.113.9");
  });

  test("an absurdly long chain is cut down rather than walked", () => {
    const long = Array.from({ length: 5000 }, (_, i) => `10.0.0.${i % 256}`).join(", ");
    expect(clientAddress(`${long}, 203.0.113.9`, "172.18.0.2", 1)).toBe("203.0.113.9");
  });
});
