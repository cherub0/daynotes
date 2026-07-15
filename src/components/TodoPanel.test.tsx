// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
// @ts-expect-error Vitest runs in Node, but this frontend project does not install Node type declarations.
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TodoItem } from "../lib/types";
import { isTodoOverdue } from "../lib/types";
import { TodoPanel } from "./TodoPanel";

afterEach(cleanup);

describe("TodoPanel", () => {
  it("通过具名控件完成和删除待办", () => {
    const onChange = vi.fn();
    const todos: TodoItem[] = [{ id: "1", text: "完成复盘", done: false }];
    const { rerender } = render(<TodoPanel currentDate="2026-07-15" todos={todos} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "完成待办：完成复盘" }));
    expect(onChange).toHaveBeenCalledWith([{ id: "1", text: "完成复盘", done: true }]);

    rerender(
      <TodoPanel
        currentDate="2026-07-15"
        todos={[{ id: "1", text: "完成复盘", done: true }]}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "删除待办：完成复盘" }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it("播报进度并支持按 Enter 添加待办", () => {
    const onChange = vi.fn();
    render(<TodoPanel currentDate="2026-07-15" todos={[]} onChange={onChange} />);

    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("0");
    expect(screen.getByText("已完成 0 / 0")).toBeTruthy();
    const input = screen.getByRole("textbox", { name: "新待办" });
    fireEvent.change(input, { target: { value: "散步" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ text: "散步", done: false, date: "2026-07-15", time: undefined }),
    ]);
  });

  it("编辑内容和提醒时间时保持待办序列化结构", () => {
    const onChange = vi.fn();
    const todo: TodoItem = { id: "1", text: "完成复盘", done: false, time: "14:00" };
    render(<TodoPanel currentDate="2026-07-15" todos={[todo]} onChange={onChange} />);

    fireEvent.change(screen.getByRole("textbox", { name: "待办内容：完成复盘" }), {
      target: { value: "整理复盘" },
    });
    expect(onChange).toHaveBeenLastCalledWith([
      { id: "1", text: "整理复盘", done: false, time: "14:00" },
    ]);

    fireEvent.change(screen.getByLabelText("截止时间：完成复盘"), {
      target: { value: "15:30" },
    });
    expect(onChange).toHaveBeenLastCalledWith([
      { id: "1", text: "完成复盘", done: false, time: "15:30" },
    ]);
  });

  it("已完成待办可恢复并保留原有顺序", () => {
    const onChange = vi.fn();
    const todos: TodoItem[] = [
      { id: "1", text: "未完成", done: false },
      { id: "2", text: "已完成", done: true },
    ];
    render(<TodoPanel currentDate="2026-07-15" todos={todos} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "恢复待办：已完成" }));

    expect(onChange).toHaveBeenCalledWith([
      { id: "1", text: "未完成", done: false },
      { id: "2", text: "已完成", done: false },
    ]);
  });

  it("为键盘聚焦的待办文本显示高对比度焦点环", () => {
    const appCss = readFileSync("src/App.css", "utf8");

    expect(appCss).toMatch(
      /\.todo-text:focus-visible\s*{[^}]*outline:\s*3px solid var\(--focus-ring\);[^}]*outline-offset:\s*2px;/s,
    );
  });

  it("通过日历选择或清除截止日期，并可修改和清除截止时间", async () => {
    const onChange = vi.fn();
    const todo: TodoItem = { id: "1", text: "提交报告", done: false, date: "2026-07-31", time: "14:00" };
    const { rerender } = render(<TodoPanel currentDate="2026-07-15" todos={[todo]} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "截止日期：提交报告" }));
    fireEvent.keyDown(screen.getByRole("gridcell", { name: /2026-07-31/ }), { key: "PageDown" });
    fireEvent.click(screen.getByRole("gridcell", { name: /2026-08-31/ }));
    expect(onChange).toHaveBeenLastCalledWith([
      { ...todo, date: "2026-08-31" },
    ]);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "截止日期：提交报告" })));

    const timeInput = screen.getByLabelText("截止时间：提交报告");
    expect(timeInput.getAttribute("type")).toBe("time");
    fireEvent.change(timeInput, { target: { value: "15:30" } });
    expect(onChange).toHaveBeenLastCalledWith([{ ...todo, time: "15:30" }]);
    fireEvent.change(timeInput, { target: { value: "" } });
    expect(onChange).toHaveBeenLastCalledWith([{ id: "1", text: "提交报告", done: false, date: "2026-07-31", time: undefined }]);

    fireEvent.click(screen.getByRole("button", { name: "清除截止日期：提交报告" }));
    expect(onChange).toHaveBeenLastCalledWith([
      { id: "1", text: "提交报告", done: false, date: undefined, time: "14:00" },
    ]);
    rerender(<TodoPanel currentDate="2026-07-15" todos={[{ ...todo, date: undefined }]} onChange={onChange} />);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "截止日期：提交报告" })));
  });

  it("兼容无日期旧待办，并标记逾期但未完成的事项", () => {
    const oldTodo: TodoItem = { id: "old", text: "旧待办", done: false };
    const overdue: TodoItem = { id: "late", text: "过期待办", done: false, date: "2026-07-14", time: "18:00" };
    const { container } = render(
      <TodoPanel currentDate="2026-07-15" todos={[oldTodo, overdue]} onChange={vi.fn()} />,
    );

    expect(screen.getByDisplayValue("旧待办")).toBeTruthy();
    expect(container.querySelector<HTMLInputElement>(".todo-item--overdue .todo-text")?.value).toBe("过期待办");
    expect(container.textContent).toContain("已逾期");
    expect(isTodoOverdue(overdue, new Date(2026, 6, 15, 9, 0))).toBe(true);
    expect(isTodoOverdue({ ...overdue, done: true }, new Date(2026, 6, 15, 9, 0))).toBe(false);
  });
});
