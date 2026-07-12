// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ShareModal } from "./ShareModal";

const { saveMock, exportPdfPagesMock, renderPdfPagesMock } = vi.hoisted(() => ({
  saveMock: vi.fn(),
  exportPdfPagesMock: vi.fn(),
  renderPdfPagesMock: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({ save: saveMock }));
vi.mock("html-to-image", () => ({ toBlob: vi.fn() }));
vi.mock("../lib/pdfPages", () => ({ renderPdfPages: renderPdfPagesMock }));
vi.mock("../lib/tauri", () => ({
  exportMarkdownZip: vi.fn(),
  exportPdfPages: exportPdfPagesMock,
  readBinaryFile: vi.fn(),
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
  });

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
});
