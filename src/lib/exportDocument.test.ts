// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import {
  createExportCollection,
  parseExportDocument,
  renderCollectionMarkdown,
  renderMarkdown,
} from "./exportDocument";

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

  it("preserves every editable style in Markdown", () => {
    const doc = parseExportDocument(
      "2026-07-12",
      `<h1>一级标题</h1><h2>二级标题</h2><h3>三级标题</h3>
       <p><strong>粗体</strong><em>斜体</em><u>下划线</u><s>删除线</s><mark>高亮</mark><code>代码</code><a href="https://example.com">链接</a></p>
       <ul data-type="taskList"><li data-type="taskItem" data-checked="true"><div><p>已完成任务</p></div></li><li data-type="taskItem" data-checked="false"><div><p>未完成任务</p></div></li></ul>
       <blockquote><p>引用内容</p></blockquote><pre><code class="language-ts">const value = 1;</code></pre>
       <table><tbody><tr><th><strong>粗体表头</strong></th><th>列二</th></tr><tr><td><a href="https://example.com/cell">单元格链接</a></td><td>值</td></tr></tbody></table>`,
      [],
    );

    const markdown = renderMarkdown(doc).markdown;
    expect(markdown).toContain("<u>下划线</u>");
    expect(markdown).toContain("<mark>高亮</mark>");
    expect(markdown).toContain("- [x] 已完成任务");
    expect(markdown).toContain("- [ ] 未完成任务");
    expect(markdown).toContain("**粗体表头**");
    expect(markdown).toContain("[单元格链接](https://example.com/cell)");
  });

  it("renders multiple days in order with unique image names and scheduled todos", () => {
    const collection = createExportCollection("2026-07-12", "2026-07-14", [
      {
        date: "2026-07-14",
        content: '<p>第二天</p><img src="data:image/png;base64,YQ==" alt="二">',
        todos: [{ id: "2", text: "复盘", done: false, date: "2026-07-14", time: "14:30" }],
      },
      {
        date: "2026-07-12",
        content: '<p>第一天</p><img src="data:image/png;base64,Yg==" alt="一">',
        todos: [],
      },
    ]);

    const output = renderCollectionMarkdown(collection);

    expect(output.markdown.indexOf("# 2026-07-12")).toBeLessThan(
      output.markdown.indexOf("# 2026-07-14"),
    );
    expect(output.markdown).toContain("截止：2026-07-14 14:30");
    expect(new Set(output.images.map((image) => image.filename)).size).toBe(output.images.length);
    expect(output.images.map((image) => image.filename)).toEqual([
      "2026-07-12-image-1.png",
      "2026-07-14-image-1.png",
    ]);
  });
});
