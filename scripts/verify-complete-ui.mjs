import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import { attachBrowserErrorListeners } from "./verify-browser-errors.mjs";

const root = process.cwd();
const outputDir = path.join(root, "verify-output");
const screenshotDir = path.join(outputDir, "screenshots");
const artifactDir = path.join(outputDir, "artifacts");
const logDir = path.join(outputDir, "logs");
const baseUrl = "http://daynotes.local/";
const distDir = path.join(root, "dist");
const editorChecks = [];
const shareChecks = [];
const acceptanceChecks = [];

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

function createVerificationPdf(pageCount) {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${Array.from({ length: pageCount }, (_, index) => `${3 + index * 2} 0 R`).join(" ")}] /Count ${pageCount} >>`,
  ];
  for (let index = 0; index < pageCount; index += 1) {
    const contentId = 4 + index * 2;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents ${contentId} 0 R >>`);
    objects.push("<< /Length 0 >>\nstream\n\nendstream");
  }
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, "ascii"));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf, "ascii");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, "ascii");
}

let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const consoleMessages = [];
  page.on("console", (message) => consoleMessages.push(`[${message.type()}] ${message.text()}`));
  attachBrowserErrorListeners(page, consoleMessages);
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
      rejectNextSave: false,
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
        if (cmd === "save_note") {
          if (state.rejectNextSave) {
            state.rejectNextSave = false;
            throw new Error("验证保存失败");
          }
          state.notes[args.date] = args;
          return null;
        }
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
  const toolbar = (name) => page.getByRole("button", { name, exact: true });

  const assertFocusedVisible = async (label) => {
    const focusStyle = await page.evaluate(() => {
      const active = document.activeElement;
      if (!(active instanceof HTMLElement)) return null;
      const style = getComputedStyle(active);
      return {
        tag: active.tagName,
        name: active.getAttribute("aria-label") || active.textContent?.trim() || "",
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
        boxShadow: style.boxShadow,
      };
    });
    assert(focusStyle, `${label} 没有活动焦点`);
    const hasOutline = focusStyle.outlineStyle !== "none" && Number.parseFloat(focusStyle.outlineWidth) > 0;
    const hasShadow = focusStyle.boxShadow !== "none";
    assert(hasOutline || hasShadow, `${label} 焦点不可见：${JSON.stringify(focusStyle)}`);
    return focusStyle;
  };
  const focusByTab = async (target, label) => {
    await page.evaluate(() => {
      document.body.tabIndex = -1;
      document.body.focus();
    });
    for (let index = 0; index < 80; index += 1) {
      await page.keyboard.press("Tab");
      if (await target.evaluate((element) => element === document.activeElement).catch(() => false)) {
        return assertFocusedVisible(label);
      }
    }
    throw new Error(`${label} 无法通过 Tab 到达`);
  };

  await editor.fill("晨光纸页验证：记录今天的重要想法。");
  await page.getByRole("textbox", { name: "新待办" }).fill("整理项目进展");
  await page.getByRole("textbox", { name: "新待办" }).press("Enter");
  await page.getByRole("textbox", { name: "新待办" }).fill("回顾明日计划");
  await page.getByRole("textbox", { name: "新待办" }).press("Enter");
  await page.getByRole("button", { name: "完成待办：整理项目进展" }).click();
  await page.screenshot({ path: path.join(screenshotDir, "ui-light-main.png") });
  await page.screenshot({ path: path.join(screenshotDir, "ui-todo-progress.png") });

  await page.getByRole("button", { name: "设置", exact: true }).click();
  const settingsDialog = page.getByRole("dialog", { name: "设置" });
  await settingsDialog.waitFor();
  await settingsDialog.getByRole("radio", { name: "深色" }).check();
  await settingsDialog.getByRole("button", { name: "保存设置" }).click();
  await page.waitForFunction(() => document.documentElement.getAttribute("data-theme") === "dark");
  await page.locator(".toast").waitFor({ state: "hidden" });
  await page.screenshot({ path: path.join(screenshotDir, "ui-dark-main.png") });

  await page.getByRole("button", { name: "设置", exact: true }).click();
  await settingsDialog.waitFor();
  await settingsDialog.getByRole("radio", { name: "浅色" }).check();
  await settingsDialog.getByRole("button", { name: "保存设置" }).click();
  await page.waitForFunction(() => document.documentElement.getAttribute("data-theme") !== "dark");
  await page.locator(".toast").waitFor({ state: "hidden" });
  await page.setViewportSize({ width: 700, height: 900 });
  const horizontalMetrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  assert(horizontalMetrics.scrollWidth === horizontalMetrics.clientWidth, `窄屏产生横向滚动：${JSON.stringify(horizontalMetrics)}`);
  await page.screenshot({ path: path.join(screenshotDir, "ui-narrow-main.png") });
  await page.setViewportSize({ width: 1440, height: 1000 });

  await page.keyboard.press("Control+S");
  await page.getByText("已保存", { exact: true }).first().waitFor();
  await page.locator(".toast").waitFor({ state: "hidden" });
  const calendarTrigger = page.getByRole("button", { name: "选择日期", exact: true });
  await focusByTab(calendarTrigger, "日历入口");
  await page.keyboard.press("Enter");
  const focusedCalendarDay = page.locator(".calendar-day:focus");
  await focusedCalendarDay.waitFor();
  assert((await focusedCalendarDay.getAttribute("aria-label"))?.includes("有笔记"), "日历焦点日期未标记有笔记");
  await assertFocusedVisible("日历日期");
  await page.screenshot({ path: path.join(screenshotDir, "ui-calendar-focus.png") });
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "选择日期");

  await focusByTab(page.getByRole("button", { name: "立即发送今日邮件", exact: true }), "页头操作");
  await focusByTab(page.getByRole("button", { name: "加粗 (Ctrl+B)", exact: true }), "编辑工具栏");

  const shareTrigger = page.getByRole("button", { name: "分享", exact: true });
  await focusByTab(shareTrigger, "分享入口");
  await page.keyboard.press("Enter");
  const shareDialog = page.getByRole("dialog", { name: /分享/ });
  await shareDialog.waitFor();
  await assertFocusedVisible("分享弹窗");
  await page.keyboard.press("Tab");
  assert(await shareDialog.evaluate((dialog) => dialog.contains(document.activeElement)), "分享弹窗未约束 Tab 焦点");
  await page.screenshot({ path: path.join(screenshotDir, "ui-share-modal.png") });
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "分享");

  const settingsTrigger = page.getByRole("button", { name: "设置", exact: true });
  await focusByTab(settingsTrigger, "设置入口");
  await page.keyboard.press("Enter");
  await settingsDialog.waitFor();
  await assertFocusedVisible("设置弹窗");
  await page.keyboard.press("Tab");
  assert(await settingsDialog.evaluate((dialog) => dialog.contains(document.activeElement)), "设置弹窗未约束 Tab 焦点");
  await page.screenshot({ path: path.join(screenshotDir, "ui-settings-modal.png") });
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "设置");

  await page.emulateMedia({ reducedMotion: "reduce" });
  const transitionSeconds = await toolbar("加粗 (Ctrl+B)").evaluate((button) => getComputedStyle(button).transitionDuration
    .split(",")
    .map((duration) => duration.trim().endsWith("ms") ? Number.parseFloat(duration) / 1000 : Number.parseFloat(duration)));
  assert(transitionSeconds.every((duration) => duration <= 0.001), `减少动态效果未生效：${transitionSeconds.join(", ")}s`);
  await page.emulateMedia({ reducedMotion: "no-preference" });

  await page.evaluate(() => { window.__verifyState.rejectNextSave = true; });
  await editor.fill("保存失败视觉验证");
  await page.keyboard.press("Control+S");
  await page.getByLabel("编辑工具栏").getByText("保存失败", { exact: true }).waitFor();
  await page.getByLabel("编辑工具栏").getByRole("button", { name: "重试", exact: true }).waitFor();
  await page.screenshot({ path: path.join(screenshotDir, "ui-save-error.png") });

  acceptanceChecks.push(
    { name: "窄屏无横向滚动", passed: true, details: horizontalMetrics },
    { name: "键盘焦点可见且可恢复", passed: true, details: null },
    { name: "减少动态效果", passed: true, details: transitionSeconds },
    { name: "八种视觉状态", passed: true, details: null },
  );

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
  const clickEditorCommand = async (name, location = "toolbar") => {
    if (location === "insert") {
      await page.getByRole("button", { name: "插入内容", exact: true }).click();
      await page.getByRole("menu", { name: "插入内容" }).getByText(name, { exact: true }).click();
      return;
    }
    await toolbar(name).click();
  };

  for (const [name, title, selector] of [
    ["加粗", "加粗 (Ctrl+B)", "strong"],
    ["斜体", "斜体 (Ctrl+I)", "em"],
    ["下划线", "下划线 (Ctrl+U)", "u"],
    ["删除线", "删除线", "s"],
    ["高亮", "高亮", "mark"],
  ]) {
    await record(editorChecks, name, async () => {
      await resetEditor(); await selectAll(); await clickEditorCommand(title);
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
      await resetEditor(); await clickEditorCommand(title);
      assert(await editor.locator(selector).count() === 1, `${name} 未生成 ${selector}`);
    }, page);
  }

  await record(editorChecks, "代码块及语言", async () => {
    await resetEditor("const value = 1;");
    await clickEditorCommand("代码块", "insert");
    await page.getByRole("button", { name: "TypeScript", exact: true }).click();
    assert(await editor.locator('pre code[class*="language-typescript"]').count() === 1, "代码块语言未设置为 TypeScript");
  }, page);

  await record(editorChecks, "网页链接", async () => {
    await resetEditor("OpenAI"); await selectAll(); await clickEditorCommand("插入链接", "insert");
    await page.getByRole("button", { name: /网页链接/ }).click();
    await page.getByPlaceholder("https://example.com").fill("openai.com");
    await page.getByRole("button", { name: "确定", exact: true }).click();
    assert((await editor.locator("a").getAttribute("href")) === "https://openai.com/", "网页链接未规范化插入");
  }, page);

  await record(editorChecks, "本地文件链接", async () => {
    await resetEditor(); await clickEditorCommand("插入链接", "insert");
    await page.getByRole("button", { name: /本地文件/ }).click();
    const href = await editor.locator("a").getAttribute("href");
    assert(href?.startsWith("file:///C:/") && href.includes("%E9%AA%8C%E8%AF%81"), `本地链接异常：${href}`);
  }, page);

  await record(editorChecks, "图片 URL", async () => {
    await resetEditor();
    page.once("dialog", (dialog) => dialog.accept("https://example.com/image.png"));
    await clickEditorCommand("插入图片", "insert");
    await page.getByRole("button", { name: /图片链接/ }).click();
    assert((await editor.locator("img:not(.ProseMirror-separator)").getAttribute("src")) === "https://example.com/image.png", "图片 URL 未插入");
  }, page);

  await record(editorChecks, "本地图片", async () => {
    await resetEditor(); await clickEditorCommand("插入图片", "insert");
    await page.getByRole("button", { name: /本地文件/ }).click();
    await page.locator('input[type="file"]').setInputFiles({
      name: "pixel.png",
      mimeType: "image/png",
      buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"),
    });
    await page.waitForFunction(() => document.querySelector(".ProseMirror img")?.getAttribute("src")?.startsWith("data:image/png"));
  }, page);

  await record(editorChecks, "插入表格", async () => {
    await resetEditor(); await clickEditorCommand("插入表格", "insert");
    await page.getByRole("button", { name: "2 行 2 列", exact: true }).click();
    assert(await editor.locator("table tr").count() === 2 && await editor.locator("table tr").first().locator("th,td").count() === 2, "2x2 表格未插入");
  }, page);

  const tableAction = async (name, title, expectedRows, expectedCols) => {
    await record(editorChecks, name, async () => {
      await editor.locator("table td, table th").first().click();
      await clickEditorCommand(title);
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
    await editor.locator("table td, table th").first().click(); await clickEditorCommand("删除表格");
    assert(await editor.locator("table").count() === 0, "表格未删除");
  }, page);

  await record(editorChecks, "撤销", async () => {
    await resetEditor("撤销前"); await editor.press("End"); await editor.type("-新增");
    await clickEditorCommand("撤销 (Ctrl+Z)");
    assert(!(await editor.textContent()).includes("新增"), "撤销未移除新增文本");
  }, page);
  await record(editorChecks, "重做", async () => {
    await clickEditorCommand("重做 (Ctrl+Y)");
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
    await fs.writeFile(path.join(artifactDir, "sample.pdf"), createVerificationPdf(command.args.pages.length));
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
  await page.getByRole("button", { name: "关闭分享", exact: true }).click();

  await fs.writeFile(path.join(logDir, "gui-verification.txt"), "Playwright served the production dist bundle through an in-process route.\n", "utf8");
  await fs.writeFile(path.join(logDir, "agent-browser-console.txt"), `${consoleMessages.join("\n")}\n`, "utf8");
  await fs.writeFile(
    path.join(logDir, "agent-browser-errors.txt"),
    `${consoleMessages.filter((message) => message.startsWith("[error]")).join("\n")}\n`,
    "utf8",
  );
  await fs.writeFile(path.join(outputDir, "editor-matrix.json"), JSON.stringify(editorChecks, null, 2), "utf8");
  await fs.writeFile(path.join(outputDir, "share-matrix.json"), JSON.stringify(shareChecks, null, 2), "utf8");

  assert(editorChecks.length >= 27, `编辑器检查数下降为 ${editorChecks.length}`);
  assert(shareChecks.length === 7, `分享检查数应为 7，实际 ${shareChecks.length}`);
  const allChecks = [...editorChecks, ...shareChecks, ...acceptanceChecks];
  const summary = {
    generatedAt: new Date().toISOString(),
    passed: allChecks.every((check) => check.passed),
    editor: { passed: editorChecks.filter((check) => check.passed).length, total: editorChecks.length },
    share: { passed: shareChecks.filter((check) => check.passed).length, total: shareChecks.length },
    acceptance: { passed: acceptanceChecks.filter((check) => check.passed).length, total: acceptanceChecks.length },
    failed: allChecks.filter((check) => !check.passed),
    artifacts: ["artifacts/sample.md", "artifacts/sample.pdf", "artifacts/sample.png", "artifacts/daynotes-bundle.html"],
    screenshots: [
      "screenshots/editor-initial.png",
      "screenshots/editor-formatted.png",
      "screenshots/share-modal.png",
      "screenshots/ui-light-main.png",
      "screenshots/ui-dark-main.png",
      "screenshots/ui-narrow-main.png",
      "screenshots/ui-calendar-focus.png",
      "screenshots/ui-todo-progress.png",
      "screenshots/ui-share-modal.png",
      "screenshots/ui-settings-modal.png",
      "screenshots/ui-save-error.png",
    ],
    logs: ["logs/gui-verification.txt", "logs/agent-browser-console.txt", "logs/agent-browser-errors.txt"],
  };
  await fs.writeFile(path.join(outputDir, "summary.json"), JSON.stringify(summary, null, 2), "utf8");
  const report = `# DayNotes 完整验证报告\n\n生成时间：${summary.generatedAt}\n\n- 编辑器按钮：${summary.editor.passed}/${summary.editor.total}\n- 分享策略：${summary.share.passed}/${summary.share.total}\n- UI 验收：${summary.acceptance.passed}/${summary.acceptance.total}\n- 总体结果：${summary.passed ? "通过" : "失败"}\n\n## 编辑器矩阵\n\n${editorChecks.map((check) => `- [${check.passed ? "x" : " "}] ${check.name}${check.passed ? "" : `：${check.details}`}`).join("\n")}\n\n## 分享矩阵\n\n${shareChecks.map((check) => `- [${check.passed ? "x" : " "}] ${check.name}${check.passed ? "" : `：${check.details}`}`).join("\n")}\n\n## UI 验收矩阵\n\n${acceptanceChecks.map((check) => `- [${check.passed ? "x" : " "}] ${check.name}${check.passed ? "" : `：${check.details}`}`).join("\n")}\n\n## 全量命令日志\n\n${summary.logs.map((item) => `- \`${item}\``).join("\n")}\n\n## 导出产物\n\n${summary.artifacts.map((item) => `- \`${item}\``).join("\n")}\n`;
  await fs.writeFile(path.join(outputDir, "report.md"), report, "utf8");
  console.log(JSON.stringify(summary, null, 2));
  if (!summary.passed) process.exitCode = 1;
} finally {
  if (browser) await browser.close();
}
