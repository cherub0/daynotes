// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ShareModal } from "./ShareModal";

const { saveMock, exportPdfPagesMock, exportMarkdownZipMock, readBinaryFileMock, renderPdfPagesMock, getNotesInRangeMock } = vi.hoisted(() => ({
  saveMock: vi.fn(),
  exportPdfPagesMock: vi.fn(),
  exportMarkdownZipMock: vi.fn(),
  readBinaryFileMock: vi.fn(),
  renderPdfPagesMock: vi.fn(),
  getNotesInRangeMock: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({ save: saveMock }));
vi.mock("html-to-image", () => ({ toBlob: vi.fn() }));
vi.mock("../lib/pdfPages", () => ({ renderPdfPages: renderPdfPagesMock }));
vi.mock("../lib/tauri", () => ({
  exportMarkdownZip: exportMarkdownZipMock,
  exportPdfPages: exportPdfPagesMock,
  getNotesInRange: getNotesInRangeMock,
  readBinaryFile: readBinaryFileMock,
  writeBinaryFile: vi.fn(),
}));

describe("ShareModal PDF export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    saveMock.mockResolvedValue("D:\\exports\\DayNotes-2026-07-11.pdf");
    renderPdfPagesMock.mockResolvedValue([new Uint8Array([137, 80, 78, 71])]);
    exportPdfPagesMock.mockResolvedValue({
      path: "D:\\exports\\DayNotes-2026-07-11.pdf",
      pages: 1,
      orientation: "portrait",
    });
    exportMarkdownZipMock.mockResolvedValue({ path: "D:\\exports\\notes.zip", image_count: 0 });
    getNotesInRangeMock.mockResolvedValue([]);
  });

  afterEach(cleanup);

  it("saves a real PDF through the native exporter", async () => {
    const onClose = vi.fn();
    const onToast = vi.fn();
    render(
      <ShareModal
        currentDate="2026-07-11"
        content="<p>PDF 内容</p>"
        todos={[]}
        onClose={onClose}
        onToast={onToast}
      />,
    );

    await waitFor(() => expect(getNotesInRangeMock).toHaveBeenCalledWith("2026-07-11", "2026-07-11"));
    fireEvent.click(screen.getByText("导出为 PDF").closest("button")!);

    await waitFor(() => expect(exportPdfPagesMock).toHaveBeenCalledOnce());
    expect(saveMock).toHaveBeenCalledWith(expect.objectContaining({
      defaultPath: "DayNotes-2026-07-11.pdf",
      filters: [{ name: "PDF 文档", extensions: ["pdf"] }],
    }));
    expect(exportPdfPagesMock).toHaveBeenCalledWith(
      "D:\\exports\\DayNotes-2026-07-11.pdf",
      "2026-07-11",
      [[137, 80, 78, 71]],
    );
    expect(onToast).toHaveBeenCalledWith("已导出 PDF：D:\\exports\\DayNotes-2026-07-11.pdf");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("exposes the shared dialog semantics and a specific close action", () => {
    render(
      <ShareModal
        currentDate="2026-07-11"
        content="<p>分享内容</p>"
        todos={[]}
        onClose={() => undefined}
        onToast={() => undefined}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: /分享/ });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(screen.getByRole("button", { name: "关闭分享" })).not.toBeNull();
  });

  it("selects an inclusive start date with the shared calendar", async () => {
    render(
      <ShareModal
        currentDate="2026-07-11"
        content="<p>当前内容</p>"
        todos={[]}
        onClose={() => undefined}
        onToast={() => undefined}
      />,
    );

    await waitFor(() => expect(getNotesInRangeMock).toHaveBeenCalledWith("2026-07-11", "2026-07-11"));
    fireEvent.click(screen.getByRole("button", { name: "分享开始日期" }));
    fireEvent.click(screen.getByRole("gridcell", { name: /2026-07-09/ }));

    await waitFor(() => expect(getNotesInRangeMock).toHaveBeenLastCalledWith("2026-07-09", "2026-07-11"));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "分享开始日期" }));
  });

  it("closes only the range calendar on Escape and restores its trigger", async () => {
    const onClose = vi.fn();
    render(<ShareModal currentDate="2026-07-11" content="<p>当前内容</p>" todos={[]} onClose={onClose} onToast={vi.fn()} />);
    const trigger = screen.getByRole("button", { name: "分享开始日期" });
    fireEvent.click(trigger);
    expect(screen.getByLabelText("选择分享开始日期")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByLabelText("选择分享开始日期")).toBeNull());
    expect(onClose).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(trigger);
  });

  it("replaces an unreadable local Markdown image with valid fallback text", async () => {
    saveMock.mockResolvedValue("D:\\exports\\notes.zip");
    readBinaryFileMock.mockRejectedValue(new Error("读取失败"));
    render(<ShareModal currentDate="2026-07-11" content='<p><img src="file:///C:/notes/image.png" alt="本地图一"><img src="file:///C:/notes/image.png" alt="本地图二"></p>' todos={[]} onClose={vi.fn()} onToast={vi.fn()} />);
    await waitFor(() => expect(getNotesInRangeMock).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: /导出为 Markdown/ }));
    await waitFor(() => expect(exportMarkdownZipMock).toHaveBeenCalled());
    const markdown = exportMarkdownZipMock.mock.calls[0][2] as string;
    expect(markdown).toContain("[本地图片：本地图一]");
    expect(markdown).toContain("[本地图片：本地图二]");
    expect(markdown).not.toContain("](images/");
  });

  it("keeps the dialog open after a load error and retries", async () => {
    getNotesInRangeMock
      .mockRejectedValueOnce(new Error("数据库忙"))
      .mockResolvedValueOnce([]);
    render(
      <ShareModal
        currentDate="2026-07-11"
        content="<p>当前内容</p>"
        todos={[]}
        onClose={() => undefined}
        onToast={() => undefined}
      />,
    );

    expect(await screen.findByText(/加载分享内容失败/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "重试加载分享内容" }));

    await waitFor(() => expect(getNotesInRangeMock).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("dialog", { name: /分享/ })).toBeTruthy();
  });

  it("uses both endpoints in a multi-day PDF filename", async () => {
    getNotesInRangeMock.mockResolvedValue([
      { date: "2026-07-09", content: "<p>较早内容</p>", todos: "[]", created_at: "", updated_at: "" },
    ]);
    render(
      <ShareModal
        currentDate="2026-07-11"
        content="<p>当前内容</p>"
        todos={[]}
        onClose={() => undefined}
        onToast={() => undefined}
      />,
    );

    await waitFor(() => expect(getNotesInRangeMock).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("button", { name: "分享开始日期" }));
    fireEvent.click(screen.getByRole("gridcell", { name: /2026-07-09/ }));
    await waitFor(() => expect(getNotesInRangeMock).toHaveBeenCalledTimes(2));
    await screen.findByText("已整理 2 天内容");
    fireEvent.click(screen.getByRole("button", { name: /导出为 PDF/ }));

    await waitFor(() => expect(saveMock).toHaveBeenCalledWith(expect.objectContaining({
      defaultPath: "DayNotes-2026-07-09_to_2026-07-11.pdf",
    })));
  });

  it("ignores an older range response that resolves after the latest selection", async () => {
    let resolveInitial!: (value: unknown[]) => void;
    let resolveLatest!: (value: unknown[]) => void;
    getNotesInRangeMock
      .mockImplementationOnce(() => new Promise((resolve) => { resolveInitial = resolve; }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveLatest = resolve; }));
    const { container } = render(
      <ShareModal
        currentDate="2026-07-11"
        content="<p>当前内容</p>"
        todos={[]}
        onClose={() => undefined}
        onToast={() => undefined}
      />,
    );

    await waitFor(() => expect(getNotesInRangeMock).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("button", { name: "分享开始日期" }));
    fireEvent.click(screen.getByRole("gridcell", { name: /2026-07-09/ }));
    await waitFor(() => expect(getNotesInRangeMock).toHaveBeenCalledTimes(2));
    resolveLatest([
      { date: "2026-07-09", content: "<p>最新范围</p>", todos: "[]", created_at: "", updated_at: "" },
    ]);
    expect(await screen.findByText("已整理 2 天内容")).toBeTruthy();
    resolveInitial([
      { date: "2026-07-10", content: "<p>旧响应</p>", todos: "[]", created_at: "", updated_at: "" },
    ]);
    await waitFor(() => expect(container.textContent).toContain("最新范围"));

    expect(container.textContent).not.toContain("旧响应");
  });
});
