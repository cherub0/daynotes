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

  type ExportImage = { src: string; alt: string };

  function getDataImageExtension(dataUrl: string): string {
    const mime = dataUrl.match(/^data:([^;,]+)[;,]/)?.[1]?.toLowerCase();
    switch (mime) {
      case "image/jpeg":
      case "image/jpg":
        return "jpg";
      case "image/gif":
        return "gif";
      case "image/webp":
        return "webp";
      case "image/svg+xml":
        return "svg";
      case "image/png":
      default:
        return "png";
    }
  }

  function stripHtml(html: string): string {
    const div = document.createElement("div");
    div.innerHTML = html;
    return div.textContent || "";
  }

  function htmlToMarkdown(html: string): { md: string; images: ExportImage[] } {
    const images: ExportImage[] = [];
    const doc = new DOMParser().parseFromString(html, "text/html");

    function compactText(text: string): string {
      return text.replace(/\s+/g, " ").trim();
    }

    function escapeTableCell(text: string): string {
      return compactText(text)
        .replace(/\\/g, "\\\\")
        .replace(/\|/g, "\\|");
    }

    function renderTable(table: Element): string {
      const rows = Array.from(table.querySelectorAll("tr"))
        .map((row) =>
          Array.from(row.querySelectorAll("th,td"))
            .map((cell) => escapeTableCell(cell.textContent || ""))
        )
        .filter((cells) => cells.length > 0);

      if (rows.length === 0) return "";

      const columnCount = Math.max(...rows.map((cells) => cells.length));
      const normalizedRows = rows.map((cells) => [
        ...cells,
        ...Array(Math.max(0, columnCount - cells.length)).fill(""),
      ]);

      let tableMd = "\n";
      normalizedRows.forEach((cells, index) => {
        tableMd += `| ${cells.join(" | ")} |\n`;
        if (index === 0) {
          tableMd += `| ${cells.map(() => "---").join(" | ")} |\n`;
        }
      });
      return `${tableMd}\n`;
    }

    function walk(node: Node): string {
      if (node.nodeType === Node.TEXT_NODE) return node.textContent || "";
      if (node.nodeType !== Node.ELEMENT_NODE) return "";

      const el = node as Element;
      const tag = el.tagName.toLowerCase();
      const children = tag === "table" ? "" : Array.from(el.childNodes).map(walk).join("");

      switch (tag) {
        case "h1": return `# ${children}\n\n`;
        case "h2": return `## ${children}\n\n`;
        case "h3": return `### ${children}\n\n`;
        case "h4": return `#### ${children}\n\n`;
        case "p": {
          // Skip empty paragraphs inside list items
          if (!children.trim()) return "\n";
          return `${children}\n\n`;
        }
        case "strong": case "b": return `**${children}**`;
        case "em": case "i": return `*${children}*`;
        case "s": case "del": case "strike": return `<del>${children}</del>`;
        case "mark": return `<mark>${children}</mark>`;
        case "u": case "ins": return `<u>${children}</u>`;
        case "code": {
          // Only treat as inline if parent is not <pre>
          if ((node.parentElement?.tagName || "").toLowerCase() === "pre") return children;
          return `\`${children}\``;
        }
        case "pre": {
          const codeEl = el.querySelector("code");
          const lang = codeEl?.className.match(/language-(\w+)/)?.[1] || "";
          // Entity-decode the code content
          const txt = document.createElement("textarea");
          txt.innerHTML = codeEl?.innerHTML || el.innerHTML;
          const decoded = txt.value;
          return `\`\`\`${lang}\n${decoded}\n\`\`\`\n`;
        }
        case "a": {
          const href = el.getAttribute("href") || "";
          return `[${children}](${href})`;
        }
        case "img": {
          const src = el.getAttribute("src") || "";
          const alt = el.getAttribute("alt") || "";
          if (src.startsWith("data:")) {
            images.push({ src, alt });
            return `%%IMG_${images.length - 1}%%`;
          }
          return alt ? `![${alt}](${src})` : `![](${src})`;
        }
        case "blockquote": return `> ${children.replace(/\n/g, "\n> ")}\n`;
        case "li": {
          const parent = el.parentElement?.tagName.toLowerCase();
          const checked = el.getAttribute("data-checked");
          if (checked === "true" || checked === "false") {
            const taskBody = el.querySelector(":scope > div");
            const taskText = compactText(
              taskBody
                ? Array.from(taskBody.childNodes).map(walk).join("")
                : children
            );
            return `- [${checked === "true" ? "x" : " "}] ${taskText}\n`;
          }
          if (parent === "ol") return `%%OL_ITEM%%${children}`;
          return `- ${children}\n`;
        }
        case "ol": {
          const items = Array.from(el.querySelectorAll(":scope > li"));
          return "\n" + items.map((li, i) => `${i + 1}. ${walk(li).replace("%%OL_ITEM%%", "")}\n`).join("") + "\n";
        }
        case "ul": return `\n${children}\n`;
        case "br": return "\n";
        case "hr": return "\n---\n";
        case "table": return renderTable(el);
        case "thead": case "tbody": return children;
        case "tr": return children + "\n";
        case "th": case "td": return compactText(children);
        case "div": case "span": case "section": return children;
        default: return children;
      }
    }

    let md = walk(doc.body);

    // Clean up whitespace
    md = md.replace(/\n{3,}/g, "\n\n").trim();

    return { md, images };
  }

  async function exportMarkdown() {
    setExporting(true);
    try {
      const { md: bodyMd, images } = htmlToMarkdown(content);
      let md = `# ${formatDateDisplay(currentDate)}\n\n${bodyMd}`;
      md += "\n\n## 待办清单\n\n";
      todos.forEach((t) => {
        md += `- [${t.done ? "x" : " "}] ${t.text}${t.time ? ` @ ${t.time}` : ""}\n`;
      });

      // If there are embedded images, save them alongside the .md via filesystem
      if (images.length > 0) {
        try {
          const { invoke } = await import("@tauri-apps/api/core");
          const imageFiles = images.map((image, index) =>
            `image_${index + 1}.${getDataImageExtension(image.src)}`
          );
          const dir = await invoke("plugin:dialog|open", {
            title: "选择导出目录",
            directory: true,
            multiple: false,
          });
          if (dir && typeof dir === "string") {
            // Decode and write each image using its original data URL MIME type.
            for (let i = 0; i < images.length; i++) {
              const base64 = images[i].src.split(",")[1];
              const binaryStr = atob(base64);
              const bytes = new Uint8Array(binaryStr.length);
              for (let j = 0; j < binaryStr.length; j++) {
                bytes[j] = binaryStr.charCodeAt(j);
              }
              await invoke("write_binary_file", {
                path: `${dir}\\${imageFiles[i]}`,
                contents: Array.from(bytes),
              });
            }
            // Replace placeholders with filenames
            for (let i = 0; i < images.length; i++) {
              const alt = images[i].alt || `image_${i + 1}`;
              md = md.replace(`%%IMG_${i}%%`, `![${alt}](${imageFiles[i]})`);
            }
            // Write markdown file
            await invoke("write_text_file", {
              path: `${dir}\\daynotes-${currentDate}.md`,
              contents: md,
            });
            onToast(`已导出到 ${dir}`);
            setExporting(false);
            onClose();
            return;
          }
        } catch (e) {
          console.error("FS export failed, falling back:", e);
        }
      }

      // Fallback: browser download (no images, or FS export failed)
      for (let i = 0; i < images.length; i++) {
        md = md.replace(`%%IMG_${i}%%`, `[图片 ${i + 1} — 请选择目录导出以保存图片]`);
      }
      const blob = new Blob([md], { type: "text/markdown" });
      downloadBlob(blob, `daynotes-${currentDate}.md`);
      onToast("已导出 Markdown 到下载文件夹");
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
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>DayNotes - ${formatDateDisplay(currentDate)}</title>
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

  // Parse markdown into styled lines for canvas rendering
  type MdLine = { text: string; font: string; fill: string; x: number; bg?: string; prefix?: string; strike?: boolean; underline?: boolean };

  function parseMarkdownLines(md: string): MdLine[] {
    const lines: MdLine[] = [];
    const rawLines = md.split("\n");
    let inCodeBlock = false;

    for (const raw of rawLines) {
      // Code block fence
      if (raw.startsWith("```")) { inCodeBlock = !inCodeBlock; continue; }

      if (inCodeBlock) {
        lines.push({ text: raw, font: "13px 'Cascadia Code', Consolas, monospace", fill: "#d4d4d4", x: 60, bg: "#1e1e1e" });
        continue;
      }

      // Image placeholder
      if (raw.startsWith("%%IMG_")) {
        const n = raw.match(/%%IMG_(\d+)%%/)?.[1] || "?";
        lines.push({ text: `[图片 ${n}]`, font: "13px 'Microsoft YaHei', sans-serif", fill: "#999999", x: 60, bg: "#f0f0f0" });
        continue;
      }

      // Blank line
      if (!raw.trim()) { lines.push({ text: "", font: "", fill: "", x: 60 }); continue; }

      let x = 60; let font = "14px 'Microsoft YaHei', sans-serif"; let fill = "#333333"; let bg: string | undefined; let prefix: string | undefined;
      let text = raw;

      // Headings
      const hMatch = text.match(/^(#{1,4})\s+(.*)/);
      if (hMatch) {
        const sizes: Record<number, number> = { 1: 22, 2: 18, 3: 16, 4: 15 };
        const headingFill = "#1a1a1a";
        const headingText = hMatch[2];
        // Render inline formatting within heading text
        const hSegments = parseInlineMarkdown(headingText);
        for (const seg of hSegments) {
          const weight = seg.bold ? "bold " : "";
          const style = seg.italic ? "italic " : "";
          const family = seg.code ? "'Cascadia Code', Consolas, monospace" : "'Microsoft YaHei', sans-serif";
          const sz = sizes[hMatch[1].length] || 15;
          const sf = `${weight}${style}${sz}px ${family}`;
          let sfFill = headingFill;
          if (seg.highlight) { bg = "#fff3cd"; sfFill = "#333333"; }
          lines.push({ text: seg.text, font: sf, fill: sfFill, x, bg,
            strike: seg.strikethrough, underline: seg.underline });
          bg = undefined;
        }
        continue;
      }

      // Blockquote
      const bqMatch = text.match(/^>\s?(.*)/);
      if (bqMatch) {
        x = 72; fill = "#666666";
        prefix = "│ ";
        text = bqMatch[1];
      }

      // Horizontal rule
      if (text.match(/^---+\s*$/)) { lines.push({ text: "─".repeat(60), font: "11px 'Microsoft YaHei', sans-serif", fill: "#ddd", x: 60 }); continue; }

      // List items
      const liMatch = text.match(/^(\s*)([-*]|\d+\.)\s+(.*)/);
      if (liMatch) {
        prefix = liMatch[2] + " ";
        text = liMatch[3];
      }

      // Table rows (simplified)
      if (text.startsWith("|")) {
        font = "13px 'Microsoft YaHei', sans-serif";
        fill = "#444444";
      }

      // Render inline formatting within the line
      const segments = parseInlineMarkdown(text);
      for (const seg of segments) {
        const weight = seg.bold ? "bold " : "";
        const style = seg.italic ? "italic " : "";
        const family = seg.code ? "'Cascadia Code', Consolas, monospace" : "'Microsoft YaHei', sans-serif";
        let sz = seg.code ? 13 : 14;
        // Use heading size if the line had a heading font
        if (font.includes("22px")) sz = 22;
        else if (font.includes("18px")) sz = 18;
        else if (font.includes("16px")) sz = 16;
        const sf = `${weight}${style}${sz}px ${family}`;
        let sfFill = fill;
        if (seg.highlight) { bg = "#fff3cd"; sfFill = "#333333"; }
        lines.push({
          text: seg.text,
          font: sf,
          fill: sfFill,
          x,
          bg,
          strike: seg.strikethrough,
          underline: seg.underline,
          prefix: prefix ? prefix : undefined,
        });
        bg = undefined; prefix = undefined;
      }
    }
    return lines;
  }

  function parseInlineMarkdown(text: string): { text: string; bold: boolean; italic: boolean; code: boolean; highlight: boolean; strikethrough: boolean; underline: boolean }[] {
    const segs: { text: string; bold: boolean; italic: boolean; code: boolean; highlight: boolean; strikethrough: boolean; underline: boolean }[] = [];
    const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(~~[^~]+~~)|(==[^=]+==)|(<u>[^<]+<\/u>)|(<del>[^<]+<\/del>)|(<mark>[^<]+<\/mark>)/g;
    const noStyle = { bold: false, italic: false, code: false, highlight: false, strikethrough: false, underline: false };
    let last = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) segs.push({ text: text.slice(last, m.index), ...noStyle });
      const raw = m[0];
      if (raw.startsWith("`")) segs.push({ text: raw.slice(1, -1), ...noStyle, code: true });
      else if (raw.startsWith("**")) segs.push({ text: raw.slice(2, -2), ...noStyle, bold: true });
      else if (raw.startsWith("*")) segs.push({ text: raw.slice(1, -1), ...noStyle, italic: true });
      else if (raw.startsWith("~~")) segs.push({ text: raw.slice(2, -2), ...noStyle, strikethrough: true });
      else if (raw.startsWith("==")) segs.push({ text: raw.slice(2, -2), ...noStyle, highlight: true });
      else if (raw.startsWith("<u>")) segs.push({ text: raw.slice(3, -4), ...noStyle, underline: true });
      else if (raw.startsWith("<del>")) segs.push({ text: raw.slice(5, -6), ...noStyle, strikethrough: true });
      else if (raw.startsWith("<mark>")) segs.push({ text: raw.slice(6, -7), ...noStyle, highlight: true });
      last = m.index + m[0].length;
    }
    if (last < text.length) segs.push({ text: text.slice(last), ...noStyle });
    return segs.length ? segs : [{ text, ...noStyle }];
  }

  async function exportImage() {
    setExporting(true);
    try {
      const { md: bodyMd } = htmlToMarkdown(content || "");
      const todoText =
        todos.length > 0
          ? "\n\n## 📋 待办清单\n\n" +
            todos.map((t) => `- [${t.done ? "x" : " "}] ${t.text}${t.time ? ` @ ${t.time}` : ""}`).join("\n")
          : "";
      const mdFull = bodyMd + todoText;
      const lines = parseMarkdownLines(mdFull);

      // Measure total height
      const canvas = document.createElement("canvas");
      canvas.width = 800;
      const ctx = canvas.getContext("2d")!;
      let y = 140;
      const maxW = 680;
      const baseLH = 22;

      for (const line of lines) {
        if (!line.text) { y += baseLH / 2; continue; }
        ctx.font = line.font;
        if (line.bg) y += 4; // padding for bg
        const wrapped = wrapLines(ctx, line.text, maxW - (line.x - 60));
        y += wrapped.length * (line.bg ? baseLH + 4 : baseLH);
        if (line.bg) y += 4;
      }

      const cardH = Math.max(140, y - 140 + 60);
      const totalH = cardH + 180;
      canvas.height = totalH;

      // Draw background
      const bgGrad = ctx.createLinearGradient(0, 0, 0, totalH);
      bgGrad.addColorStop(0, "#4263eb");
      bgGrad.addColorStop(1, "#7048e8");
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, 800, totalH);

      // Draw card
      const cardGrad = ctx.createLinearGradient(0, 106, 0, 106 + cardH);
      cardGrad.addColorStop(0, "#ffffff");
      cardGrad.addColorStop(1, "#f8f9fa");
      ctx.fillStyle = cardGrad;
      ctx.beginPath();
      const r = 16;
      ctx.moveTo(56, 106); ctx.lineTo(744, 106);
      ctx.quadraticCurveTo(760, 106, 760, 106 + r);
      ctx.lineTo(760, 106 + cardH - r);
      ctx.quadraticCurveTo(760, 106 + cardH, 744, 106 + cardH);
      ctx.lineTo(56, 106 + cardH);
      ctx.quadraticCurveTo(40, 106 + cardH, 40, 106 + cardH - r);
      ctx.lineTo(40, 106 + r);
      ctx.quadraticCurveTo(40, 106, 56, 106);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.3)";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Title
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 28px 'Microsoft YaHei', sans-serif";
      ctx.fillText("📝 DayNotes", 60, 65);
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      ctx.font = "16px 'Microsoft YaHei', sans-serif";
      ctx.fillText(formatDateDisplay(currentDate), 60, 90);

      // Render content lines
      y = 140;
      ctx.textBaseline = "top";
      for (const line of lines) {
        if (y > 106 + cardH - baseLH) break;
        if (!line.text) { y += baseLH / 2; continue; }
        ctx.font = line.font;

        const wrapW = maxW - (line.x - 60);
        const wrapped = wrapLines(ctx, line.text, wrapW);
        const lh = line.bg ? baseLH + 4 : baseLH;

        for (const w of wrapped) {
          if (y > 106 + cardH - lh) break;
          // Background highlight
          if (line.bg) {
            const m = ctx.measureText(w);
            ctx.fillStyle = line.bg;
            ctx.fillRect(line.x - 2, y, m.width + 4, lh);
          }
          // Prefix (blockquote bar, list marker)
          if (line.prefix) {
            ctx.fillStyle = "#ccc";
            ctx.fillText(line.prefix, line.x - 16, y);
          }
          ctx.fillStyle = line.fill;
          ctx.fillText(w, line.x, y);
          const tw = ctx.measureText(w).width;
          if (line.strike) {
            ctx.strokeStyle = line.fill;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(line.x, y + lh / 2);
            ctx.lineTo(line.x + tw, y + lh / 2);
            ctx.stroke();
          }
          if (line.underline) {
            ctx.strokeStyle = line.fill;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(line.x, y + lh - 2);
            ctx.lineTo(line.x + tw, y + lh - 2);
            ctx.stroke();
          }
          y += lh;
        }
      }

      // Watermark
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.font = "12px 'Microsoft YaHei', sans-serif";
      ctx.fillText("由 DayNotes 生成", 650, totalH - 20);

      canvas.toBlob((blob) => {
        if (blob) {
          downloadBlob(blob, `daynotes-${currentDate}.png`);
          onToast("已导出图片到下载文件夹");
        } else {
          onToast("导出失败");
        }
        setExporting(false);
        onClose();
      }, "image/png");
      return; // wait for async toBlob callback
    } catch {
      onToast("导出失败");
      setExporting(false);
      onClose();
    }
  }

  function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
    const lines: string[] = [];
    let cur = "";
    for (const ch of text) {
      if (ctx.measureText(cur + ch).width > maxW && cur.length > 0) {
        lines.push(cur);
        cur = ch;
      } else {
        cur += ch;
      }
    }
    if (cur) lines.push(cur);
    return lines.length ? lines : [""];
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
