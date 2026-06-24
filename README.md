# DayNotes 📝

> 以日期为核心维度的 Windows 桌面便签应用，兼具富文本编辑、待办管理、代码记录与分享协作能力。

## ✨ 功能特性

| 功能 | 说明 |
|------|------|
| 📝 **富文本编辑** | 基于 Tiptap，加粗/斜体/下划线/删除线/高亮/标题/列表/引用/表格 |
| 🔗 **链接与图片** | 插入超链接和图片 |
| 💻 **代码块** | 语法高亮（190+ 语言），等宽字体深色背景 |
| 📋 **待办清单** | 添加/勾选/编辑/删除，支持时间标记和进度统计 |
| 📅 **日期导航** | 左右翻页、日历选择器、快捷键 `Ctrl+←` `Ctrl+→` |
| 📤 **分享导出** | Markdown / 富文本复制 / PDF / 分享图片 |
| 📧 **邮件推送** | SMTP 定时发送每日任务，支持工作日模式 |
| 🌙 **深色主题** | 跟随系统 / 浅色 / 深色 |
| 💾 **自动保存** | 编辑后 2 秒自动保存，`Ctrl+S` 手动保存 |

## 🏗 技术栈

```
桌面框架    Tauri 2.0 (Rust)
前端        React 19 + TypeScript
编辑器      Tiptap 3 + lowlight
样式        CSS Variables（无框架依赖）
数据库      SQLite (rusqlite)
邮件        lettre (SMTP)
构建        Vite 6
```

## 🔧 开发环境要求

- **Node.js** >= 20.10
- **Rust** >= 1.77 (MSVC toolchain)
- **Visual Studio 2022 Build Tools**（C++ workload）
- **Windows 10/11**

## 🚀 快速开始

```bash
# 1. 克隆项目
git clone https://github.com/cherub0/daynotes.git
cd daynotes

# 2. 安装前端依赖
npm install

# 3. 启动开发
.\dev.ps1
# 或手动: npx tauri dev

# 4. 构建生产版本
npx tauri build
```

## 📁 项目结构

```
daynotes/
├── src-tauri/                    # Tauri 后端 (Rust)
│   ├── Cargo.toml                # Rust 依赖配置
│   ├── tauri.conf.json           # 窗口/打包配置
│   ├── capabilities/default.json # 权限声明
│   └── src/
│       ├── main.rs               # 程序入口
│       └── lib.rs                # 核心逻辑
│           ├── 数据库初始化 & 表创建
│           ├── 笔记 CRUD（7 个 Tauri 命令）
│           └── SMTP 邮件发送
├── src/                          # 前端 (React + TS)
│   ├── App.tsx                   # 主布局 & 状态 & 自动保存
│   ├── lib/
│   │   ├── types.ts              # 类型 + 日期工具函数
│   │   └── tauri.ts              # Tauri IPC 调用封装
│   └── components/
│       ├── Editor.tsx            # Tiptap 富文本编辑器
│       ├── DateHeader.tsx        # 日期导航栏
│       ├── CalendarPicker.tsx    # 日历选择器
│       ├── TodoPanel.tsx         # 待办清单面板
│       ├── ShareModal.tsx        # 分享/导出弹窗
│       └── SettingsModal.tsx     # 设置面板
├── dev.ps1                       # 开发启动脚本（配置 MSVC 环境）
└── package.json
```

## 💾 数据存储

数据库：`%APPDATA%/com.daynotes.app/daynotes.db`（SQLite）

```sql
CREATE TABLE notes (
    date TEXT PRIMARY KEY,    -- 'YYYY-MM-DD'
    content TEXT,             -- HTML 内容
    todos TEXT,               -- JSON 待办数组
    created_at TEXT,
    updated_at TEXT
);

CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT               -- JSON 设置
);
```

## 📧 邮件配置

| 服务 | SMTP 服务器 | 端口 |
|------|------------|------|
| QQ邮箱 | smtp.qq.com | 465 |
| 163邮箱 | smtp.163.com | 465 |
| Gmail | smtp.gmail.com | 587 |
| Outlook | smtp.office365.com | 587 |

> QQ/163 邮箱需使用**授权码**而非登录密码。

## 📄 License

MIT © cherub0
