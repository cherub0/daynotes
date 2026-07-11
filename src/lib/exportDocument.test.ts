// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { parseExportDocument, renderMarkdown } from "./exportDocument";

describe("export document", () => {
  it("parses rich note blocks and renders portable Markdown", () => {
    const doc = parseExportDocument(
      "2026-07-11",
      `<h2>标题</h2><p>访问 <a href="https://example.com">示例</a></p>
       <table><tbody><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></tbody></table>
       <pre><code class="language-rust">fn main() {}</code></pre>
       <img src="data:image/png;base64,aGVsbG8=" alt="图">`,
      [{ id: "1", text: "完成导出", done: false }],
    );

    expect(doc.blocks.map((block) => block.kind)).toEqual([
      "heading",
      "paragraph",
      "table",
      "code",
      "image",
      "todos",
    ]);

    const output = renderMarkdown(doc);
    expect(output.markdown).toContain("[示例](https://example.com)");
    expect(output.markdown).toContain("![图](images/image-1.png)");
    expect(output.markdown).toContain("```rust");
    expect(output.images).toHaveLength(1);
  });

  it("deduplicates images and keeps their first-seen order", () => {
    const source = "data:image/jpeg;base64,aGVsbG8=";
    const doc = parseExportDocument(
      "2026-07-11",
      `<p>before</p><img src="${source}" alt="one"><img src="${source}" alt="two">`,
      [],
    );

    const output = renderMarkdown(doc);
    expect(output.images).toHaveLength(1);
    expect(output.images[0].filename).toBe("image-1.jpg");
    expect(output.markdown.match(/images\/image-1\.jpg/g)).toHaveLength(2);
  });

  it("escapes Markdown table pipes and preserves remote image URLs", () => {
    const doc = parseExportDocument(
      "2026-07-11",
      `<table><tbody><tr><th>A|B</th></tr><tr><td>C|D</td></tr></tbody></table>
       <img src="https://example.com/picture.webp" alt="remote">`,
      [],
    );

    const output = renderMarkdown(doc);
    expect(output.markdown).toContain("A\\|B");
    expect(output.markdown).toContain("C\\|D");
    expect(output.markdown).toContain("![remote](https://example.com/picture.webp)");
    expect(output.images).toHaveLength(1);
    expect(output.images[0].kind).toBe("remote");
  });
});
