// @vitest-environment jsdom

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createExportCollection, parseExportDocument } from "../lib/exportDocument";
import { ExportPreview } from "./ExportPreview";

describe("ExportPreview", () => {
  it("renders semantic content and real images without placeholders", () => {
    const document = parseExportDocument(
      "2026-07-11",
      `<h2>标题</h2><p><a href="https://example.com">链接</a></p>
       <pre><code>const x = 1</code></pre><table><tbody><tr><td>A</td></tr></tbody></table>
       <img src="data:image/png;base64,aGVsbG8=" alt="图">`,
      [{ id: "1", text: "待办", done: false }],
    );
    const { container } = render(<ExportPreview document={document} />);
    expect(container.querySelector("h2")?.textContent).toBe("标题");
    expect(container.querySelector("a")?.getAttribute("href")).toBe("https://example.com");
    expect(container.querySelector("pre")?.textContent).toContain("const x = 1");
    expect(container.querySelector("table td")?.textContent).toBe("A");
    expect(container.querySelector("img")?.getAttribute("src")).toContain("data:image/png");
    expect(container.textContent).not.toMatch(/\[图片 \d+\]/);
  });

  it("renders multiple dated sections in ascending order inside one export document", () => {
    const collection = createExportCollection("2026-07-12", "2026-07-14", [
      { date: "2026-07-14", content: "<p>第二天</p>", todos: [] },
      { date: "2026-07-12", content: "<p>第一天</p>", todos: [] },
    ]);

    const { container } = render(<ExportPreview collection={collection} />);
    const days = Array.from(container.querySelectorAll<HTMLElement>(".export-day"));

    expect(days).toHaveLength(2);
    expect(days.map((day) => day.dataset.date)).toEqual(["2026-07-12", "2026-07-14"]);
    expect(container.querySelectorAll(".export-header")).toHaveLength(1);
    expect(container.querySelectorAll(".export-footer")).toHaveLength(1);
  });
});
