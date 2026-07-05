import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Highlight from "@tiptap/extension-highlight";
import Placeholder from "@tiptap/extension-placeholder";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import Image from "@tiptap/extension-image";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import { common, createLowlight } from "lowlight";
import { useEffect, useRef, useState } from "react";

const lowlight = createLowlight(common);

const LANGUAGES = [
  { label: "JavaScript", value: "javascript" },
  { label: "TypeScript", value: "typescript" },
  { label: "Python", value: "python" },
  { label: "Rust", value: "rust" },
  { label: "Java", value: "java" },
  { label: "C", value: "c" },
  { label: "C++", value: "cpp" },
  { label: "C#", value: "csharp" },
  { label: "Go", value: "go" },
  { label: "HTML", value: "html" },
  { label: "CSS", value: "css" },
  { label: "JSON", value: "json" },
  { label: "SQL", value: "sql" },
  { label: "Bash", value: "bash" },
  { label: "YAML", value: "yaml" },
  { label: "Markdown", value: "markdown" },
  { label: "纯文本", value: "plaintext" },
];

// 10MB limit for inline images to prevent base64 bloat in SQLite
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

interface EditorProps {
  content: string;
  onChange: (html: string) => void;
}

export function Editor({ content, onChange }: EditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false, // use lowlight version for syntax highlighting
        link: false,
        underline: false,
        heading: {
          levels: [1, 2, 3, 4],
        },
      }),
      Underline,
      Highlight.configure({ multicolor: true }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          target: "_blank",
          rel: "noopener noreferrer",
        },
      }),
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      CodeBlockLowlight.configure({
        lowlight,
        defaultLanguage: "plaintext",
      }),
      Image.configure({
        inline: true,
        allowBase64: true,
      }),
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableCell,
      TableHeader,
      Placeholder.configure({
        placeholder: "开始记录今天的笔记…",
      }),
    ],
    content,
    editorProps: {
      attributes: {
        class: "prose-editor",
      },
      handlePaste: (view, event) => {
        const items = event.clipboardData?.items;
        if (!items) return false;
        for (const item of Array.from(items)) {
          if (item.type.startsWith("image/")) {
            const file = item.getAsFile();
            if (file) {
              if (file.size > MAX_IMAGE_BYTES) continue;
              event.preventDefault();
              const pos = view.state.selection.from;
              const reader = new FileReader();
              reader.onload = (e) => {
                const src = e.target?.result as string;
                const node = view.state.schema.nodes.image.create({ src });
                view.dispatch(view.state.tr.insert(pos, node));
              };
              reader.readAsDataURL(file);
              return true;
            }
          }
        }
        return false;
      },
      handleDrop: (view, event) => {
        const files = event.dataTransfer?.files;
        if (!files || files.length === 0) return false;
        const imageFiles = Array.from(files).filter((f) => f.type.startsWith("image/"));
        if (imageFiles.length === 0) return false;
        const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
        if (!coords) return false;
        event.preventDefault();
        // Process images sequentially to maintain order and correct positions
        let pos = coords.pos;
        function processNext(index: number) {
          if (index >= imageFiles.length) return;
          const file = imageFiles[index];
          if (file.size > MAX_IMAGE_BYTES) {
            processNext(index + 1);
            return;
          }
          const reader = new FileReader();
          reader.onload = (e) => {
            const src = e.target?.result as string;
            const node = view.state.schema.nodes.image.create({ src });
            view.dispatch(view.state.tr.insert(pos, node));
            pos += node.nodeSize;
            processNext(index + 1);
          };
          reader.readAsDataURL(file);
        }
        processNext(0);
        return true;
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  // Sync content from parent (e.g. date change)
  useEffect(() => {
    if (editor && editor.getHTML() !== content) {
      editor.commands.setContent(content);
    }
  }, [content, editor]);

  // ── All hooks must be called before any conditional return ──

  const [showLangPicker, setShowLangPicker] = useState(false);
  const langPickerRef = useRef<HTMLDivElement>(null);

  // Close language picker on outside click
  useEffect(() => {
    if (!showLangPicker) return;
    const handleClick = (e: MouseEvent) => {
      if (langPickerRef.current && !langPickerRef.current.contains(e.target as Node)) {
        setShowLangPicker(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showLangPicker]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [showImagePicker, setShowImagePicker] = useState(false);
  const [showLinkPicker, setShowLinkPicker] = useState(false);
  const imagePickerRef = useRef<HTMLDivElement>(null);
  const linkPickerRef = useRef<HTMLDivElement>(null);

  // Close popups on outside click
  useEffect(() => {
    if (!showImagePicker && !showLinkPicker) return;
    const handleClick = (e: MouseEvent) => {
      if (imagePickerRef.current?.contains(e.target as Node)) return;
      if (linkPickerRef.current?.contains(e.target as Node)) return;
      setShowImagePicker(false);
      setShowLinkPicker(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showImagePicker, showLinkPicker]);

  if (!editor) {
    return <div className="editor-loading">加载编辑器中…</div>;
  }

  // ── Helper functions (safe: editor is guaranteed non-null here) ──

  const setCodeBlockLang = (lang: string) => {
    if (editor.isActive("codeBlock")) {
      editor.chain().focus().updateAttributes("codeBlock", { language: lang }).run();
    } else {
      editor.chain().focus().setCodeBlock({ language: lang }).run();
    }
    setShowLangPicker(false);
  };

  const addImage = () => {
    setShowImagePicker(!showImagePicker);
  };

  const pickLocalImage = () => {
    setShowImagePicker(false);
    fileInputRef.current?.click();
  };

  const insertImageUrl = () => {
    setShowImagePicker(false);
    const url = window.prompt("请输入图片链接地址 (https://…):");
    if (url) {
      editor.chain().focus().setImage({ src: url }).run();
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    if (file.size > MAX_IMAGE_BYTES) {
      window.alert(`图片文件过大（${(file.size / 1024 / 1024).toFixed(1)}MB），请选择小于 10MB 的图片`);
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const src = ev.target?.result as string;
      editor.chain().focus().setImage({ src }).run();
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const addLink = () => {
    setShowLinkPicker(!showLinkPicker);
  };

  const insertWebLink = () => {
    setShowLinkPicker(false);
    const url = window.prompt("请输入链接地址 (https://…):");
    if (url) {
      editor.chain().focus().setLink({ href: url }).run();
    }
  };

  const insertFileLink = async () => {
    setShowLinkPicker(false);
    try {
      // Use Tauri dialog plugin for full file path
      const { invoke } = await import("@tauri-apps/api/core");
      const selected = await invoke("plugin:dialog|open", {
        title: "选择文件",
        multiple: false,
      });
      if (selected && typeof selected === "string") {
        const name = selected.split(/[\\/]/).pop() || selected;
        editor
          .chain()
          .focus()
          .insertContent(name)
          .setLink({ href: `file:///${selected.replace(/\\/g, "/")}` })
          .run();
        return;
      }
    } catch {
      // Fallback: use hidden file input (no full path in webview)
    }
    const input = document.createElement("input");
    input.type = "file";
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) {
        editor.chain().focus().setLink({ href: `file:///${file.name}` }).run();
      }
    };
    input.click();
  };

  const addTable = () => {
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  };

  return (
    <div className="editor-wrapper">
      <div className="editor-toolbar">
        <div className="toolbar-group">
          <button
            className={`toolbar-btn ${editor.isActive("bold") ? "active" : ""}`}
            onClick={() => editor.chain().focus().toggleBold().run()}
            title="加粗 (Ctrl+B)"
          >
            <strong>B</strong>
          </button>
          <button
            className={`toolbar-btn ${editor.isActive("italic") ? "active" : ""}`}
            onClick={() => editor.chain().focus().toggleItalic().run()}
            title="斜体 (Ctrl+I)"
          >
            <em>I</em>
          </button>
          <button
            className={`toolbar-btn ${editor.isActive("underline") ? "active" : ""}`}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            title="下划线 (Ctrl+U)"
          >
            <span style={{ textDecoration: "underline" }}>U</span>
          </button>
          <button
            className={`toolbar-btn ${editor.isActive("strike") ? "active" : ""}`}
            onClick={() => editor.chain().focus().toggleStrike().run()}
            title="删除线"
          >
            <span style={{ textDecoration: "line-through" }}>S</span>
          </button>
          <button
            className={`toolbar-btn ${editor.isActive("highlight") ? "active" : ""}`}
            onClick={() => editor.chain().focus().toggleHighlight().run()}
            title="高亮"
          >
            <span style={{ background: "var(--accent-light)", padding: "0 3px" }}>H</span>
          </button>
        </div>

        <div className="toolbar-divider" />

        <div className="toolbar-group">
          <button
            className={`toolbar-btn ${editor.isActive("heading", { level: 1 }) ? "active" : ""}`}
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            title="标题1"
          >
            H1
          </button>
          <button
            className={`toolbar-btn ${editor.isActive("heading", { level: 2 }) ? "active" : ""}`}
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            title="标题2"
          >
            H2
          </button>
          <button
            className={`toolbar-btn ${editor.isActive("heading", { level: 3 }) ? "active" : ""}`}
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            title="标题3"
          >
            H3
          </button>
        </div>

        <div className="toolbar-divider" />

        <div className="toolbar-group">
          <button
            className={`toolbar-btn ${editor.isActive("bulletList") ? "active" : ""}`}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            title="无序列表"
          >
            ≡
          </button>
          <button
            className={`toolbar-btn ${editor.isActive("orderedList") ? "active" : ""}`}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            title="有序列表"
          >
            1.
          </button>
          <button
            className={`toolbar-btn ${editor.isActive("taskList") ? "active" : ""}`}
            onClick={() => editor.chain().focus().toggleTaskList().run()}
            title="任务列表"
          >
            ☑
          </button>
          <button
            className={`toolbar-btn ${editor.isActive("blockquote") ? "active" : ""}`}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            title="引用"
          >
            ❝
          </button>
          <div className="toolbar-lang-group" ref={langPickerRef}>
            <button
              className={`toolbar-btn ${editor.isActive("codeBlock") ? "active" : ""}`}
              onClick={() => setShowLangPicker(!showLangPicker)}
              title="代码块"
            >
              &lt;/&gt;
            </button>
            {showLangPicker && (
              <div className="lang-picker-dropdown">
                {LANGUAGES.map((lang) => (
                  <button
                    key={lang.value}
                    className="lang-option"
                    onClick={() => setCodeBlockLang(lang.value)}
                  >
                    {lang.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="toolbar-divider" />

        <div className="toolbar-group">
          <div className="toolbar-lang-group" ref={linkPickerRef}>
            <button
              className={`toolbar-btn ${editor.isActive("link") ? "active" : ""}`}
              onClick={addLink}
              title="插入链接"
            >
              🔗
            </button>
            {showLinkPicker && (
              <div className="lang-picker-dropdown">
                <button className="lang-option" onClick={insertWebLink}>
                  🌐 网页链接…
                </button>
                <button className="lang-option" onClick={insertFileLink}>
                  📁 本地文件…
                </button>
              </div>
            )}
          </div>
          <div className="toolbar-lang-group" ref={imagePickerRef}>
            <button className="toolbar-btn" onClick={addImage} title="插入图片">
              🖼
            </button>
            {showImagePicker && (
              <div className="lang-picker-dropdown">
                <button className="lang-option" onClick={pickLocalImage}>
                  📁 本地文件…
                </button>
                <button className="lang-option" onClick={insertImageUrl}>
                  🔗 图片链接…
                </button>
              </div>
            )}
          </div>
          <button className="toolbar-btn" onClick={addTable} title="插入表格">
            ⊞
          </button>
        </div>

        <div className="toolbar-divider" />

        <div className="toolbar-group">
          <button
            className="toolbar-btn"
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
            title="撤销 (Ctrl+Z)"
          >
            ↩
          </button>
          <button
            className="toolbar-btn"
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}
            title="重做 (Ctrl+Y)"
          >
            ↪
          </button>
        </div>
      </div>

      <div className="editor-content">
        <EditorContent editor={editor} />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={handleFileUpload}
        />
      </div>

      <style>{`
        .editor-wrapper {
          display: flex;
          flex-direction: column;
          height: 100%;
        }

        .editor-toolbar {
          display: flex;
          align-items: center;
          gap: 2px;
          padding: 6px 12px;
          background: var(--bg-secondary);
          border-bottom: 1px solid var(--border-color);
          flex-wrap: wrap;
          min-height: 40px;
        }

        .toolbar-group {
          display: flex;
          gap: 1px;
        }

        .toolbar-divider {
          width: 1px;
          height: 20px;
          background: var(--border-color);
          margin: 0 4px;
        }

        .toolbar-btn {
          width: 32px;
          height: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 3px;
          font-size: 13px;
          color: var(--text-secondary);
          transition: all 0.15s ease;
        }
        .toolbar-btn:hover {
          background: var(--bg-tertiary);
          color: var(--text-primary);
        }
        .toolbar-btn.active {
          background: var(--accent-light);
          color: var(--accent);
        }
        .toolbar-btn:disabled {
          opacity: 0.3;
          cursor: default;
        }

        .toolbar-lang-group {
          position: relative;
        }

        .lang-picker-dropdown {
          position: absolute;
          top: 100%;
          left: 0;
          z-index: 50;
          background: var(--bg-primary);
          border: 1px solid var(--border-color);
          border-radius: var(--radius);
          box-shadow: var(--shadow-lg);
          padding: 4px;
          min-width: 140px;
          max-height: 280px;
          overflow-y: auto;
          margin-top: 2px;
        }

        .lang-option {
          display: block;
          width: 100%;
          padding: 6px 12px;
          font-size: 12px;
          text-align: left;
          border-radius: var(--radius-sm);
          color: var(--text-primary);
        }
        .lang-option:hover {
          background: var(--bg-secondary);
        }

        .editor-content {
          flex: 1;
          overflow-y: auto;
          padding: 16px 24px;
        }

        .editor-content .ProseMirror {
          outline: none;
          min-height: 100%;
          line-height: 1.8;
          font-size: 15px;
        }

        .editor-content .ProseMirror p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          color: var(--text-muted);
          pointer-events: none;
          float: left;
          height: 0;
        }

        .editor-content .ProseMirror h1 { font-size: 1.6em; margin: 0.5em 0 0.3em; }
        .editor-content .ProseMirror h2 { font-size: 1.4em; margin: 0.5em 0 0.3em; }
        .editor-content .ProseMirror h3 { font-size: 1.2em; margin: 0.4em 0 0.2em; }
        .editor-content .ProseMirror h4 { font-size: 1.1em; margin: 0.3em 0 0.2em; }

        .editor-content .ProseMirror p { margin: 0.3em 0; }

        .editor-content .ProseMirror ul,
        .editor-content .ProseMirror ol {
          padding-left: 1.5em;
          margin: 0.3em 0;
        }

        .editor-content .ProseMirror li {
          margin: 0.1em 0;
        }

        .editor-content .ProseMirror blockquote {
          border-left: 3px solid var(--accent);
          padding-left: 12px;
          margin: 0.5em 0;
          color: var(--text-secondary);
        }

        .editor-content .ProseMirror pre {
          background: var(--bg-tertiary);
          color: var(--text-primary);
          border-radius: 6px;
          padding: 12px 16px;
          margin: 0.5em 0;
          font-family: var(--font-mono);
          font-size: 13px;
          line-height: 1.5;
          overflow-x: auto;
          position: relative;
        }

        .editor-content .ProseMirror pre code {
          color: inherit;
          background: none;
          padding: 0;
          font-size: inherit;
        }

        .editor-content .ProseMirror code {
          background: var(--bg-tertiary);
          color: var(--danger);
          padding: 2px 6px;
          border-radius: 3px;
          font-family: var(--font-mono);
          font-size: 0.9em;
        }

        .editor-content .ProseMirror a {
          color: var(--accent);
          text-decoration: underline;
          cursor: pointer;
        }

        .editor-content .ProseMirror img {
          max-width: 100%;
          height: auto;
          border-radius: 4px;
          margin: 0.5em 0;
        }

        .editor-content .ProseMirror table {
          border-collapse: collapse;
          width: 100%;
          margin: 0.5em 0;
        }

        .editor-content .ProseMirror th,
        .editor-content .ProseMirror td {
          border: 1px solid var(--border-color);
          padding: 6px 10px;
          text-align: left;
        }

        .editor-content .ProseMirror th {
          background: var(--bg-secondary);
          font-weight: 600;
        }

        .editor-content .ProseMirror mark {
          --highlight-bg: #fff3cd;
          background: var(--highlight-bg);
          color: inherit;
          padding: 0 2px;
          border-radius: 2px;
        }

        [data-theme="dark"] .editor-content .ProseMirror mark {
          --highlight-bg: #5c4a00;
        }

        .editor-content .ProseMirror ul[data-type="taskList"] {
          list-style: none;
          padding-left: 0;
        }

        .editor-content .ProseMirror ul[data-type="taskList"] li {
          display: flex;
          align-items: flex-start;
          gap: 8px;
        }

        .editor-content .ProseMirror ul[data-type="taskList"] li label {
          margin-top: 3px;
        }

        .editor-content .ProseMirror ul[data-type="taskList"] li[data-checked="true"] > div > p {
          text-decoration: line-through;
          color: var(--text-muted);
        }

        .editor-content .ProseMirror hr {
          border: none;
          border-top: 1px solid var(--border-color);
          margin: 1em 0;
        }

        .editor-loading {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: var(--text-muted);
        }
      `}</style>
    </div>
  );
}
