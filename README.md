# DayNotes

DayNotes 是一款以日期为核心的 Windows 桌面笔记应用。每天对应一篇笔记，集成富文本编辑、待办清单、自动保存、内容导出和 SMTP 邮件推送，主要面向中文用户。

## 主要功能

| 功能 | 说明 |
| --- | --- |
| 富文本编辑 | 支持粗体、斜体、下划线、删除线、高亮、标题、引用、列表、任务列表、链接、图片和表格 |
| 代码块 | 支持语法高亮、语言选择和代码内容导出 |
| 日期笔记 | 按 `YYYY-MM-DD` 管理每日笔记，支持前后翻页和日历选择 |
| 待办清单 | 支持新增、编辑、完成和删除，可通过日历与时间选择器设置截止时间，并显示完成进度和逾期状态 |
| 自动保存 | 编辑后 2 秒自动保存，`Ctrl+S` 可立即保存 |
| 分享导出 | 可选择包含首尾日期的分享范围，支持 Markdown、富文本 HTML、PDF、图片以及包含资源文件的 ZIP 导出 |
| 高保真 PDF | 使用浏览器渲染结果分页生成 PDF，保留编辑器中的表格、图片、代码块和格式样式 |
| 邮件推送 | 支持 SMTP 配置、测试邮件和每日内容推送 |
| 外观主题 | 支持浅色、深色和跟随系统主题 |
| 单实例运行 | 重复启动时激活已有窗口，避免同时打开多个应用实例 |

## 分享与导出

分享页默认展示当前日期，也可以通过开始、结束日历选择一段时间。范围内的非空笔记按日期从早到晚合并，未保存的当前编辑内容会优先用于预览和导出。分享内容包括：

- 标题、段落、粗体、斜体、下划线、删除线和高亮
- 有序列表、无序列表、任务列表和引用
- 链接、图片、表格、水平分割线和换行
- 带语言信息的代码块
- 各日期对应的待办清单、完成状态及已设置的截止日期时间

Markdown 导出会尽量保留语义结构；PDF 和图片导出侧重视觉一致性。包含本地或嵌入图片时，可以导出 ZIP，使 Markdown 与图片资源一并保存。单日文件名保持原格式，多日导出文件名会包含起止日期。

## 技术栈

| 层级 | 技术 |
| --- | --- |
| 桌面框架 | Tauri 2 |
| 前端 | React 19、TypeScript 5、Vite 6 |
| 编辑器 | Tiptap 3、lowlight |
| 后端 | Rust、Tokio |
| 数据库 | SQLite、rusqlite |
| 邮件 | lettre、rustls |
| 测试 | Vitest、Testing Library、Playwright、Rust Test |

## 环境要求

- Windows 10/11 x64
- Node.js 20.10 或更高版本
- npm 10 或更高版本
- Rust stable MSVC 工具链
- Visual Studio 2022 Build Tools，并安装“使用 C++ 的桌面开发”工作负载
- WebView2 Runtime

### 中文用户目录注意事项

如果 Windows 用户名或 Rust 安装路径包含中文，必须使用 MSVC 工具链，不能使用 MinGW GNU 工具链。同时需要确保 Visual Studio 的 `link.exe` 位于 Git 自带的 `link.exe` 之前。

仓库中的 `dev.ps1` 会自动检测最新的 MSVC 和 Windows SDK，并配置 `PATH`、`LIB` 和 `INCLUDE` 环境变量。

## 快速开始

```powershell
git clone https://github.com/cherub0/daynotes.git
cd daynotes
npm install
```

启动完整桌面开发环境：

```powershell
.\dev.ps1
```

仅启动 Vite 前端：

```powershell
npm run dev
```

## 常用命令

```powershell
# TypeScript 类型检查和前端生产构建
npm run build

# ESLint
npm run lint

# 前端单元与组件测试
npm test

# Rust 测试（自动配置 MSVC 环境）
npm run verify:rust

# 完整 UI 编辑能力与全部分享策略验证
npm run verify:complete-ui

# 检查并整理验证证据
npm run verify:evidence

# 完整验证
npm run verify
```

完整 UI 验证结果和截图保存在 `verify-output/`。该目录用于保留编辑按钮覆盖情况及 Markdown、HTML、PDF、图片、ZIP 等分享策略的验证证据。

## 生产构建

建议在 Visual Studio Developer PowerShell 中执行：

```powershell
npm run tauri:build
```

构建完成后，主要产物位于：

```text
src-tauri/target/release/daynotes.exe
src-tauri/target/release/bundle/nsis/DayNotes_<版本>_x64-setup.exe
src-tauri/target/release/bundle/msi/DayNotes_<版本>_x64_zh-CN.msi
```

当前应用版本为 `0.3.0`。正式对外分发前，建议为安装包配置 Windows 代码签名证书。

## 项目结构

```text
daynotes/
├─ src/                         React 前端
│  ├─ components/              编辑器、日期栏、待办、分享和设置组件
│  ├─ lib/                     IPC、类型、导出和通用逻辑
│  ├─ App.tsx                  应用状态与页面布局
│  └─ index.css                全局样式与主题变量
├─ src-tauri/                  Tauri/Rust 后端
│  ├─ src/email.rs             SMTP 邮件逻辑
│  ├─ src/export_pdf.rs        PDF 生成
│  ├─ src/export_zip.rs        Markdown 资源包生成
│  ├─ src/window_lifecycle.rs  单实例窗口激活
│  └─ src/lib.rs               数据库与 Tauri 命令注册
├─ scripts/                    自动化验证脚本
├─ verify-output/              UI 和分享策略验证证据
├─ docs/                       设计、实现计划和验证记录
├─ dev.ps1                    Windows MSVC 开发启动脚本
└─ package.json
```

## 数据存储

SQLite 数据库默认位于：

```text
%APPDATA%/com.daynotes.app/daynotes.db
```

核心表结构：

```sql
CREATE TABLE notes (
    date TEXT PRIMARY KEY,
    content TEXT,
    todos TEXT,
    created_at TEXT,
    updated_at TEXT
);

CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT
);
```

笔记正文以 HTML 保存，待办事项和应用设置以 JSON 保存。

## SMTP 配置

| 邮件服务 | SMTP 服务器 | 常用端口 |
| --- | --- | --- |
| QQ 邮箱 | `smtp.qq.com` | 465 |
| 163 邮箱 | `smtp.163.com` | 465 |
| Gmail | `smtp.gmail.com` | 587 |
| Outlook | `smtp.office365.com` | 587 |

QQ 邮箱和 163 邮箱通常需要使用 SMTP 授权码，而不是网页登录密码。不同邮件服务商的安全策略可能变化，请以服务商当前说明为准。

## 后续规划

- 完善数据库迁移和敏感配置安全存储
- 增加系统托盘、可靠的定时邮件和应用自动更新
- 建立持续集成、安装包签名和自动发布流程
- 为 Markdown、HTML、PDF、图片和 ZIP 导出持续补充回归测试

## License

MIT © cherub0
