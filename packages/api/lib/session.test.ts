import { describe, expect, test } from "bun:test";
import { createSession, readSession } from "./session";

const SECRET = "0123456789abcdef0123456789abcdef";
const USER = { username: "mruf", displayName: "Matthias Ruf", groups: ["loramint"] };

describe("session cookies", () => {
  test("round-trips a signed session", () => {
    expect(readSession(createSession(USER, SECRET, 8), SECRET)).toMatchObject(USER);
  });

  test("reports when the session stops being accepted", () => {
    // The profile page shows this; a stateless session offers no other way to
    // find out.
    const before = Date.now();
    const session = readSession(createSession(USER, SECRET, 8), SECRET);
    expect(session?.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 8 * 3600 * 1000 - 1000);
    expect(session?.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 8 * 3600 * 1000);
  });

  test("rejects a session signed with a different secret", () => {
    const cookie = createSession(USER, SECRET, 8);
    expect(readSession(cookie, "f".repeat(32))).toBeNull();
  });

  test("rejects a tampered payload", () => {
    const cookie = createSession(USER, SECRET, 8);
    const forged = Buffer.from(
      JSON.stringify({ username: "admin", displayName: "Admin", groups: ["admin"], exp: 2 ** 31 }),
      "utf8",
    ).toString("base64url");
    // Keep the original signature, swap the payload it was made for.
    expect(readSession(`${forged}.${cookie.split(".")[1]}`, SECRET)).toBeNull();
  });

  test("rejects an expired session", () => {
    expect(readSession(createSession(USER, SECRET, -1), SECRET)).toBeNull();
  });

  test("rejects malformed and missing cookies", () => {
    for (const cookie of [undefined, "", "abc", ".", "a.b", "....."]) {
      expect(readSession(cookie, SECRET)).toBeNull();
    }
  });

  test("falls back to the login name when there is no display name", () => {
    const cookie = createSession({ username: "nodisplay", displayName: "", groups: [] }, SECRET, 8);
    expect(readSession(cookie, SECRET)?.displayName).toBe("nodisplay");
  });
});
