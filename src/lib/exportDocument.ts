import type { TodoItem } from "./types";

export interface ExportInline {
  text: string;
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  underline?: boolean;
  code?: boolean;
  highlight?: boolean;
  href?: string;
}

export interface ExportImage {
  id: string;
  source: string;
  alt: string;
  kind: "data" | "remote" | "local";
  mimeType?: string;
  filename: string;
}

export type ExportBlock =
  | { kind: "heading"; level: number; content: ExportInline[] }
  | { kind: "paragraph"; content: ExportInline[] }
  | { kind: "list"; ordered: boolean; items: ExportInline[][] }
  | { kind: "quote"; content: ExportInline[] }
  | { kind: "code"; language: string; text: string }
  | { kind: "table"; rows: string[][]; header: boolean }
  | { kind: "rule" }
  | { kind: "image"; imageId: string; alt: string }
  | { kind: "todos"; items: TodoItem[] };

export interface ExportDocument {
  date: string;
  title: string;
  blocks: ExportBlock[];
  images: ExportImage[];
}

export interface MarkdownExport {
  markdown: string;
  images: ExportImage[];
}

const DATA_URL = /^data:([^;,]+)(?:;[^,]*)?,/i;

function imageExtension(source: string, mimeType?: string): string {
  const byMime: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/svg+xml": "svg",
  };
  if (mimeType && byMime[mimeType.toLowerCase()]) return byMime[mimeType.toLowerCase()];
  const cleanPath = source.split(/[?#]/, 1)[0];
  const match = cleanPath.match(/\.([a-z0-9]{2,5})$/i);
  return match?.[1]?.toLowerCase() === "jpeg" ? "jpg" : match?.[1]?.toLowerCase() || "png";
}

function parseInline(root: Element): ExportInline[] {
  const output: ExportInline[] = [];

  function visit(node: Node, marks: Omit<ExportInline, "text">) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || "";
      if (text) output.push({ text, ...marks });
      return;
    }
    if (!(node instanceof Element)) return;
    if (node.tagName === "BR") {
      output.push({ text: "\n", ...marks });
      return;
    }
    const tag = node.tagName.toLowerCase();
    const next = { ...marks };
    if (tag === "strong" || tag === "b") next.bold = true;
    if (tag === "em" || tag === "i") next.italic = true;
    if (tag === "s" || tag === "del" || tag === "strike") next.strike = true;
    if (tag === "u") next.underline = true;
    if (tag === "code") next.code = true;
    if (tag === "mark") next.highlight = true;
    if (tag === "a") next.href = node.getAttribute("href") || undefined;
    node.childNodes.forEach((child) => visit(child, next));
  }

  root.childNodes.forEach((child) => visit(child, {}));
  return output;
}

function textOf(element: Element): string {
  return (element.textContent || "").replace(/\s+/g, " ").trim();
}

