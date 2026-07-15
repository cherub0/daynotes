// @vitest-environment jsdom

// @ts-expect-error Vitest runs in Node, but this frontend project does not install Node type declarations.
import { readFileSync } from "node:fs";
import { render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Editor } from "./Editor";

describe("Editor task list experience", () => {
  it("gives empty task items a contextual editing prompt", () => {
    const source = readFileSync("src/components/Editor.tsx", "utf8");

    expect(source).toMatch(/Placeholder\.configure\(\{[\s\S]*includeChildren:\s*true/);
    expect(source).toContain("输入任务内容，按 Enter 新增下一项");
    expect(source).toMatch(/ul\[data-type="taskList"\][^{]*p\.is-empty::before\s*\{[^}]*content:\s*attr\(data-placeholder\)/s);
  });

  it("keeps task paragraphs compact and adds item focus feedback without changing normal paragraphs", () => {
    const source = readFileSync("src/components/Editor.tsx", "utf8");

    expect(source).toMatch(/ul\[data-type="taskList"\][^{]*> li > div > p\s*\{[^}]*margin:\s*0/s);
    expect(source).toMatch(/ul\[data-type="taskList"\][^{]*> li\.is-current-task-item,[^{]*\{[^}]*box-shadow:/s);
    expect(source).toContain("Decoration.node");
    expect(source).toContain("is-current-task-item");
    expect(source).toMatch(/\.editor-content \.ProseMirror p\s*\{\s*margin:\s*\.3em 0;/);
  });

  it("applies externally loaded content without emitting a user update", async () => {
    const onChange = vi.fn();
    const onRetrySave = vi.fn();
    const { container, rerender } = render(
      <Editor
        content="<p>first</p>"
        onChange={onChange}
        saveStatus="saved"
        onRetrySave={onRetrySave}
      />,
    );
    await waitFor(() => expect(container.querySelector(".ProseMirror")?.textContent).toBe("first"));
    onChange.mockClear();

    rerender(
      <Editor
        content="<p>second</p>"
        onChange={onChange}
        saveStatus="saved"
        onRetrySave={onRetrySave}
      />,
    );
    await waitFor(() => expect(container.querySelector(".ProseMirror")?.textContent).toBe("second"));

    expect(onChange).not.toHaveBeenCalled();
  });
});
