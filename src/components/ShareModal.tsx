import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toBlob } from "html-to-image";
import { save } from "@tauri-apps/plugin-dialog";
import type { TodoItem } from "../lib/types";
import {
  createExportCollection,
  renderCollectionHtml,
  renderCollectionMarkdown,
  type ExportImage,
} from "../lib/exportDocument";
import { getShareBaseName, mergeShareEntries, type ShareEntry } from "../lib/shareRange";
import {
  exportMarkdownZip,
  exportPdfPages,
  getNotesInRange,
  readBinaryFile,
  writeBinaryFile,
  type ExportImagePayload,
} from "../lib/tauri";
import { renderPdfPages } from "../lib/pdfPages";
import { CalendarPicker } from "./CalendarPicker";
import { ExportPreview } from "./ExportPreview";
import { Button } from "./ui/Button";
import { ModalShell } from "./ui/ModalShell";
import { StatusBadge } from "./ui/StatusBadge";

async function loadExportImage(image: ExportImage): Promise<Uint8Array | null> {
  if (image.kind === "local") {
    try {
      return new Uint8Array(await readBinaryFile(image.source));
    } catch {
      return null;
    }
  }
  if (image.kind === "data") {
    const comma = image.source.indexOf(",");
    if (comma === -1) return null;
    const isBase64 = image.source.slice(0, comma).includes(";base64");
    const data = image.source.slice(comma + 1);
    try {
      if (isBase64) {
        const binary = atob(data);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
        return bytes;
      }
      return new TextEncoder().encode(decodeURIComponent(data));
    } catch {
      return null;
    }
  }
  const response = await fetch(image.source);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

interface ShareModalProps {
  currentDate: string;
  content: string;
  todos: TodoItem[];
  onClose: () => void;
  onToast: (msg: string) => void;
}

type LoadState = "loading" | "ready" | "error";
type DatePickerTarget = "start" | "end" | null;

export function ShareModal({ currentDate, content, todos, onClose, onToast }: ShareModalProps) {
  const [startDate, setStartDate] = useState(currentDate);
  const [endDate, setEndDate] = useState(currentDate);
  const [entries, setEntries] = useState<ShareEntry[]>(() =>
    mergeShareEntries([], { date: currentDate, content, todos }),
  );
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState("");
  const [pickerTarget, setPickerTarget] = useState<DatePickerTarget>(null);
  const [exporting, setExporting] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef(0);

  const currentEntry = useMemo<ShareEntry>(
    () => ({ date: currentDate, content, todos }),
    [content, currentDate, todos],
  );

  const loadRange = useCallback(async () => {
    const request = ++requestRef.current;
    setLoadState("loading");
    setLoadError("");
    try {
      const notes = await getNotesInRange(startDate, endDate);
      if (request !== requestRef.current) return;
      const localCurrent = currentDate >= startDate && currentDate <= endDate ? currentEntry : undefined;
      setEntries(mergeShareEntries(notes, localCurrent));
      setLoadState("ready");
    } catch (error) {
      if (request !== requestRef.current) return;
      setLoadError(`加载分享内容失败：${String(error)}`);
      setLoadState("error");
    }
  }, [currentDate, currentEntry, endDate, startDate]);

  useEffect(() => {
    void loadRange();
    return () => {
      requestRef.current += 1;
    };
  }, [loadRange]);

  const collection = useMemo(
    () => createExportCollection(startDate, endDate, entries),
    [endDate, entries, startDate],
  );
  const baseName = getShareBaseName(startDate, endDate);
  const canExport = loadState === "ready" && collection.documents.length > 0 && !exporting;

  function stripHtml(html: string): string {
    const div = document.createElement("div");
    div.innerHTML = html;
    return div.textContent || "";
  }

  function selectRangeDate(target: Exclude<DatePickerTarget, null>, date: string) {
    setPickerTarget(null);
    if (target === "start") {
      setStartDate(date);
      if (date > endDate) setEndDate(date);
    } else {
      setEndDate(date);
      if (date < startDate) setStartDate(date);
    }
  }

  async function exportMarkdown() {
    setExporting(true);
    try {
      const path = await save({
        title: "导出 Markdown 压缩包",
        defaultPath: `${baseName}.zip`,
        filters: [{ name: "ZIP 压缩包", extensions: ["zip"] }],
      });
      if (!path) return;

      const exported = renderCollectionMarkdown(collection);
      let markdown = exported.markdown;
      const payloads: ExportImagePayload[] = [];
      let remoteFailures = 0;
      let localSkipped = 0;
      for (const image of exported.images) {
        const bytes = await loadExportImage(image).catch(() => null);
        if (!bytes) {
          if (image.kind === "remote") remoteFailures += 1;
          if (image.kind === "local") {
            localSkipped += 1;
            markdown = markdown
              .split(`images/${image.filename}`)
              .join(`[本地图片：${image.alt || image.filename}]`);
          }
          continue;
        }
        payloads.push({ path: `images/${image.filename}`, bytes: Array.from(bytes) });
        if (image.kind === "remote") {
          markdown = markdown.replace(
            `![${image.alt}](${image.source})`,
            `![${image.alt}](images/${image.filename})`,
          );
        }
      }

      const result = await exportMarkdownZip(path, `${baseName}.md`, markdown, payloads);
      const warnings: string[] = [];
      if (remoteFailures) warnings.push(`${remoteFailures} 张网络图片未能下载`);
      if (localSkipped) warnings.push(`${localSkipped} 张本地图片未打包（仅限应用内可见）`);
      onToast(warnings.length
        ? `已导出到 ${result.path}，${warnings.join("，")}`
        : `已导出 Markdown 压缩包：${result.path}`);
      onClose();
    } catch (error) {
      onToast(`导出失败：${String(error)}`);
    } finally {
      setExporting(false);
    }
  }

  async function exportPDF() {
    setExporting(true);
    try {
      const path = await save({
        title: "导出 PDF",
        defaultPath: `${baseName}.pdf`,
        filters: [{ name: "PDF 文档", extensions: ["pdf"] }],
      });
      if (!path) return;
      if (!previewRef.current) throw new Error("PDF 预览尚未就绪");
      const pages = await renderPdfPages(previewRef.current);
      const pdfTitle = startDate === endDate ? startDate : `${startDate}_${endDate}`;
      const result = await exportPdfPages(path, pdfTitle, pages.map((page) => Array.from(page)));
      onToast(`已导出 PDF：${result.path}`);
      onClose();
    } catch (error) {
      onToast(`PDF 导出失败：${String(error)}`);
    } finally {
      setExporting(false);
    }
  }

  async function copyAsHtml() {
    try {
      const html = renderCollectionHtml(collection);
      const plainText = stripHtml(html);
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([plainText], { type: "text/plain" }),
        }),
      ]);
      onToast("已复制到剪贴板，可直接粘贴到邮件/文档");
    } catch {
      await navigator.clipboard.writeText(collection.documents.map((item) =>
        `${item.date}\n${stripHtml(renderCollectionHtml({ startDate: item.date, endDate: item.date, documents: [item] }))}`,
      ).join("\n\n"));
      onToast("已复制纯文本到剪贴板");
    }
    onClose();
  }

  async function exportImage() {
    setExporting(true);
    try {
      const path = await save({
        title: "导出图片",
        defaultPath: `${baseName}.png`,
        filters: [{ name: "PNG 图片", extensions: ["png"] }],
      });
      if (!path) return;
      if (!previewRef.current) throw new Error("预览元素未就绪");
      await document.fonts.ready;
      const blob = await toBlob(previewRef.current, {
        pixelRatio: 2,
        backgroundColor: "#ffffff",
        cacheBust: true,
      });
      if (!blob) throw new Error("无法生成图片数据");
      await writeBinaryFile(path, Array.from(new Uint8Array(await blob.arrayBuffer())));
      onToast(`已导出图片：${path}`);
      onClose();
    } catch (error) {
      onToast(`图片导出失败：${String(error)}`);
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <div style={{ position: "fixed", left: -100000, top: 0, width: 800, pointerEvents: "none" }}>
        <ExportPreview collection={collection} previewRef={previewRef} />
      </div>
      <ModalShell title="分享笔记" onClose={onClose} closeLabel="关闭分享">
        <div className="share-range" aria-label="分享日期范围">
          <div className="share-date-field">
            <span>开始日期</span>
            <Button aria-label="分享开始日期" variant="secondary" onClick={() => setPickerTarget("start")}>
              {startDate}
            </Button>
            {pickerTarget === "start" && (
              <div className="share-date-picker">
                <CalendarPicker
                  currentDate={startDate}
                  noteDates={new Set(entries.map((entry) => entry.date))}
                  label="选择分享开始日期"
                  onSelect={(date) => selectRangeDate("start", date)}
                  onClose={() => setPickerTarget(null)}
                />
              </div>
            )}
          </div>
          <span className="share-range-separator" aria-hidden="true">—</span>
          <div className="share-date-field">
            <span>结束日期</span>
            <Button aria-label="分享结束日期" variant="secondary" onClick={() => setPickerTarget("end")}>
              {endDate}
            </Button>
            {pickerTarget === "end" && (
              <div className="share-date-picker share-date-picker--end">
                <CalendarPicker
                  currentDate={endDate}
                  noteDates={new Set(entries.map((entry) => entry.date))}
                  label="选择分享结束日期"
                  onSelect={(date) => selectRangeDate("end", date)}
                  onClose={() => setPickerTarget(null)}
                />
              </div>
            )}
          </div>
        </div>

        <div className="share-load-state" aria-live="polite">
          {loadState === "loading" && <StatusBadge status="saving">正在整理分享内容…</StatusBadge>}
          {loadState === "ready" && collection.documents.length > 0 && (
            <StatusBadge status="saved">已整理 {collection.documents.length} 天内容</StatusBadge>
          )}
          {loadState === "ready" && collection.documents.length === 0 && (
            <StatusBadge status="dirty">所选范围没有可分享内容</StatusBadge>
          )}
          {loadState === "error" && (
            <div className="share-load-error" role="alert">
              <span>{loadError}</span>
              <Button variant="secondary" aria-label="重试加载分享内容" onClick={() => void loadRange()}>
                重试
              </Button>
            </div>
          )}
        </div>

        <div className="share-options">
          <Button variant="secondary" className="share-option" onClick={exportMarkdown} disabled={!canExport}>
            <div className="share-option-icon">📄</div>
            <div className="share-option-text"><strong>导出为 Markdown</strong><span>保存为含图片资源的 ZIP 压缩包</span></div>
          </Button>
          <Button variant="secondary" className="share-option" onClick={copyAsHtml} disabled={!canExport}>
            <div className="share-option-icon">📋</div>
            <div className="share-option-text"><strong>复制为富文本</strong><span>直接粘贴到邮件 / 飞书 / 钉钉</span></div>
          </Button>
          <Button variant="secondary" className="share-option" onClick={exportPDF} disabled={!canExport}>
            <div className="share-option-icon">🖨</div>
            <div className="share-option-text"><strong>导出为 PDF</strong><span>按日期顺序生成分页文档</span></div>
          </Button>
          <Button variant="secondary" className="share-option" onClick={exportImage} disabled={!canExport}>
            <div className="share-option-icon">🖼</div>
            <div className="share-option-text"><strong>导出为图片</strong><span>生成连续排列的 PNG 长图</span></div>
          </Button>
        </div>
        {exporting && <div className="share-export-status"><StatusBadge status="saving">导出中…</StatusBadge></div>}
      </ModalShell>
    </>
  );
}

export default ShareModal;