export function parseExportDocument(date: string, html: string, todos: TodoItem[]): ExportDocument {
  const template = document.createElement("template");
  template.innerHTML = html;
  const blocks: ExportBlock[] = [];
  const images: ExportImage[] = [];
  const imageIds = new Map<string, string>();

  function registerImage(element: HTMLImageElement) {
    const source = element.getAttribute("src") || "";
    if (!source) return;
    let id = imageIds.get(source);
    if (!id) {
      id = `image-${images.length + 1}`;
      imageIds.set(source, id);
      const dataMatch = source.match(DATA_URL);
      const mimeType = dataMatch?.[1];
      const kind = source.startsWith("data:")
        ? "data"
        : /^https?:\/\//i.test(source)
          ? "remote"
          : "local";
      images.push({
        id,
        source,
        alt: element.getAttribute("alt") || "",
        kind,
        mimeType,
        filename: `${id}.${imageExtension(source, mimeType)}`,
      });
    }
    blocks.push({ kind: "image", imageId: id, alt: element.getAttribute("alt") || "" });
  }

  for (const node of Array.from(template.content.children)) {
    const tag = node.tagName.toLowerCase();
    if (/^h[1-6]$/.test(tag)) {
      blocks.push({ kind: "heading", level: Number(tag[1]), content: parseInline(node) });
    } else if (tag === "p") {
      const imgs = node.querySelectorAll("img");
      if (imgs.length === 0) {
        blocks.push({ kind: "paragraph", content: parseInline(node) });
      } else {
        // Split paragraph at image boundaries, preserving text on both sides
        for (const child of Array.from(node.childNodes)) {
          if (child instanceof HTMLImageElement) {
            registerImage(child);
          } else {
            const wrapper = document.createElement("span");
            if (child.nodeType === Node.TEXT_NODE) {
              wrapper.textContent = child.textContent;
            } else if (child instanceof Element) {
              wrapper.append(child.cloneNode(true));
            }
            const text = textOf(wrapper);
            if (text) {
              blocks.push({ kind: "paragraph", content: parseInline(wrapper) });
            }
          }
        }
      }
    } else if (tag === "blockquote") {
      blocks.push({ kind: "quote", content: parseInline(node) });
    } else if (tag === "pre") {
      const code = node.querySelector("code");
      const language = Array.from(code?.classList || [])
        .find((name) => name.startsWith("language-"))
        ?.slice("language-".length) || "";
      blocks.push({ kind: "code", language, text: code?.textContent || node.textContent || "" });
    } else if (tag === "table") {
      const rows = Array.from(node.querySelectorAll(":scope > thead > tr, :scope > tbody > tr, :scope > tfoot > tr, :scope > tr")).map((row) =>
        Array.from(row.querySelectorAll(":scope > th, :scope > td")).map(textOf),
      );
      blocks.push({ kind: "table", rows, header: Boolean(node.querySelector("th")) });
    } else if (tag === "ul" || tag === "ol") {
      const items = Array.from(node.querySelectorAll(":scope > li")).map((item) => parseInline(item));
      blocks.push({ kind: "list", ordered: tag === "ol", items });
    } else if (tag === "hr") {
      blocks.push({ kind: "rule" });
    } else if (tag === "img") {
      registerImage(node as HTMLImageElement);
    } else {
      node.querySelectorAll("img").forEach(registerImage);
      if (!node.querySelector("img") && textOf(node)) {
        blocks.push({ kind: "paragraph", content: parseInline(node) });
      }
    }
  }

  if (todos.length) blocks.push({ kind: "todos", items: todos.map((item) => ({ ...item })) });
  return { date, title: date, blocks, images };
}

function escapeMarkdown(text: string): string {
  return text.replace(/([\\`*_[\]<>])/g, "\\$1");
}

function renderInline(content: ExportInline[]): string {
  return content.map((run) => {
    let value = escapeMarkdown(run.text);
    if (run.code) value = `\`${run.text.replace(/`/g, "\\`")}\``;
    if (run.bold) value = `**${value}**`;
    if (run.italic) value = `*${value}*`;
    if (run.strike) value = `~~${value}~~`;
    if (run.href) value = `[${value}](${run.href})`;
    return value;
  }).join("");
}

function escapeTableCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
}

