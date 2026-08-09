import { describe, expect, test } from "bun:test";
import {
  COMMON_ZONES,
  formatInstant,
  isValidTimeZone,
  otherZones,
  wallClockIn,
  zoneAbbreviation,
} from "./time-zone";

describe("welche Zonen angenommen werden", () => {
  test("gebräuchliche Namen gelten", () => {
    for (const zone of COMMON_ZONES) expect(isValidTimeZone(zone)).toBe(true);
  });

  test("Erfundenes wird abgelehnt", () => {
    expect(isValidTimeZone("Europa/Berlin")).toBe(false);
    expect(isValidTimeZone("MESZ")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
  });

  /**
   * The value comes from a form and lands in the database, from where it is read
   * on every page. A name that made Intl throw would break the whole site for
   * that user, so the check happens before it is stored, not when it is used.
   */
  test("etwas absurd Langes wird abgelehnt, bevor Intl es sieht", () => {
    expect(isValidTimeZone("A".repeat(200))).toBe(false);
  });
});

describe("die Auswahlliste", () => {
  /**
   * The shortlist is there so the likely answer is easy to find, not so the rest
   * is unreachable. Both lists are offered, in that order - a picker that only
   * held the eleven would leave anybody outside them with no way in.
   */
  test("neben den häufigen stehen alle übrigen", () => {
    const rest = otherZones();
    expect(rest.length).toBeGreaterThan(300);
    expect(rest).toContain("Africa/Nairobi");
    expect(rest).toContain("Pacific/Auckland");
  });

  test("nichts steht doppelt in beiden Listen", () => {
    const rest = otherZones();
    for (const zone of COMMON_ZONES) expect(rest).not.toContain(zone);
  });

  test("und was drinsteht, ist auch gültig", () => {
    for (const zone of otherZones().slice(0, 40)) {
      expect(isValidTimeZone(zone)).toBe(true);
    }
  });
});

describe("Ortszeit für die Plots", () => {
  /** The actual bug this exists for: the axis read UTC, two hours out in summer. */
  test("Sommerzeit in Berlin liegt zwei Stunden vor UTC", () => {
    expect(wallClockIn("2026-08-07T22:48:02.314Z", "Europe/Berlin")).toBe(
      "2026-08-08T00:48:02.314",
    );
  });

  test("Winterzeit in Berlin liegt eine Stunde vor UTC", () => {
    expect(wallClockIn("2026-01-15T22:48:02.000Z", "Europe/Berlin")).toBe(
      "2026-01-15T23:48:02.000",
    );
  });

  test("UTC bleibt UTC, nur ohne das Z", () => {
    expect(wallClockIn("2026-08-07T22:48:02.314Z", "UTC")).toBe(
      "2026-08-07T22:48:02.314",
    );
  });

  test("ein negativer Versatz", () => {
    expect(wallClockIn("2026-08-07T02:00:00.000Z", "America/New_York")).toBe(
      "2026-08-06T22:00:00.000",
    );
  });

  test("ein Versatz von einer halben Stunde", () => {
    expect(wallClockIn("2026-08-07T10:00:00.000Z", "Asia/Kolkata")).toBe(
      "2026-08-07T15:30:00.000",
    );
  });

  /**
   * 2026-03-29: in Berlin the hour from 02:00 to 03:00 does not exist. An instant
   * either side of it must land on the right side, and nothing may be produced
   * inside the gap.
   */
  test("die fehlende Stunde im Frühjahr", () => {
    expect(wallClockIn("2026-03-29T00:59:00.000Z", "Europe/Berlin")).toBe(
      "2026-03-29T01:59:00.000",
    );
    expect(wallClockIn("2026-03-29T01:00:00.000Z", "Europe/Berlin")).toBe(
      "2026-03-29T03:00:00.000",
    );
  });

  /**
   * 2026-10-25: the hour from 02:00 to 03:00 happens twice. Both instants are
   * legitimate and must keep their distance - the point is that neither is lost.
   */
  test("die doppelte Stunde im Herbst", () => {
    expect(wallClockIn("2026-10-25T00:30:00.000Z", "Europe/Berlin")).toBe(
      "2026-10-25T02:30:00.000",
    );
    expect(wallClockIn("2026-10-25T01:30:00.000Z", "Europe/Berlin")).toBe(
      "2026-10-25T02:30:00.000",
    );
  });

  test("Mitternacht wird als 00 geschrieben, nicht als 24", () => {
    expect(wallClockIn("2026-08-07T00:00:00.000Z", "UTC")).toStartWith(
      "2026-08-07T00:00",
    );
  });

  test("ein ISO-String und ein Date ergeben dasselbe", () => {
    const iso = "2026-08-07T22:48:02.314Z";
    expect(wallClockIn(iso, "Europe/Berlin")).toBe(
      wallClockIn(new Date(iso), "Europe/Berlin"),
    );
  });
});

describe("das Kürzel hinter der Zeit", () => {
  /** Which one is right depends on the date, which is why it is not a constant. */
  test("Berlin heißt im Winter anders als im Sommer", () => {
    const winter = zoneAbbreviation("2026-01-15T12:00:00.000Z", "Europe/Berlin");
    const sommer = zoneAbbreviation("2026-08-15T12:00:00.000Z", "Europe/Berlin");
    expect(winter).not.toBe(sommer);
  });

  test("UTC heißt UTC", () => {
    expect(zoneAbbreviation("2026-08-15T12:00:00.000Z", "UTC")).toBe("UTC");
  });
});

describe("die Leseformatierung", () => {
  test("ohne Kürzel, solange die Zone die wirksame ist", () => {
    const text = formatInstant("2026-08-07T22:48:02.314Z", "Europe/Berlin");
    expect(text).toContain("00:48");
    expect(text).not.toContain("MESZ");
  });

  test("mit Kürzel, sobald sie abweicht", () => {
    const text = formatInstant("2026-08-07T22:48:02.314Z", "UTC", true);
    expect(text).toContain("22:48");
    expect(text).toEndWith("UTC");
  });
});
