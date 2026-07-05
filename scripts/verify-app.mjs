import { chromium } from "playwright";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";

const root = process.cwd();
const outDir = path.join(root, "verify-results");
const port = 5173;
const baseUrl = `http://127.0.0.1:${port}/`;

const checks = [];
const artifacts = {};

function check(name, passed, details = undefined) {
  checks.push({ name, passed: Boolean(passed), details });
}

async function resetOutputDir() {
  await fs.mkdir(outDir, { recursive: true });
  for (const entry of await fs.readdir(outDir)) {
    await fs.rm(path.join(outDir, entry), { recursive: true, force: true });
  }
}

function waitForHttp(url, timeoutMs = 30000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });
      req.on("error", () => {
        if (Date.now() - started > timeoutMs) {
          reject(new Error(`Timed out waiting for ${url}`));
        } else {
          setTimeout(attempt, 300);
        }
      });
      req.setTimeout(2000, () => {
        req.destroy();
      });
    };
    attempt();
  });
}

async function writeVerifyFiles(files) {
  for (const [filePath, contents] of Object.entries(files)) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    if (Array.isArray(contents)) {
      await fs.writeFile(filePath, Buffer.from(contents));
    } else {
      await fs.writeFile(filePath, contents, "utf8");
    }
  }
}

async function readImageSize(browser, imagePath) {
  const page = await browser.newPage();
  const fileUrl = `file:///${imagePath.replace(/\\/g, "/")}`;
  await page.goto(fileUrl);
  const size = await page.locator("img").evaluate((img) => ({
    complete: img.complete,
    naturalWidth: img.naturalWidth,
    naturalHeight: img.naturalHeight,
  }));
  await page.close();
  return size;
}

await resetOutputDir();

