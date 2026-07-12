import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const outputDir = path.join(root, "verify-output");
const screenshotDir = path.join(outputDir, "screenshots");
const artifactDir = path.join(outputDir, "artifacts");
const logDir = path.join(outputDir, "logs");
const baseUrl = "http://daynotes.local/";
const distDir = path.join(root, "dist");
const editorChecks = [];
const shareChecks = [];

await Promise.all([
  fs.mkdir(screenshotDir, { recursive: true }),
  fs.mkdir(artifactDir, { recursive: true }),
  fs.mkdir(logDir, { recursive: true }),
]);

async function writeSelfContainedBundle() {
  let html = await fs.readFile(path.join(distDir, "index.html"), "utf8");
  const stylesheet = html.match(/<link[^>]+href="([^"]+\.css)"[^>]*>/);
  const moduleScript = html.match(/<script[^>]+type="module"[^>]+src="([^"]+\.js)"[^>]*><\/script>/);
  if (!stylesheet || !moduleScript) throw new Error("无法定位生产构建的 CSS 或 JavaScript 入口");
  const css = await fs.readFile(path.join(distDir, stylesheet[1].replace(/^\//, "")), "utf8");
  const javascript = await fs.readFile(path.join(distDir, moduleScript[1].replace(/^\//, "")), "utf8");
  const browserInit = await fs.readFile(path.join(root, "scripts", "verify-browser-init.js"), "utf8");
  const inlineJavascript = javascript.replace(/<\/script/gi, "<\\/script");
  html = html
    .replace(stylesheet[0], () => `<style>${css}</style>`)
    .replace(moduleScript[0], () => `<script>${browserInit}</script><script type="module">${inlineJavascript}</script>`);
  await fs.writeFile(path.join(artifactDir, "daynotes-bundle.html"), html, "utf8");
}

await writeSelfContainedBundle();

async function record(matrix, name, action, page) {
  try {
    const details = await action();
    matrix.push({ name, passed: true, details: details ?? null });
  } catch (error) {
    const screenshot = path.join(screenshotDir, `failure-${String(matrix.length + 1).padStart(2, "0")}.png`);
    await page.screenshot({ path: screenshot, fullPage: true }).catch(() => undefined);
    matrix.push({ name, passed: false, details: String(error), screenshot });
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const consoleMessages = [];
  page.on("console", (message) => consoleMessages.push(`[${message.type()}] ${message.text()}`));
  await page.route("http://daynotes.local/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\//, "");
    const filePath = path.resolve(distDir, relativePath);
    if (!filePath.startsWith(`${path.resolve(distDir)}${path.sep}`) && filePath !== path.join(path.resolve(distDir), "index.html")) {
      await route.fulfill({ status: 403, body: "Forbidden" });
      return;
    }
    try {
      const body = await fs.readFile(filePath);
      const extension = path.extname(filePath);
      const contentType = extension === ".html" ? "text/html; charset=utf-8"
        : extension === ".js" ? "text/javascript; charset=utf-8"
          : extension === ".css" ? "text/css; charset=utf-8"
            : extension === ".svg" ? "image/svg+xml"
              : "application/octet-stream";
      await route.fulfill({ status: 200, contentType, body });
    } catch {
      await route.fulfill({ status: 404, body: "Not Found" });
    }
  });

  await page.addInitScript(({ outputDir }) => {
    const state = {
      commands: [],
      notes: {},
      dialogQueue: [],
      clipboard: [],
      settings: {
        email: { smtp_host: "smtp.qq.com", smtp_port: 465, username: "", password: "", recipient: "", send_time: "08:00", weekdays_only: true, enabled: false },
        theme: "light",
        font_size: 14,
      },
    };
    window.__verifyState = state;
    window.ClipboardItem = class ClipboardItem {
      constructor(items) { this.items = items; }
    };
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        write: async (items) => {
          state.clipboard = await Promise.all(items.map(async (item) => {
            const result = {};
            for (const [type, blob] of Object.entries(item.items)) result[type] = await blob.text();
            return result;
          }));
        },
        writeText: async (text) => { state.clipboard = [{ "text/plain": text }]; },
      },
    });
    window.__TAURI_INTERNALS__ = {
      transformCallback: () => Math.floor(Math.random() * 1e9),
      unregisterCallback: () => {},
      convertFileSrc: (filePath) => filePath,
      invoke: async (cmd, args = {}) => {
        state.commands.push({ cmd, args });
        if (cmd === "get_settings") return state.settings;
        if (cmd === "get_notes_dates") return Object.keys(state.notes);
        if (cmd === "get_note") return state.notes[args.date] || null;
        if (cmd === "save_note") { state.notes[args.date] = args; return null; }
        if (cmd === "save_settings") { state.settings = args.settings; return null; }
        if (cmd === "plugin:dialog|save") {
          if (state.dialogQueue.length) return state.dialogQueue.shift();
          const defaultPath = args.options?.defaultPath || "export.bin";
          return `${outputDir.replace(/\\/g, "/")}/${defaultPath}`;
        }
        if (cmd === "plugin:dialog|open") return "C:\\验证资料\\说明 文档.txt";
        if (cmd === "export_markdown_zip") return { path: args.path, image_count: args.images.length };
        if (cmd === "export_pdf_pages") return { path: args.path, pages: args.pages.length, orientation: "portrait" };
        if (cmd === "write_binary_file") return null;
        if (cmd === "read_binary_file") return [];
        if (cmd === "send_daily_email") return "mock email sent";
        if (cmd === "test_email_settings") return "mock test email sent";
        throw new Error(`未处理的 Tauri 命令：${cmd}`);
      },
    };
  }, { outputDir });

  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  const editor = page.locator(".ProseMirror");
  await editor.waitFor({ state: "visible" });
  await page.screenshot({ path: path.join(screenshotDir, "editor-initial.png"), fullPage: true });

  const resetEditor = async (text = "验证文本") => {
    await page.reload({ waitUntil: "domcontentloaded" });
    await editor.waitFor({ state: "visible" });
    await editor.fill(text);
    await editor.click();
  };
  const selectAll = async () => {
    await editor.click();
    await page.keyboard.press("Control+A");
  };
  const toolbar = (title) => page.locator(`button[title="${title}"]`);

  for (const [name, title, selector] of [
    ["加粗", "加粗 (Ctrl+B)", "strong"],
    ["斜体", "斜体 (Ctrl+I)", "em"],
    ["下划线", "下划线 (Ctrl+U)", "u"],
    ["删除线", "删除线", "s"],
    ["高亮", "高亮", "mark"],
  ]) {
    await record(editorChecks, name, async () => {
      await resetEditor(); await selectAll(); await toolbar(title).click();
      assert(await editor.locator(selector).count() === 1, `${name} 未生成 ${selector}`);
    }, page);
  }

  for (const [name, title, selector] of [
    ["标题1", "标题1", "h1"], ["标题2", "标题2", "h2"], ["标题3", "标题3", "h3"],
    ["无序列表", "无序列表", "ul:not([data-type=taskList])"],
    ["有序列表", "有序列表", "ol"], ["任务列表", "任务列表", "ul[data-type=taskList]"],
    ["引用", "引用", "blockquote"],
  ]) {
    await record(editorChecks, name, async () => {
      await resetEditor(); await toolbar(title).click();
      assert(await editor.locator(selector).count() === 1, `${name} 未生成 ${selector}`);
    }, page);
  }

  await record(editorChecks, "代码块及语言", async () => {
    await resetEditor("const value = 1;");
    await toolbar("代码块").click();
    await page.getByRole("button", { name: "TypeScript", exact: true }).click();
    assert(await editor.locator('pre code[class*="language-typescript"]').count() === 1, "代码块语言未设置为 TypeScript");
  }, page);

  await record(editorChecks, "网页链接", async () => {
    await resetEditor("OpenAI"); await selectAll(); await toolbar("插入链接").click();
    await page.getByRole("button", { name: /网页链接/ }).click();
    await page.getByPlaceholder("https://example.com").fill("openai.com");
    await page.getByRole("button", { name: "确定", exact: true }).click();
    assert((await editor.locator("a").getAttribute("href")) === "https://openai.com/", "网页链接未规范化插入");
  }, page);

  await record(editorChecks, "本地文件链接", async () => {
    await resetEditor(); await toolbar("插入链接").click();
    await page.getByRole("button", { name: /本地文件/ }).click();
    const href = await editor.locator("a").getAttribute("href");
    assert(href?.startsWith("file:///C:/") && href.includes("%E9%AA%8C%E8%AF%81"), `本地链接异常：${href}`);
  }, page);

  await record(editorChecks, "图片 URL", async () => {
    await resetEditor();
    page.once("dialog", (dialog) => dialog.accept("https://example.com/image.png"));
    await toolbar("插入图片").click();
    await page.getByRole("button", { name: /图片链接/ }).click();
    assert((await editor.locator("img:not(.ProseMirror-separator)").getAttribute("src")) === "https://example.com/image.png", "图片 URL 未插入");
  }, page);

  await record(editorChecks, "本地图片", async () => {
    await resetEditor(); await toolbar("插入图片").click();
    await page.getByRole("button", { name: /本地文件/ }).click();
    await page.locator('input[type="file"]').setInputFiles({
      name: "pixel.png",
      mimeType: "image/png",
      buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"),
    });
    await page.waitForFunction(() => document.querySelector(".ProseMirror img")?.getAttribute("src")?.startsWith("data:image/png"));
  }, page);

  await record(editorChecks, "插入表格", async () => {
    await resetEditor(); await toolbar("插入表格").click();
    await page.getByRole("button", { name: "2 行 2 列", exact: true }).click();
    assert(await editor.locator("table tr").count() === 2 && await editor.locator("table tr").first().locator("th,td").count() === 2, "2x2 表格未插入");
  }, page);

  const tableAction = async (name, title, expectedRows, expectedCols) => {
    await record(editorChecks, name, async () => {
      await editor.locator("table td, table th").first().click();
      await toolbar(title).click();
      const rows = await editor.locator("table tr").count();
      const cols = rows ? await editor.locator("table tr").first().locator("th,td").count() : 0;
      assert(rows === expectedRows && cols === expectedCols, `${name} 后为 ${rows}x${cols}`);
    }, page);
  };
  await tableAction("上方插入行", "在上方插入行", 3, 2);
  await tableAction("下方插入行", "在下方插入行", 4, 2);
  await tableAction("左侧插入列", "在左侧插入列", 4, 3);
  await tableAction("右侧插入列", "在右侧插入列", 4, 4);
  await tableAction("删除当前行", "删除当前行", 3, 4);
  await tableAction("删除当前列", "删除当前列", 3, 3);
  await record(editorChecks, "删除表格", async () => {
    await editor.locator("table td, table th").first().click(); await toolbar("删除表格").click();
    assert(await editor.locator("table").count() === 0, "表格未删除");
  }, page);

  await record(editorChecks, "撤销", async () => {
    await resetEditor("撤销前"); await editor.press("End"); await editor.type("-新增");
    await toolbar("撤销 (Ctrl+Z)").click();
    assert(!(await editor.textContent()).includes("新增"), "撤销未移除新增文本");
  }, page);
  await record(editorChecks, "重做", async () => {
    await toolbar("重做 (Ctrl+Y)").click();
    assert((await editor.textContent()).includes("新增"), "重做未恢复新增文本");
  }, page);

  await page.screenshot({ path: path.join(screenshotDir, "editor-formatted.png"), fullPage: true });
  await resetEditor();
  await page.evaluate(() => {
    const editorElement = document.querySelector(".ProseMirror");
    if (!editorElement) throw new Error("Editor not found");
    const canvas = document.createElement("canvas");
    canvas.width = 96;
    canvas.height = 56;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas unavailable");
    context.fillStyle = "#4263eb";
    context.fillRect(0, 0, 96, 56);
    context.fillStyle = "#ffd43b";
    context.fillRect(24, 14, 48, 28);
    const dataUrl = canvas.toDataURL("image/png");
    const filler = Array.from({ length: 36 }, (_, index) => `<p>分页验证段落 ${index + 1}：确保长笔记能够完整导出，并优先在段落边界分页。</p>`).join("");
    editorElement.innerHTML = `<h1>一级标题</h1><h2>二级标题</h2><h3>三级标题</h3>
      <p><strong>粗体</strong> <em>斜体</em> <u>下划线</u> <s>删除线</s> <mark>高亮</mark> <code>行内代码</code> <a href="https://example.com">网页链接</a></p>
      <ul><li><p>无序列表</p></li></ul><ol><li><p>有序列表</p></li></ol>
      <ul data-type="taskList"><li data-type="taskItem" data-checked="true"><div><p>已完成任务</p></div></li><li data-type="taskItem" data-checked="false"><div><p>未完成任务</p></div></li></ul>
      <blockquote><p>引用内容</p></blockquote><pre><code class="language-ts">const value = 1;</code></pre><hr>
      <table><tbody><tr><th><strong>粗体表头</strong></th><th>列二</th></tr><tr><td><a href="https://example.com/cell">单元格链接</a></td><td>表格值</td></tr></tbody></table>
      <p><img src="${dataUrl}" alt="验证图片"></p>${filler}`;
    editorElement.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: "verify" }));
  });
  await page.waitForFunction(() => document.querySelector(".ProseMirror img:not(.ProseMirror-separator)"));
  await page.locator(".todo-add input").fill("分享验证待办");
  await page.locator(".todo-add input").press("Enter");

  const openShare = async () => {
    await page.locator('button[title="分享"]').click();
    await page.getByRole("heading", { name: /分享/ }).waitFor();
  };
  const commandsSince = async (before) => page.evaluate((start) => window.__verifyState.commands.slice(start), before);

  await record(shareChecks, "Markdown ZIP", async () => {
    await openShare();
    const before = await page.evaluate(() => window.__verifyState.commands.length);
    await page.getByText("导出为 Markdown", { exact: true }).click();
    await page.waitForFunction((start) => window.__verifyState.commands.slice(start).some((entry) => entry.cmd === "export_markdown_zip"), before);
    const command = (await commandsSince(before)).find((entry) => entry.cmd === "export_markdown_zip");
    assert(command.args.path.endsWith(".zip"), "Markdown 未使用 ZIP 路径");
    for (const expected of ["# 一级标题", "**粗体**", "<u>下划线</u>", "<mark>高亮</mark>", "- [x] 已完成任务", "- [ ] 未完成任务", "**粗体表头**", "[单元格链接](https://example.com/cell)", "分享验证待办"]) {
      assert(command.args.markdown.includes(expected), `Markdown 缺少：${expected}`);
    }
    assert(command.args.markdown.includes("images/image-1.png"), "Markdown 缺少图片引用");
    assert(command.args.images.length === 1 && command.args.images[0].bytes.length > 8, "Markdown 图片负载缺失");
    await fs.writeFile(path.join(artifactDir, "sample.md"), command.args.markdown, "utf8");
  }, page);

  await record(shareChecks, "富文本复制", async () => {
    await openShare(); await page.getByText("复制为富文本", { exact: true }).click();
    await page.waitForFunction(() => window.__verifyState.clipboard.length > 0);
    const clipboard = await page.evaluate(() => window.__verifyState.clipboard[0]);
    assert(clipboard["text/html"].includes("一级标题") && clipboard["text/html"].includes("分享验证待办"), "HTML 剪贴板内容不完整");
    assert(clipboard["text/plain"].includes("一级标题"), "纯文本剪贴板缺少正文");
  }, page);

  await record(shareChecks, "PDF", async () => {
    await openShare();
    const before = await page.evaluate(() => window.__verifyState.commands.length);
    await page.getByText("导出为 PDF", { exact: true }).click();
    await page.waitForFunction((start) => window.__verifyState.commands.slice(start).some((entry) => entry.cmd === "export_pdf_pages"), before);
    const command = (await commandsSince(before)).find((entry) => entry.cmd === "export_pdf_pages");
    assert(command.args.path.endsWith(".pdf") && command.args.pages.length >= 2, `长内容 PDF 应至少分页为 2 页，实际 ${command.args.pages.length} 页`);
    for (const filename of await fs.readdir(artifactDir)) {
      if (/^pdf-page-\d+\.png$/.test(filename)) await fs.unlink(path.join(artifactDir, filename));
    }
    for (let index = 0; index < command.args.pages.length; index++) {
      const bytes = Buffer.from(command.args.pages[index]);
      assert(bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), `PDF 第 ${index + 1} 页不是 PNG`);
      await fs.writeFile(path.join(artifactDir, `pdf-page-${index + 1}.png`), bytes);
    }
  }, page);

  await record(shareChecks, "PNG 图片", async () => {
    await openShare();
    const before = await page.evaluate(() => window.__verifyState.commands.length);
    await page.getByText("导出为图片", { exact: true }).click();
    await page.waitForFunction((start) => window.__verifyState.commands.slice(start).some((entry) => entry.cmd === "write_binary_file"), before);
    const command = (await commandsSince(before)).find((entry) => entry.cmd === "write_binary_file");
    const bytes = Buffer.from(command.args.contents);
    assert(command.args.path.endsWith(".png") && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), "PNG 文件签名无效");
    await fs.writeFile(path.join(artifactDir, "sample.png"), bytes);
  }, page);

  for (const [name, buttonText, forbidden] of [
    ["取消 Markdown 导出", "导出为 Markdown", "export_markdown_zip"],
    ["取消 PDF 导出", "导出为 PDF", "export_pdf_pages"],
    ["取消 PNG 导出", "导出为图片", "write_binary_file"],
  ]) {
    await record(shareChecks, name, async () => {
      await openShare();
      const before = await page.evaluate(() => {
        window.__verifyState.dialogQueue.push(null);
        return window.__verifyState.commands.length;
      });
      await page.getByText(buttonText, { exact: true }).click();
      await page.waitForTimeout(50);
      assert(!(await commandsSince(before)).some((entry) => entry.cmd === forbidden), `${name} 仍调用了 ${forbidden}`);
    }, page);
  }

  await openShare();
  await page.screenshot({ path: path.join(screenshotDir, "share-modal.png"), fullPage: true });
  await page.locator(".modal-close").click();

  await fs.writeFile(path.join(logDir, "gui-verification.txt"), "Playwright served the production dist bundle through an in-process route.\n", "utf8");
  await fs.writeFile(path.join(logDir, "agent-browser-console.txt"), `${consoleMessages.join("\n")}\n`, "utf8");
  await fs.writeFile(
    path.join(logDir, "agent-browser-errors.txt"),
    `${consoleMessages.filter((message) => message.startsWith("[error]")).join("\n")}\n`,
    "utf8",
  );
  await fs.writeFile(path.join(outputDir, "editor-matrix.json"), JSON.stringify(editorChecks, null, 2), "utf8");
  await fs.writeFile(path.join(outputDir, "share-matrix.json"), JSON.stringify(shareChecks, null, 2), "utf8");

  const allChecks = [...editorChecks, ...shareChecks];
  const summary = {
    generatedAt: new Date().toISOString(),
    passed: allChecks.every((check) => check.passed),
    editor: { passed: editorChecks.filter((check) => check.passed).length, total: editorChecks.length },
    share: { passed: shareChecks.filter((check) => check.passed).length, total: shareChecks.length },
    failed: allChecks.filter((check) => !check.passed),
    artifacts: ["artifacts/sample.md", "artifacts/sample.pdf", "artifacts/sample.png", "artifacts/daynotes-bundle.html"],
    screenshots: ["screenshots/editor-initial.png", "screenshots/editor-formatted.png", "screenshots/share-modal.png", "screenshots/agent-browser-initial.png", "screenshots/agent-browser-formatted.png", "screenshots/agent-browser-share-modal.png"],
    logs: ["logs/frontend-tests.txt", "logs/lint.txt", "logs/build.txt", "logs/rust-tests.txt", "logs/complete-ui.txt", "logs/agent-browser-console.txt", "logs/agent-browser-errors.txt"],
  };
  await fs.writeFile(path.join(outputDir, "summary.json"), JSON.stringify(summary, null, 2), "utf8");
  const report = `# DayNotes 完整验证报告\n\n生成时间：${summary.generatedAt}\n\n- 编辑器按钮：${summary.editor.passed}/${summary.editor.total}\n- 分享策略：${summary.share.passed}/${summary.share.total}\n- 总体结果：${summary.passed ? "通过" : "失败"}\n\n## 编辑器矩阵\n\n${editorChecks.map((check) => `- [${check.passed ? "x" : " "}] ${check.name}${check.passed ? "" : `：${check.details}`}`).join("\n")}\n\n## 分享矩阵\n\n${shareChecks.map((check) => `- [${check.passed ? "x" : " "}] ${check.name}${check.passed ? "" : `：${check.details}`}`).join("\n")}\n\n## 全量命令日志\n\n${summary.logs.map((item) => `- \`${item}\``).join("\n")}\n\n## 导出产物\n\n${summary.artifacts.map((item) => `- \`${item}\``).join("\n")}\n`;
  await fs.writeFile(path.join(outputDir, "report.md"), report, "utf8");
  console.log(JSON.stringify(summary, null, 2));
  if (!summary.passed) process.exitCode = 1;
} finally {
  if (browser) await browser.close();
}
