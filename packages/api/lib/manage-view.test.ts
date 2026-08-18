import { describe, expect, test } from "bun:test";
import {
  buildQuery,
  columnSummary,
  columnsParam,
  filterChips,
  modeLink,
  pageLink,
  pageWindow,
  parseColumns,
  parseDirection,
  parseEditMode,
  parsePage,
  parseSort,
  sortLink,
} from "./manage-view";

const ALL_COLUMNS = ["recorded_at", "measurand", "value", "unit", "location", "sensor"];
const DEFAULT_COLUMNS = ["recorded_at", "measurand", "value", "unit"];
const SORTABLE = ["recorded_at", "value", "location"];

describe("which columns to show", () => {
  test("the resource's defaults when nothing is asked for", () => {
    expect(parseColumns(undefined, ALL_COLUMNS, DEFAULT_COLUMNS)).toEqual(DEFAULT_COLUMNS);
    expect(parseColumns("", ALL_COLUMNS, DEFAULT_COLUMNS)).toEqual(DEFAULT_COLUMNS);
  });

  test("the requested ones, in the order the table declares them", () => {
    // Asked for in a jumbled order; a shared link must not reshuffle the table.
    expect(parseColumns("value,recorded_at", ALL_COLUMNS, DEFAULT_COLUMNS)).toEqual([
      "recorded_at",
      "value",
    ]);
  });

  test("unknown names are ignored rather than rendered", () => {
    expect(parseColumns("value,password,../secret", ALL_COLUMNS, DEFAULT_COLUMNS)).toEqual([
      "value",
    ]);
  });

  test("a selection of nothing but unknown names falls back", () => {
    expect(parseColumns("nonsense", ALL_COLUMNS, DEFAULT_COLUMNS)).toEqual(DEFAULT_COLUMNS);
  });

  test("reads the checkbox group and the shared link alike", () => {
    // The form submits cols=a&cols=b, a bookmarked address carries cols=a,b.
    expect(parseColumns(["value", "unit"], ALL_COLUMNS, DEFAULT_COLUMNS)).toEqual([
      "value",
      "unit",
    ]);
    expect(parseColumns("value,unit", ALL_COLUMNS, DEFAULT_COLUMNS)).toEqual([
      "value",
      "unit",
    ]);
    expect(parseColumns([], ALL_COLUMNS, DEFAULT_COLUMNS)).toEqual(DEFAULT_COLUMNS);
  });

  test("is summarised as a count, not as a list", () => {
    expect(columnSummary(["a", "b"], ALL_COLUMNS)).toBe("2 von 6");
  });

  test("travels in a link as one comma-separated value", () => {
    expect(columnsParam(["recorded_at", "value"], DEFAULT_COLUMNS)).toBe("recorded_at,value");
  });

  test("is left out of the link when it is the default", () => {
    // Otherwise every address would carry a selection nobody made.
    expect(columnsParam(DEFAULT_COLUMNS, DEFAULT_COLUMNS)).toBeNull();
  });

  test("survives a page change - the bug that made the picker look broken", () => {
    // The picker submits `cols` once per checked box. A flat query record keeps
    // only the last of them, so building the next page's link from the raw
    // query dropped everything but one column.
    const chosen = parseColumns(
      ["recorded_at", "value", "location"],
      ALL_COLUMNS,
      DEFAULT_COLUMNS,
    );
    const raw = { cols: "location" }; // what a flat record makes of the three
    const params = { ...raw, cols: columnsParam(chosen, DEFAULT_COLUMNS) };

    expect(pageLink(params, 2)).toBe("?cols=recorded_at%2Cvalue%2Clocation&page=2");
    expect(parseColumns("recorded_at,value,location", ALL_COLUMNS, DEFAULT_COLUMNS)).toEqual(
      chosen,
    );
  });
});