const vite = spawn(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["vite", "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
  { cwd: root, stdio: ["ignore", "pipe", "pipe"] }
);

let viteOutput = "";
vite.stdout.on("data", (chunk) => {
  viteOutput += chunk.toString();
});
vite.stderr.on("data", (chunk) => {
  viteOutput += chunk.toString();
});

let browser;
try {
  await waitForHttp(baseUrl);

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

  await page.addInitScript(({ outDir }) => {
    const notes = {};
    const commands = [];
    const files = {};
    const settings = {
      email: {
        smtp_host: "smtp.qq.com",
        smtp_port: 465,
        username: "",
        password: "",
        recipient: "",
        send_time: "08:00",
        weekdays_only: true,
        enabled: false,
      },
      theme: "light",
      font_size: 14,
    };

    window.__verifyState = { notes, commands, files, settings };
    window.__TAURI_INTERNALS__ = {
      transformCallback: () => Math.floor(Math.random() * 1e9),
      unregisterCallback: () => {},
      convertFileSrc: (filePath) => filePath,
      invoke: async (cmd, args = {}) => {
        commands.push({ cmd, args });
        if (cmd === "get_settings") return settings;
        if (cmd === "save_settings") {
          Object.assign(settings, args.settings);
          return null;
        }
        if (cmd === "get_notes_dates") return Object.keys(notes);
        if (cmd === "get_note") return notes[args.date] || null;
        if (cmd === "save_note") {
          notes[args.date] = {
            date: args.date,
            content: args.content,
            todos: args.todos,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          return null;
        }
        if (cmd === "delete_note") {
          delete notes[args.date];
          return null;
        }
        if (cmd === "send_daily_email") return "mock email sent";
        if (cmd === "plugin:dialog|open") return outDir;
        if (cmd === "write_text_file") {
          files[args.path] = args.contents;
          return null;
        }
        if (cmd === "write_binary_file") {
          files[args.path] = args.contents;
          return null;
        }
        throw new Error(`Unhandled command: ${cmd}`);
      },
    };
  }, { outDir });

  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.waitForSelector(".ProseMirror", { timeout: 15000 });
  check("app boots and editor is visible", await page.locator(".ProseMirror").isVisible());

  await page.locator(".todo-add input").fill("Verify todo item");
  await page.keyboard.press("Enter");
  await page.locator(".todo-time").fill("14:30");
  await page.locator(".todo-check").first().click();
  check("todo add, time, toggle works", await page.locator(".todo-item.completed").count() === 1);

  await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#e03131";
    ctx.fillRect(0, 0, 32, 32);
    ctx.fillStyle = "#ffd43b";
    ctx.fillRect(8, 8, 16, 16);
    const dataUrl = canvas.toDataURL("image/png");
    const editor = document.querySelector(".ProseMirror");
    if (!editor) throw new Error("Editor not found");
    editor.innerHTML = `
      <h1>H1 Title</h1>
      <h2>H2 Section</h2>
      <h3>H3 Subsection</h3>
      <h4>H4 Detail</h4>
      <p><strong>Bold text</strong> <em>Italic text</em> <u>Underline text</u> <s>Strike text</s> <mark>Highlight text</mark> <code>inline_code()</code> <a href="https://example.com/export">Export link</a></p>
      <blockquote><p>Blockquote line</p></blockquote>
      <ul><li><p>Bullet item A</p></li></ul>
      <ol><li><p>Ordered item one</p></li></ol>
      <pre><code class="language-ts">const answer: number = 42;</code></pre>
      <table><tbody><tr><th>Name | Key</th><th>Value</th></tr><tr><td>A | B</td><td>C\\D</td></tr><tr><td>Beta</td><td>Open</td></tr></tbody></table>
      <p><img src="${dataUrl}" alt="Visible red square"></p>
    `;
    editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: "verify" }));
  });

  const commandCountBeforeSave = await page.evaluate(() => window.__verifyState.commands.length);
  await page.locator(".ProseMirror").click();
  await page.keyboard.press("Control+S");
  await page.waitForFunction(
    (before) =>
      window.__verifyState.commands
        .slice(before)
        .some((entry) => entry.cmd === "save_note"),
    commandCountBeforeSave,
    { timeout: 5000 }
  ).catch(() => undefined);
  const savedAfterShortcut = await page.evaluate((before) =>
    window.__verifyState.commands
      .slice(before)
      .some((entry) => entry.cmd === "save_note"),
    commandCountBeforeSave
  );
  check("ctrl+s invokes save_note", savedAfterShortcut);

  await page.screenshot({ path: path.join(outDir, "editor.png"), fullPage: true });
  artifacts.editorScreenshot = path.join(outDir, "editor.png");

  await page.evaluate(() => document.querySelectorAll(".top-bar-right .tool-btn")[1].click());
  await page.waitForSelector(".modal-content", { timeout: 10000 });
  await page.screenshot({ path: path.join(outDir, "share-modal.png"), fullPage: true });
  artifacts.shareModalScreenshot = path.join(outDir, "share-modal.png");
  await page.locator(".share-option").first().click();
  await page.waitForFunction(
    () => Object.keys(window.__verifyState.files || {}).some((filePath) => filePath.endsWith(".md")),
    null,
    { timeout: 10000 }
  );

  const emailReachable = await page.evaluate(async () => {
    const before = window.__verifyState.commands.length;
    document.querySelectorAll(".top-bar-right .tool-btn")[0].click();
    await new Promise((resolve) => setTimeout(resolve, 100));
    return window.__verifyState.commands.slice(before).some((entry) => entry.cmd === "send_daily_email");
  });

  const verifyState = await page.evaluate(() => window.__verifyState);
  await writeVerifyFiles(verifyState.files);

  const mdPath = Object.keys(verifyState.files).find((filePath) => filePath.endsWith(".md"));
  const markdown = await fs.readFile(mdPath, "utf8");
  await fs.writeFile(path.join(outDir, "markdown-preview.txt"), markdown, "utf8");
  artifacts.markdownFile = mdPath;

  const imagePaths = Object.keys(verifyState.files).filter((filePath) => /image_\d+\./.test(path.basename(filePath)));
  const imageResults = [];
  for (const imagePath of imagePaths) {
    imageResults.push({ path: imagePath, ...(await readImageSize(browser, imagePath)) });
  }

  check("markdown keeps underline as html", markdown.includes("<u>Underline text</u>"));
  check("markdown keeps delete as html", markdown.includes("<del>Strike text</del>"));
  check("markdown keeps highlight as html", markdown.includes("<mark>Highlight text</mark>"));
  check("markdown does not emit equals highlight", !markdown.includes("==Highlight text=="));
  check("markdown escapes table pipes", markdown.includes("Name \\| Key") && markdown.includes("A \\| B"));
  check("markdown escapes table backslash", markdown.includes("C\\\\D"));
  check("markdown exports image reference with alt", markdown.includes("![Visible red square](image_1.png)"));
  check("exported image file exists", imagePaths.length === 1, imagePaths);
  check("exported image decodes in browser", imageResults.every((img) => img.naturalWidth > 0 && img.naturalHeight > 0), imageResults);
  check("mock email command is reachable", emailReachable);

  const summary = {
    generatedAt: new Date().toISOString(),
    url: baseUrl,
    passed: checks.every((item) => item.passed),
    checks,
    artifacts,
    commandCount: verifyState.commands.length,
    commands: verifyState.commands.map((entry) => entry.cmd),
    viteOutput,
  };
  await fs.writeFile(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2), "utf8");

  if (!summary.passed) {
    console.error(JSON.stringify(summary, null, 2));
    process.exitCode = 1;
  } else {
    console.log(JSON.stringify(summary, null, 2));
  }
} finally {
  if (browser) await browser.close();
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(vite.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    vite.kill("SIGTERM");
  }
}
