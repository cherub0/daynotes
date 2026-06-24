import { useState } from "react";
import { formatDateDisplay } from "../lib/types";
import type { TodoItem } from "../lib/types";

interface ShareModalProps {
  currentDate: string;
  content: string;
  todos: TodoItem[];
  onClose: () => void;
  onToast: (msg: string) => void;
}

export function ShareModal({ currentDate, content, todos, onClose, onToast }: ShareModalProps) {
  const [exporting, setExporting] = useState(false);

  function stripHtml(html: string): string {
    const div = document.createElement("div");
    div.innerHTML = html;
    return div.textContent || "";
  }

  function htmlToMarkdown(html: string): string {
    let md = html;
    // Basic conversions
    md = md.replace(/<h1>(.*?)<\/h1>/gi, "# $1\n\n");
    md = md.replace(/<h2>(.*?)<\/h2>/gi, "## $1\n\n");
    md = md.replace(/<h3>(.*?)<\/h3>/gi, "### $1\n\n");
    md = md.replace(/<h4>(.*?)<\/h4>/gi, "#### $1\n\n");
    md = md.replace(/<strong>(.*?)<\/strong>/gi, "**$1**");
    md = md.replace(/<b>(.*?)<\/b>/gi, "**$1**");
    md = md.replace(/<em>(.*?)<\/em>/gi, "*$1*");
    md = md.replace(/<i>(.*?)<\/i>/gi, "*$1*");
    md = md.replace(/<u>(.*?)<\/u>/gi, "<u>$1</u>");
    md = md.replace(/<s>(.*?)<\/s>/gi, "~~$1~~");
    md = md.replace(/<code>(.*?)<\/code>/gi, "`$1`");
    md = md.replace(/<pre><code[^>]*>(.*?)<\/code><\/pre>/gs, "```\n$1\n```\n");
    md = md.replace(/<a href="(.*?)">(.*?)<\/a>/gi, "[$2]($1)");
    md = md.replace(/<blockquote>(.*?)<\/blockquote>/gs, "> $1\n");
    md = md.replace(/<li[^>]*>(.*?)<\/li>/gi, "- $1\n");
    md = md.replace(/<ul[^>]*>/g, "\n");
    md = md.replace(/<\/ul>/g, "\n");
    md = md.replace(/<ol[^>]*>/g, "\n");
    md = md.replace(/<\/ol>/g, "\n");
    md = md.replace(/<hr\s*\/?>/gi, "---\n");
    md = md.replace(/<br\s*\/?>/gi, "\n");
    md = md.replace(/<p>(.*?)<\/p>/gi, "$1\n\n");
    md = md.replace(/<[^>]+>/g, "");
    md = md.replace(/\n{3,}/g, "\n\n");
    return md.trim();
  }

  async function exportMarkdown() {
    setExporting(true);
    try {
      let md = `# ${formatDateDisplay(currentDate)}\n\n`;
      md += htmlToMarkdown(content);
      md += "\n\n## 待办清单\n\n";
      todos.forEach((t) => {
        md += `- [${t.done ? "x" : " "}] ${t.text}${t.time ? ` @ ${t.time}` : ""}\n`;
      });

      const blob = new Blob([md], { type: "text/markdown" });
      downloadBlob(blob, `daynotes-${currentDate}.md`);
      onToast("已导出 Markdown 文件");
    } catch {
      onToast("导出失败");
    }
    setExporting(false);
    onClose();
  }

  async function exportPDF() {
    setExporting(true);
    try {
      // Create a clean HTML for printing
      let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>DayNotes - ${formatDateDisplay(currentDate)}</title>
<style>
  body { font-family: "Microsoft YaHei", sans-serif; padding: 20px; line-height: 1.8; color: #333; }
  h1 { font-size: 20px; border-bottom: 2px solid #4263eb; padding-bottom: 8px; }
  h2 { font-size: 16px; }
  pre { background: #f5f5f5; padding: 10px; border-radius: 4px; overflow-x: auto; }
  code { background: #f5f5f5; padding: 2px 4px; border-radius: 2px; }
  blockquote { border-left: 3px solid #4263eb; padding-left: 10px; margin-left: 0; color: #666; }
  .todo-done { text-decoration: line-through; color: #999; }
</style></head><body>
  <h1>${formatDateDisplay(currentDate)}</h1>
  ${content}
  <h2>待办清单</h2>
  <ul>${todos.map((t) => `<li class="${t.done ? "todo-done" : ""}">${t.done ? "☑" : "☐"} ${t.text}${t.time ? ` @ ${t.time}` : ""}</li>`).join("")}</ul>
</body></html>`;

      const blob = new Blob([html], { type: "text/html" });
      // Open in new window for print
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      onToast("已在新窗口打开，可使用 Ctrl+P 保存为 PDF");
    } catch {
      onToast("导出失败");
    }
    setExporting(false);
    onClose();
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
      // Use canvas to render card
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d")!;
      canvas.width = 800;
      canvas.height = 600;

      // Background
      const bgGrad = ctx.createLinearGradient(0, 0, 0, 600);
      bgGrad.addColorStop(0, "#4263eb");
      bgGrad.addColorStop(1, "#7048e8");
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, 800, 600);

      // Card
      const cardGrad = ctx.createLinearGradient(0, 80, 0, 560);
      cardGrad.addColorStop(0, "#ffffff");
      cardGrad.addColorStop(1, "#f8f9fa");
      ctx.fillStyle = cardGrad;
      roundRect(ctx, 40, 100, 720, 460, 16);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.3)";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Title
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 28px Microsoft YaHei, sans-serif";
      ctx.fillText("📝 DayNotes", 60, 65);

      ctx.fillStyle = "rgba(255,255,255,0.8)";
      ctx.font = "16px Microsoft YaHei, sans-serif";
      ctx.fillText(formatDateDisplay(currentDate), 60, 90);

      // Content summary
      const plain = stripHtml(content);
      ctx.fillStyle = "#333333";
      ctx.font = "15px Microsoft YaHei, sans-serif";
      const lines = wrapText(ctx, plain.length > 600 ? plain.slice(0, 600) + "…" : plain, 680);
      lines.forEach((line, i) => {
        ctx.fillText(line, 60, 145 + i * 26);
      });

      // Todo count
      const doneCount = todos.filter((t) => t.done).length;
      ctx.fillStyle = "#4263eb";
      ctx.font = "bold 14px Microsoft YaHei, sans-serif";
      ctx.fillText(`📋 待办: ${doneCount}/${todos.length} 已完成`, 60, 530);

      // Watermark
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.font = "12px Microsoft YaHei, sans-serif";
      ctx.fillText("由 DayNotes 生成", 680, 570);

      canvas.toBlob((blob) => {
        if (blob) {
          downloadBlob(blob, `daynotes-${currentDate}.png`);
          onToast("已导出图片");
        }
      });
    } catch {
      onToast("导出失败");
    }
    setExporting(false);
    onClose();
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

// Helper: rounded rectangle
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// Helper: wrap text
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let current = "";
  for (const ch of text) {
    const test = current + ch;
    if (ctx.measureText(test).width > maxWidth && current.length > 0) {
      lines.push(current);
      current = ch;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}