export function renderMarkdown(document: ExportDocument): MarkdownExport {
  const resources = new Map(document.images.map((image) => [image.id, image]));
  const segments: string[] = [`# ${document.date}`];

  for (const block of document.blocks) {
    switch (block.kind) {
      case "heading":
        segments.push(`${"#".repeat(block.level)} ${renderInline(block.content)}`);
        break;
      case "paragraph":
        segments.push(renderInline(block.content));
        break;
      case "quote":
        segments.push(`> ${renderInline(block.content)}`);
        break;
      case "code":
        segments.push(`\`\`\`${block.language}\n${block.text}\n\`\`\``);
        break;
      case "rule":
        segments.push("---");
        break;
      case "list":
        segments.push(
          block.items.map((item, index) =>
            `${block.ordered ? `${index + 1}.` : "-"} ${renderInline(item)}`
          ).join("\n"),
        );
        break;
      case "table": {
        if (!block.rows.length) break;
        const width = Math.max(...block.rows.map((row) => row.length));
        const normalized = block.rows.map((row) =>
          Array.from({ length: width }, (_, i) => escapeTableCell(row[i] || "")),
        );
        const tableLines = [
          `| ${normalized[0].join(" | ")} |`,
          `| ${Array.from({ length: width }, () => "---").join(" | ")} |`,
          ...normalized.slice(1).map((row) => `| ${row.join(" | ")} |`),
        ];
        segments.push(tableLines.join("\n"));
        break;
      }
      case "image": {
        const image = resources.get(block.imageId);
        if (!image) break;
        const target = image.kind === "remote" ? image.source : `images/${image.filename}`;
        segments.push(`![${block.alt || image.alt}](${target})`);
        break;
      }
      case "todos":
        segments.push([
          "## 待办事项",
          ...block.items.map((item) =>
            `- [${item.done ? "x" : " "}] ${escapeMarkdown(item.text)}${item.time ? ` @ ${item.time}` : ""}`,
          ),
        ].join("\n"));
        break;
    }
  }

  return { markdown: `${segments.join("\n\n")}\n`, images: document.images };
}

function renderHtmlInline(content: ExportInline[]): string {
  return content.map((run) => {
    let value = run.text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
    if (run.code) value = `<code>${value}</code>`;
    if (run.bold) value = `<strong>${value}</strong>`;
    if (run.italic) value = `<em>${value}</em>`;
    if (run.strike) value = `<del>${value}</del>`;
    if (run.underline) value = `<u>${value}</u>`;
    if (run.highlight) value = `<mark>${value}</mark>`;
    if (run.href) value = `<a href="${run.href.replace(/"/g, "&quot;")}">${value}</a>`;
    return value;
  }).join("");
}

