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
  const lines: string[] = [`# ${document.date}`];

  for (const block of document.blocks) {
    switch (block.kind) {
      case "heading": lines.push(`${"#".repeat(block.level)} ${renderInline(block.content)}`); break;
      case "paragraph": lines.push(renderInline(block.content)); break;
      case "quote": lines.push(`> ${renderInline(block.content)}`); break;
      case "code": lines.push(`\`\`\`${block.language}\n${block.text}\n\`\`\``); break;
      case "rule": lines.push("---"); break;
      case "list":
        block.items.forEach((item, index) => lines.push(`${block.ordered ? `${index + 1}.` : "-"} ${renderInline(item)}`));
        break;
      case "table": {
        if (!block.rows.length) break;
        const width = Math.max(...block.rows.map((row) => row.length));
        const normalized = block.rows.map((row) => Array.from({ length: width }, (_, i) => escapeTableCell(row[i] || "")));
        lines.push(`| ${normalized[0].join(" | ")} |`);
        lines.push(`| ${Array.from({ length: width }, () => "---").join(" | ")} |`);
        normalized.slice(1).forEach((row) => lines.push(`| ${row.join(" | ")} |`));
        break;
      }
      case "image": {
        const image = resources.get(block.imageId);
        if (!image) break;
        const target = image.kind === "remote" ? image.source : `images/${image.filename}`;
        lines.push(`![${block.alt || image.alt}](${target})`);
        break;
      }
      case "todos":
        lines.push("## 待办事项");
        block.items.forEach((item) => lines.push(`- [${item.done ? "x" : " "}] ${escapeMarkdown(item.text)}${item.time ? ` @ ${item.time}` : ""}`));
        break;
    }
  }

  return { markdown: `${lines.join("\n\n")}\n`, images: document.images };
}
