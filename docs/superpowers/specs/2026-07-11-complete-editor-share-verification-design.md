# DayNotes 编辑与分享全覆盖验证设计

## 目标

建立可重复执行的验证矩阵，覆盖所有编辑器工具栏按钮、表格操作和全部分享策略，并将测试结果、截图、日志及导出产物统一保存在仓库根目录的 `verify-output/`。同时修复已确认的日期加载竞态和 PDF 页数元数据问题，并为修复增加回归测试。

## 范围

### 编辑器按钮

验证以下工具栏行为均能修改编辑器文档或打开正确交互界面：

- 加粗、斜体、下划线、删除线、高亮。
- 标题 1、标题 2、标题 3。
- 无序列表、有序列表、任务列表、引用。
- 代码块及语言选择。
- Web 链接、文件链接。
- 本地图片、图片 URL。
- 插入表格。
- 表格上方插行、下方插行、左侧插列、右侧插列、删行、删列、删表。
- 撤销、重做。

测试应验证实际 DOM 或编辑器 HTML 变化，不能只验证按钮可点击。依赖原生文件对话框的入口使用 Tauri invoke 模拟验证参数，其余入口通过真实浏览器交互验证。

### 分享策略

覆盖分享弹窗中的四种策略：

- Markdown ZIP：验证保存对话框参数、`export_markdown_zip` 调用、Markdown 内容和图片负载。
- 富文本复制：验证剪贴板同时收到 `text/html` 与 `text/plain`，并验证待办内容包含在输出中。
- PDF：验证 `.pdf` 保存对话框参数、`export_pdf` 调用、结构化文档与图片字节负载；Rust 侧额外生成真实 PDF 并验证文件签名。
- PNG 图片：验证 `.png` 保存对话框参数、`write_binary_file` 调用和 PNG 文件签名。

取消保存对话框属于每种文件导出策略的共同边界：取消后不得调用后端导出命令，并应恢复按钮可用状态。

## 缺陷修复设计

### 日期加载竞态

根因是多个 `get_note` 请求可并行存在，较早日期的慢响应可能晚于当前日期响应并覆盖界面；此外初始化 effect 和日期 effect 会在首次渲染重复请求。

修复方式：只保留由 `currentDate` 驱动的加载 effect，并为每次加载生成递增请求标识。仅当响应标识仍是最新值且请求日期仍等于当前日期时，才更新 `note`、`content`、`todos` 和脏状态。回归测试通过可控 Promise 让旧请求后返回，验证旧内容不会覆盖新日期。

### PDF 页数元数据

当前原生导出固定返回 `pages: 1`，无法描述多页文档。由于 `genpdf` 的公开渲染接口不直接返回页数，写入成功后使用 `lopdf` 读取刚生成的 PDF 并返回真实页数。若页数读取失败，导出本身仍视为失败并返回明确错误，避免输出错误元数据。Rust 回归测试生成足够长的内容，验证文件签名和页数大于 1。

## 验证架构

新增专用验证脚本，以 Playwright 驱动 Vite 页面，并在页面启动前注入 Tauri IPC、保存对话框和剪贴板模拟。脚本按矩阵逐项执行，任何失败都记录名称、期望值、实际值和截图，不因单项失败丢失后续验证结果。

`agent-browser` 用于独立的可视化抽查：打开同一 Vite 页面，采集初始界面、工具栏交互后状态和分享弹窗截图，同时保存浏览器控制台及错误输出。

## 输出结构

```text
verify-output/
├── report.md
├── summary.json
├── editor-matrix.json
├── share-matrix.json
├── screenshots/
│   ├── editor-initial.png
│   ├── editor-formatted.png
│   ├── editor-table.png
│   └── share-modal.png
├── logs/
│   ├── frontend-tests.txt
│   ├── lint.txt
│   ├── build.txt
│   ├── rust-tests.txt
│   ├── gui-verification.txt
│   ├── agent-browser-console.txt
│   └── agent-browser-errors.txt
└── artifacts/
    ├── sample.md
    ├── sample.pdf
    └── sample.png
```

所有路径固定在 `verify-output/`，验证脚本每次运行覆盖同名汇总和日志，但不删除用户手工放入的其他文件。

## 成功标准

- 每一个编辑器按钮在矩阵中都有独立结果，且全部通过。
- Markdown ZIP、富文本复制、PDF、PNG 和取消导出边界均有独立结果，且全部通过。
- PDF 与 PNG 示例产物具有正确文件签名；PDF 页数与实际页数一致。
- 日期切换竞态回归测试通过。
- `npm test`、`npm run lint`、`npm run build` 和 Rust 验证全部退出码为 0。
- `verify-output/report.md` 汇总覆盖范围、结果、失败详情和产物链接。

## 非目标

- 不连接真实 SMTP 服务。
- 不操作系统原生打印对话框。
- 不验证远程图片服务器的稳定性；远程图片通过受控网络响应验证。
- 不重构与编辑、分享、日期加载无关的模块。