export function renderPrintHtml(document: ExportDocument): string {
  const images = new Map(document.images.map((image) => [image.id, image]));
  const [y, m, d] = document.date.split("-");
  const dateDisplay = `${y}年${parseInt(m)}月${parseInt(d)}日`;

  const bodyHtml = document.blocks.map((block) => {
    switch (block.kind) {
      case "heading": {
        const content = renderHtmlInline(block.content);
        if (block.level === 1) return `<h1>${content}</h1>`;
        if (block.level === 2) return `<h2>${content}</h2>`;
        if (block.level === 3) return `<h3>${content}</h3>`;
        return `<h4>${content}</h4>`;
      }
      case "paragraph":
        return `<p>${renderHtmlInline(block.content)}</p>`;
      case "quote":
        return `<blockquote><p>${renderHtmlInline(block.content)}</p></blockquote>`;
      case "code":
        return `<pre><code class="language-${block.language}">${block.text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</code></pre>`;
      case "rule":
        return "<hr>";
      case "list":
        return block.ordered
          ? `<ol>${block.items.map((item) => `<li>${renderHtmlInline(item)}</li>`).join("")}</ol>`
          : `<ul>${block.items.map((item) => `<li>${renderHtmlInline(item)}</li>`).join("")}</ul>`;
      case "table": {
        if (!block.rows.length) return "";
        const headerHtml = block.header && block.rows.length > 0
          ? `<thead><tr>${block.rows[0].map((cell) => `<th>${cell.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</th>`).join("")}</tr></thead>`
          : "";
        const bodyRows = block.header ? block.rows.slice(1) : block.rows;
        const bodyHtml = `<tbody>${bodyRows.map((row) =>
          `<tr>${row.map((cell) => `<td>${cell.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</td>`).join("")}</tr>`
        ).join("")}</tbody>`;
        return `<table>${headerHtml}${bodyHtml}</table>`;
      }
      case "image": {
        const image = images.get(block.imageId);
        if (!image) return "";
        const alt = (block.alt || image.alt).replace(/"/g, "&quot;");
        if (image.kind === "local") return `<p class="image-placeholder">📷 本地图片：${alt}</p>`;
        return `<p class="image-wrap"><img src="${image.source.replace(/"/g, "&quot;")}" alt="${alt}" /></p>`;
      }
      case "todos":
        return `<section class="todos"><h2>待办清单</h2><ul>${block.items.map((item) =>
          `<li class="${item.done ? "done" : ""}">${item.done ? "☑" : "☐"} ${item.text.replace(/&/g, "&amp;").replace(/</g, "&lt;")}${item.time ? ` @ ${item.time}` : ""}</li>`
        ).join("")}</ul></section>`;
    }
  }).join("\n");

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>DayNotes — ${dateDisplay}</title>
<style>
  @page { margin: 15mm; size: A4; }
  body {
    font-family: "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", sans-serif;
    font-size: 14px; line-height: 1.9; color: #333; max-width: 720px; margin: 0 auto;
  }
  h1 { font-size: 24px; border-bottom: 2px solid #4263eb; padding-bottom: 8px; margin-top: 24px; color: #1a1a1a; }
  h2 { font-size: 20px; margin-top: 20px; color: #1a1a1a; }
  h3 { font-size: 17px; margin-top: 16px; color: #333; }
  h4 { font-size: 15px; margin-top: 14px; color: #555; }
  p { margin: 0 0 8px; }
  strong { font-weight: 700; }
  em { font-style: italic; }
  code { background: #f0f0f0; padding: 1px 5px; border-radius: 3px; font-family: "Cascadia Code", Consolas, monospace; font-size: 13px; }
  pre { background: #1e1e1e; color: #d4d4d4; padding: 14px 18px; border-radius: 6px; overflow-x: auto; font-size: 13px; line-height: 1.6; }
  pre code { background: none; padding: 0; color: inherit; }
  blockquote { border-left: 4px solid #4263eb; padding: 4px 16px; margin: 12px 0; color: #555; background: #f8f9ff; border-radius: 0 4px 4px 0; }
  blockquote p { margin: 0; }
  ul, ol { padding-left: 24px; margin: 8px 0; }
  li { margin-bottom: 4px; }
  table { border-collapse: collapse; width: 100%; margin: 12px 0; }
  th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; }
  th { background: #f5f5f5; font-weight: 700; }
  tr:nth-child(even) td { background: #fafafa; }
  hr { border: none; border-top: 2px solid #eee; margin: 20px 0; }
  mark { background: #fff3cd; padding: 1px 3px; border-radius: 2px; }
  del { text-decoration: line-through; color: #999; }
  u { text-decoration: underline; }
  a { color: #4263eb; }
  img { max-width: 100%; height: auto; border-radius: 4px; margin: 8px 0; }
  .image-wrap { text-align: center; }
  .image-placeholder { color: #999; font-style: italic; padding: 20px; background: #f9f9f9; border: 2px dashed #ddd; border-radius: 6px; text-align: center; }
  .todos h2 { font-size: 20px; margin-top: 20px; }
  .todos ul { list-style: none; padding-left: 0; }
  .todos li { padding: 4px 0; }
  .todos li.done { text-decoration: line-through; color: #999; }
  .print-header { text-align: right; color: #999; font-size: 12px; margin-bottom: 16px; }
  .print-footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #eee; text-align: right; color: #bbb; font-size: 11px; }
  .brand-header {
    background: linear-gradient(135deg, #4263eb, #7048e8);
    color: #fff; padding: 24px 28px; border-radius: 8px; margin-bottom: 24px;
  }
  .brand-header .brand-name { font-size: 22px; font-weight: 700; }
  .brand-header .brand-date { font-size: 14px; opacity: 0.85; margin-top: 4px; }
  @media print {
    body { font-size: 13px; }
    .brand-header { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .print-footer { position: fixed; bottom: 0; right: 0; padding: 8px 16px; }
  }
</style>
</head>
<body>
<div class="brand-header">
  <div class="brand-name">📝 DayNotes</div>
  <div class="brand-date">${dateDisplay}</div>
</div>
${bodyHtml}
<div class="print-footer">由 DayNotes 生成</div>
</body>
</html>`;
}
