// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { calculatePageSlices, collectPdfBreakpoints } from "./pdfPages";

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

  it("collects block and table-row boundaries inside dated export sections", () => {
    document.body.innerHTML = `<div class="export-document"><div class="export-header"></div><div class="export-body"><section class="export-day"><h1 class="export-day-date"></h1><p></p><table><tbody><tr></tr><tr></tr></tbody></table></section></div><div class="export-footer"></div></div>`;
    const root = document.querySelector<HTMLElement>(".export-document")!;
    const bottoms = [40, 80, 160, 240, 300, 360];
    [root.querySelector(".export-header"), root.querySelector(".export-day-date"), root.querySelector("p"), ...root.querySelectorAll("tr"), root.querySelector(".export-footer")]
      .forEach((element, index) => Object.defineProperty(element, "getBoundingClientRect", { value: () => ({ top: 0, bottom: bottoms[index] }) }));
    Object.defineProperty(root, "getBoundingClientRect", { value: () => ({ top: 0, bottom: 400 }) });

    expect(collectPdfBreakpoints(root, 1)).toEqual(bottoms);
  });
});