describe("sorting and paging", () => {
  test("an unknown sort key falls back to the default", () => {
    expect(parseSort("value", SORTABLE, "recorded_at")).toBe("value");
    expect(parseSort("value; DROP TABLE", SORTABLE, "recorded_at")).toBe("recorded_at");
    expect(parseSort(undefined, SORTABLE, "recorded_at")).toBe("recorded_at");
  });

  test("newest first unless ascending is asked for", () => {
    expect(parseDirection("asc")).toBe("asc");
    expect(parseDirection("desc")).toBe("desc");
    expect(parseDirection("sideways")).toBe("desc");
    expect(parseDirection(undefined)).toBe("desc");
  });

  test("a page is a positive whole number or the first one", () => {
    expect(parsePage("3")).toBe(3);
    expect(parsePage("0")).toBe(1);
    expect(parsePage("-2")).toBe(1);
    expect(parsePage("1.5")).toBe(1);
    expect(parsePage("viele")).toBe(1);
    expect(parsePage(undefined)).toBe(1);
  });

  test("editing is off unless the address says so", () => {
    expect(parseEditMode("1")).toBe(true);
    expect(parseEditMode("true")).toBe(false);
    expect(parseEditMode(undefined)).toBe(false);
  });
});

describe("building the links", () => {
  test("leaves out what is not set", () => {
    expect(buildQuery({ sensor: "BME280", location: null, page: undefined })).toBe(
      "?sensor=BME280",
    );
  });

  test("is empty when nothing is set at all", () => {
    expect(buildQuery({ sensor: null })).toBe("");
  });

  test("escapes what belongs escaped", () => {
    expect(buildQuery({ location: "Labor & Halle" })).toBe("?location=Labor+%26+Halle");
  });

  test("the first page is the absence of a page", () => {
    expect(pageLink({ sensor: "BME280", page: "4" }, 1)).toBe("?sensor=BME280");
    expect(pageLink({ sensor: "BME280" }, 3)).toBe("?sensor=BME280&page=3");
  });

  test("clicking the active column turns the order around", () => {
    expect(sortLink({ sort: "value", dir: "desc" }, "value", "value", "desc")).toBe(
      "?sort=value&dir=asc",
    );
  });

  test("clicking another column starts it newest first", () => {
    expect(sortLink({ sort: "value", dir: "asc" }, "location", "value", "asc")).toBe(
      "?sort=location&dir=desc",
    );
  });

  test("sorting anew returns to the first page", () => {
    expect(sortLink({ page: "7" }, "value", "recorded_at", "desc")).toBe(
      "?sort=value&dir=desc",
    );
  });

  test("the page numbers are a window around the current page", () => {
    // Ten pages, standing on the fifth: 2 3 4 [5] 6 7 8.
    expect(pageWindow(5, 10)).toEqual([2, 3, 4, 5, 6, 7, 8]);
  });

  test("the window keeps its width at both ends", () => {
    expect(pageWindow(1, 10)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(pageWindow(10, 10)).toEqual([4, 5, 6, 7, 8, 9, 10]);
  });

  test("fewer pages than fit are all shown", () => {
    expect(pageWindow(2, 3)).toEqual([1, 2, 3]);
    expect(pageWindow(1, 1)).toEqual([1]);
    expect(pageWindow(1, 0)).toEqual([]);
  });

  test("the mode switch keeps the filter and only adds or drops the mode", () => {
    expect(modeLink({ sensor: "BME280" }, true)).toBe("?sensor=BME280&edit=1");
    expect(modeLink({ sensor: "BME280", edit: "1" }, false)).toBe("?sensor=BME280");
  });
});

describe("the filter chips", () => {
  const definitions = [
    { key: "device_eui", label: "Gerät" },
    { key: "sensor", label: "Sensor" },
    { key: "location", label: "Ort" },
  ];

  test("one per filter that is actually set", () => {
    const chips = filterChips({ device_eui: "70B3", sensor: "BME280" }, definitions);
    expect(chips.map((chip) => chip.key)).toEqual(["device_eui", "sensor"]);
    expect(chips[0]!.label).toBe("Gerät");
    expect(chips[0]!.value).toBe("70B3");
  });

  test("each removes only itself", () => {
    const chips = filterChips({ device_eui: "70B3", sensor: "BME280" }, definitions);
    expect(chips[0]!.queryWithout).toBe("?sensor=BME280");
    expect(chips[1]!.queryWithout).toBe("?device_eui=70B3");
  });

  test("removing a filter returns to the first page", () => {
    const chips = filterChips({ sensor: "BME280", page: "5" }, definitions);
    expect(chips[0]!.queryWithout).toBe("");
  });

  test("none when nothing is filtered", () => {
    expect(filterChips({ page: "2" }, definitions)).toEqual([]);
  });
});
