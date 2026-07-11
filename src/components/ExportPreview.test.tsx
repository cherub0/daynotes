// @vitest-environment jsdom

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { parseExportDocument } from "../lib/exportDocument";
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
});
