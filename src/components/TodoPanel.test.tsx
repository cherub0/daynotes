// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TodoItem } from "../lib/types";
import { TodoPanel } from "./TodoPanel";

afterEach(cleanup);

describe("TodoPanel", () => {
  it("通过具名控件完成和删除待办", () => {
    const onChange = vi.fn();
    const todos: TodoItem[] = [{ id: "1", text: "完成复盘", done: false }];
    const { rerender } = render(<TodoPanel todos={todos} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "完成待办：完成复盘" }));
    expect(onChange).toHaveBeenCalledWith([{ id: "1", text: "完成复盘", done: true }]);

    rerender(
      <TodoPanel
        todos={[{ id: "1", text: "完成复盘", done: true }]}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "删除待办：完成复盘" }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it("播报进度并支持按 Enter 添加待办", () => {
    const onChange = vi.fn();
    render(<TodoPanel todos={[]} onChange={onChange} />);

    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("0");
    expect(screen.getByText("已完成 0 / 0")).toBeTruthy();
    const input = screen.getByRole("textbox", { name: "新待办" });
    fireEvent.change(input, { target: { value: "散步" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ text: "散步", done: false }),
    ]);
  });

  it("编辑内容和提醒时间时保持待办序列化结构", () => {
    const onChange = vi.fn();
    const todo: TodoItem = { id: "1", text: "完成复盘", done: false, time: "14:00" };
    render(<TodoPanel todos={[todo]} onChange={onChange} />);

    fireEvent.change(screen.getByRole("textbox", { name: "待办内容：完成复盘" }), {
      target: { value: "整理复盘" },
    });
    expect(onChange).toHaveBeenLastCalledWith([
      { id: "1", text: "整理复盘", done: false, time: "14:00" },
    ]);

    fireEvent.change(screen.getByRole("textbox", { name: "提醒时间：完成复盘" }), {
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
    render(<TodoPanel todos={todos} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "恢复待办：已完成" }));

    expect(onChange).toHaveBeenCalledWith([
      { id: "1", text: "未完成", done: false },
      { id: "2", text: "已完成", done: false },
    ]);
  });
});
