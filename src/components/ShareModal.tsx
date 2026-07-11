import { useMemo, useRef, useState } from "react";
import { toBlob } from "html-to-image";
import { formatDateDisplay } from "../lib/types";
import type { TodoItem } from "../lib/types";
import { save } from "@tauri-apps/plugin-dialog";
import { parseExportDocument, renderMarkdown, type ExportImage } from "../lib/exportDocument";
import { exportMarkdownZip, exportPdf, type ExportImagePayload, type PdfImagePayload } from "../lib/tauri";
import { ExportPreview } from "./ExportPreview";

interface ShareModalProps {
  currentDate: string;
  content: string;
  todos: TodoItem[];
  onClose: () => void;
  onToast: (msg: string) => void;
}

function decodeDataUrl(source: string): Uint8Array | null {
  const comma = source.indexOf(",");
  if (comma === -1) return null;
  const isBase64 = source.slice(0, comma).includes(";base64");
  const data = source.slice(comma + 1);
  try {
    if (isBase64) {
      const binary = atob(data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return bytes;
    }
    return new TextEncoder().encode(decodeURIComponent(data));
  } catch {
    return null;
  }
}

async function loadExportImage(image: ExportImage): Promise<Uint8Array | null> {
  if (image.kind === "local") return null;
  if (image.kind === "data") return decodeDataUrl(image.source);
  const response = await fetch(image.source);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

async function buildPdfImage(image: ExportImage): Promise<PdfImagePayload | null> {
  const bytes = await loadExportImage(image);
  if (!bytes) return null;
  const bitmap = await createImageBitmap(new Blob([bytes]));
  const payload = { id: image.id, bytes: Array.from(bytes), width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return payload;
}

export function ShareModal({ currentDate, content, todos, onClose, onToast }: ShareModalProps) {
  const [exporting, setExporting] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const previewDocument = useMemo(
    () => parseExportDocument(currentDate, content, todos),
    [currentDate, content, todos],
  );

  function stripHtml(html: string): string {
    const div = document.createElement("div");
    div.innerHTML = html;
    return div.textContent || "";
  }

  async function exportMarkdown() {
    setExporting(true);
    try {
      const path = await save({
        title: "导出 Markdown 压缩包",
        defaultPath: `DayNotes-${currentDate}.zip`,
        filters: [{ name: "ZIP 压缩包", extensions: ["zip"] }],
      });
      if (!path) return;

      const exported = renderMarkdown(parseExportDocument(currentDate, content, todos));
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
            const escaped = image.source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            markdown = markdown.replace(
              new RegExp(`!\\[([^\\]]*)\\]\\(${escaped}\\)`, "g"),
              `[本地图片：${image.alt || image.filename}]`,
            );
          }
          continue;
        }
        payloads.push({ path: `images/${image.filename}`, bytes: Array.from(bytes) });
        if (image.kind === "remote") {
          const escaped = image.source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          markdown = markdown.replace(
            new RegExp(`!\\[([^\\]]*)\\]\\(${escaped}\\)`, "g"),
            `![$1](images/${image.filename})`,
          );
        }
      }

      const result = await exportMarkdownZip(path, `${currentDate}.md`, markdown, payloads);
      const warnings: string[] = [];
      if (remoteFailures) warnings.push(`${remoteFailures} 张网络图片未能下载`);
      if (localSkipped) warnings.push(`${localSkipped} 张本地图片未打包（仅限应用内可见）`);
      onToast(warnings.length
        ? `已导出到 ${result.path}，${warnings.join("，")}`
        : `已导出 Markdown 压缩包：${result.path}`);
    } catch (error) {
      onToast(`导出失败：${String(error)}`);
    } finally {
      setExporting(false);
      onClose();
    }
  }

  async function exportPDF() {
    setExporting(true);
    try {
      const path = await save({
        title: "导出 PDF",
        defaultPath: `DayNotes-${currentDate}.pdf`,
        filters: [{ name: "PDF 文档", extensions: ["pdf"] }],
      });
      if (!path) return;
      const document = parseExportDocument(currentDate, content, todos);
      const images = (await Promise.all(document.images.map((image) => buildPdfImage(image).catch(() => null))))
        .filter((image): image is PdfImagePayload => image !== null);
      const result = await exportPdf(path, document, images);
      onToast(`已导出 ${result.pages} 页 PDF（${result.orientation === "landscape" ? "横向" : "纵向"}）：${result.path}`);
    } catch (error) {
      onToast(`PDF 导出失败：${String(error)}`);
    } finally {
      setExporting(false);
      onClose();
    }
  }

  async function copyAsHtml() {
    try {
      // Build clean HTML for clipboard
      let html = `<h1>${formatDateDisplay(currentDate)}</h1>`;
      html += content;
      html += `<h2>待办清单</h2><ul>`;
      todos.forEach((t) => {
        html += `<li>${t.done ? "☑" : "☐"} ${t.text}${t.time ? ` @ ${t.time}` : ""}</li>`;
      });
      html += `</ul>`;

      // Create both HTML and plain text clipboard data
      const plainText = stripHtml(html);
      const blobHtml = new Blob([html], { type: "text/html" });
      const blobText = new Blob([plainText], { type: "text/plain" });

      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": blobHtml,
          "text/plain": blobText,
        }),
      ]);
      onToast("已复制到剪贴板，可直接粘贴到邮件/文档");
    } catch {
      // Fallback: just copy plain text
      const plainText = stripHtml(content);
      await navigator.clipboard.writeText(plainText);
      onToast("已复制纯文本到剪贴板");
    }
    onClose();
  }

  async function exportImage() {
    setExporting(true);
    try {
      if (!previewRef.current) throw new Error("预览元素未就绪");
      await document.fonts.ready;
      const blob = await toBlob(previewRef.current, {
        pixelRatio: 2,
        backgroundColor: "#ffffff",
        cacheBust: true,
      });
      if (!blob) throw new Error("无法生成图片数据");
      downloadBlob(blob, `DayNotes-${currentDate}.png`);
      onToast("已按分享预览导出长图");
    } catch (error) {
      onToast(`图片导出失败：${String(error)}`);
    } finally {
      setExporting(false);
      onClose();
    }
  }

  function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div style={{ position: "fixed", left: -100000, top: 0, width: 800, pointerEvents: "none" }}>
        <ExportPreview document={previewDocument} previewRef={previewRef} />
      </div>
      <div className="modal-backdrop" />
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>×</button>
        <h2>分享 — {formatDateDisplay(currentDate)}</h2>

        <button className="share-option" onClick={exportMarkdown} disabled={exporting}>
          <div className="share-option-icon">📄</div>
          <div className="share-option-text">
            <strong>导出为 Markdown</strong>
            <span>保存为 .md 文件，可导入 Notion / Obsidian / 语雀</span>
          </div>
        </button>

        <button className="share-option" onClick={copyAsHtml} disabled={exporting}>
          <div className="share-option-icon">📋</div>
          <div className="share-option-text">
            <strong>复制为富文本</strong>
            <span>直接粘贴到邮件 / 飞书 / 钉钉</span>
          </div>
        </button>

        <button className="share-option" onClick={exportPDF} disabled={exporting}>
          <div className="share-option-icon">🖨</div>
          <div className="share-option-text">
            <strong>导出为 PDF</strong>
            <span>在新窗口预览，Ctrl+P 保存</span>
          </div>
        </button>

        <button className="share-option" onClick={exportImage} disabled={exporting}>
          <div className="share-option-icon">🖼</div>
          <div className="share-option-text">
            <strong>导出为图片</strong>
            <span>生成精美卡片，适合分享到微信/QQ</span>
          </div>
        </button>

        {exporting && <div style={{ textAlign: "center", color: "var(--text-muted)", marginTop: 12 }}>导出中…</div>}
      </div>
    </div>
  );
}
