import { describe, expect, test } from "bun:test";
import { createPagination, parsePagination } from "./pagination";

describe("parsePagination", () => {
  test("defaults to page 1 / 20 per page", () => {
    expect(parsePagination({})).toEqual({ page: 1, perPage: 20, offset: 0 });
  });

  test("computes the offset from page and per_page", () => {
    expect(parsePagination({ page: 3, per_page: 10 })).toEqual({
      page: 3,
      perPage: 10,
      offset: 20,
    });
  });
});

describe("createPagination", () => {
  test("computes total_pages and has_next on a middle page", () => {
    const params = { page: 1, perPage: 20, offset: 0 };
    expect(createPagination(params, 45)).toEqual({
      page: 1,
      per_page: 20,
      total: 45,
      total_pages: 3,
      has_next: true,
    });
  });

  test("has_next is false on the last page", () => {
    const params = { page: 3, perPage: 20, offset: 40 };
    expect(createPagination(params, 45).has_next).toBe(false);
  });

  test("total_pages is 0 when there are no items", () => {
    const params = { page: 1, perPage: 20, offset: 0 };
    const result = createPagination(params, 0);
    expect(result.total_pages).toBe(0);
    expect(result.has_next).toBe(false);
  });
});
