import { describe, expect, it } from "vitest";
import { calculatePageSlices } from "./pdfPages";

describe("calculatePageSlices", () => {
  it("prefers content block boundaries near each A4 page end", () => {
    expect(calculatePageSlices(2200, 1000, [300, 900, 1200, 1800, 2200])).toEqual([
      { start: 0, end: 900 },
      { start: 900, end: 1800 },
      { start: 1800, end: 2200 },
    ]);
  });

  it("falls back to a hard slice for an element taller than one page", () => {
    expect(calculatePageSlices(2500, 1000, [2500])).toEqual([
      { start: 0, end: 1000 },
      { start: 1000, end: 2000 },
      { start: 2000, end: 2500 },
    ]);
  });
});
