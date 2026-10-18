import { describe, it, expect } from "vitest";
import {
  normalisePagination,
  paginate,
  parsePage,
  paginateArray,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from "./pagination";

describe("normalisePagination", () => {
  it("returns defaults when no params are provided", () => {
    const result = normalisePagination();
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(DEFAULT_PAGE_SIZE);
    expect(result.offset).toBe(0);
    expect(result.limit).toBe(DEFAULT_PAGE_SIZE + 1);
  });

  it("returns defaults for empty params", () => {
    const result = normalisePagination({});
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(DEFAULT_PAGE_SIZE);
  });

  it("respects provided page and pageSize", () => {
    const result = normalisePagination({ page: 3, pageSize: 25 });
    expect(result.page).toBe(3);
    expect(result.pageSize).toBe(25);
    expect(result.offset).toBe(50);
    expect(result.limit).toBe(26);
  });

  it("clamps page to minimum of 1", () => {
    const result = normalisePagination({ page: -5 });
    expect(result.page).toBe(1);
  });

  it("clamps page 0 to 1", () => {
    const result = normalisePagination({ page: 0 });
    expect(result.page).toBe(1);
  });

  it("clamps pageSize to minimum of 1", () => {
    const result = normalisePagination({ pageSize: 0 });
    expect(result.pageSize).toBe(1);
  });

  it("clamps pageSize to MAX_PAGE_SIZE", () => {
    const result = normalisePagination({ pageSize: 1000 });
    expect(result.pageSize).toBe(MAX_PAGE_SIZE);
  });

  it("calculates correct offset for page 2", () => {
    const result = normalisePagination({ page: 2, pageSize: 10 });
    expect(result.offset).toBe(10);
  });
});

describe("paginate", () => {
  it("returns all rows when fewer than pageSize", () => {
    const rows = [1, 2, 3];
    const result = paginate(rows, 1, 10);
    expect(result.data).toEqual([1, 2, 3]);
    expect(result.hasMore).toBe(false);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(10);
  });

  it("returns exactly pageSize rows when equal", () => {
    const rows = [1, 2, 3, 4, 5];
    const result = paginate(rows, 1, 5);
    expect(result.data).toEqual([1, 2, 3, 4, 5]);
    expect(result.hasMore).toBe(false);
  });

  it("trims extra row and sets hasMore when more than pageSize", () => {
    const rows = [1, 2, 3, 4, 5, 6]; // 6 rows, pageSize=5
    const result = paginate(rows, 1, 5);
    expect(result.data).toEqual([1, 2, 3, 4, 5]);
    expect(result.hasMore).toBe(true);
  });

  it("handles empty rows", () => {
    const result = paginate([], 1, 10);
    expect(result.data).toEqual([]);
    expect(result.hasMore).toBe(false);
  });
});

describe("parsePage", () => {
  it("extracts page number from search params", () => {
    expect(parsePage({ page: "3" })).toEqual({ page: 3 });
  });

  it("defaults to page 1 when not provided", () => {
    expect(parsePage({})).toEqual({ page: 1 });
  });

  it("defaults to page 1 for non-numeric strings", () => {
    expect(parsePage({ page: "abc" })).toEqual({ page: 1 });
  });

  it("clamps negative page to 1", () => {
    expect(parsePage({ page: "-3" })).toEqual({ page: 1 });
  });

  it("clamps zero page to 1", () => {
    expect(parsePage({ page: "0" })).toEqual({ page: 1 });
  });

  it("handles array value by defaulting to 1", () => {
    expect(parsePage({ page: ["2", "3"] })).toEqual({ page: 1 });
  });
});

describe("paginateArray", () => {
  const items = Array.from({ length: 120 }, (_, i) => i + 1);

  it("returns first page with correct slice", () => {
    const result = paginateArray(items, 1, 50);
    expect(result.data.length).toBe(50);
    expect(result.data[0]).toBe(1);
    expect(result.data[49]).toBe(50);
    expect(result.meta.hasMore).toBe(true);
  });

  it("returns second page", () => {
    const result = paginateArray(items, 2, 50);
    expect(result.data.length).toBe(50);
    expect(result.data[0]).toBe(51);
    expect(result.meta.hasMore).toBe(true);
  });

  it("returns last page with fewer items", () => {
    const result = paginateArray(items, 3, 50);
    expect(result.data.length).toBe(20);
    expect(result.data[0]).toBe(101);
    expect(result.meta.hasMore).toBe(false);
  });

  it("returns empty when page is past the end", () => {
    const result = paginateArray(items, 10, 50);
    expect(result.data).toEqual([]);
    expect(result.meta.hasMore).toBe(false);
  });

  it("uses DEFAULT_PAGE_SIZE when not specified", () => {
    const result = paginateArray(items, 1);
    expect(result.data.length).toBe(DEFAULT_PAGE_SIZE);
  });
});
