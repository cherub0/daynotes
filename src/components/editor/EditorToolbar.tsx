import type { Editor } from "@tiptap/react";
import { useEffect, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { LinkEditor, type EditorRange } from "../LinkEditor";
import { TablePicker } from "../TablePicker";
import { CodeLanguagePicker } from "./CodeLanguagePicker";
import { ImageInsertPopover } from "./ImageInsertPopover";

interface EditorToolbarProps {
  editor: Editor;
}

export function EditorToolbar({ editor }: EditorToolbarProps) {
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [showImagePicker, setShowImagePicker] = useState(false);
  const [showLinkPicker, setShowLinkPicker] = useState(false);
  const [showLinkEditor, setShowLinkEditor] = useState(false);
  const [showTablePicker, setShowTablePicker] = useState(false);
  const [linkRange, setLinkRange] = useState<EditorRange>({ from: 0, to: 0 });
  const langPickerRef = useRef<HTMLDivElement>(null);
  const imagePickerRef = useRef<HTMLDivElement>(null);
  const linkPickerRef = useRef<HTMLDivElement>(null);
  const tablePickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const hasOpenPopover = showLangPicker || showImagePicker || showLinkPicker || showLinkEditor || showTablePicker;
    if (!hasOpenPopover) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (langPickerRef.current?.contains(target)) return;
      if (imagePickerRef.current?.contains(target)) return;
      if (linkPickerRef.current?.contains(target)) return;
      if (tablePickerRef.current?.contains(target)) return;
      setShowLangPicker(false);
      setShowImagePicker(false);
      setShowLinkPicker(false);
      setShowLinkEditor(false);
      setShowTablePicker(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [showImagePicker, showLangPicker, showLinkEditor, showLinkPicker, showTablePicker]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setShowLangPicker(false);
      setShowImagePicker(false);
      setShowLinkPicker(false);
      setShowLinkEditor(false);
      setShowTablePicker(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, []);

  const insertWebLink = () => {
    setLinkRange({ from: editor.state.selection.from, to: editor.state.selection.to });
    setShowLinkPicker(false);
    setShowLinkEditor(true);
  };

  const insertFileLink = async () => {
    setShowLinkPicker(false);
    try {
      const selected = await open({ title: "选择文件", multiple: false });
      if (selected && typeof selected === "string") {
        const name = selected.split(/[\\/]/).pop() || selected;
        const normalized = selected.replace(/\\/g, "/");
        const encoded = normalized.split("/").map((part, index) => index === 0 ? part : encodeURIComponent(part)).join("/");
        const mark = editor.schema.marks.link.create({ href: `file:///${encoded}` });
        editor.chain().focus().insertContent(editor.schema.text(name, [mark]).toJSON()).run();
      }
    } catch (error) {
      window.alert(`无法选择本地文件：${String(error)}`);
    }
  };

  const addTable = (rows: number, cols: number) => {
    editor.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run();
    setShowTablePicker(false);
  };

  return (
    <div className="editor-toolbar">
      <div className="toolbar-group">
        <button className={`toolbar-btn ${editor.isActive("bold") ? "active" : ""}`} onClick={() => editor.chain().focus().toggleBold().run()} title="加粗 (Ctrl+B)"><strong>B</strong></button>
        <button className={`toolbar-btn ${editor.isActive("italic") ? "active" : ""}`} onClick={() => editor.chain().focus().toggleItalic().run()} title="斜体 (Ctrl+I)"><em>I</em></button>
        <button className={`toolbar-btn ${editor.isActive("underline") ? "active" : ""}`} onClick={() => editor.chain().focus().toggleUnderline().run()} title="下划线 (Ctrl+U)"><span style={{ textDecoration: "underline" }}>U</span></button>
        <button className={`toolbar-btn ${editor.isActive("strike") ? "active" : ""}`} onClick={() => editor.chain().focus().toggleStrike().run()} title="删除线"><span style={{ textDecoration: "line-through" }}>S</span></button>
        <button className={`toolbar-btn ${editor.isActive("highlight") ? "active" : ""}`} onClick={() => editor.chain().focus().toggleHighlight().run()} title="高亮"><span style={{ background: "var(--accent-light)", padding: "0 3px" }}>H</span></button>
      </div>
      <div className="toolbar-divider" />
      <div className="toolbar-group">
        {[1, 2, 3].map((level) => (
          <button key={level} className={`toolbar-btn ${editor.isActive("heading", { level }) ? "active" : ""}`} onClick={() => editor.chain().focus().toggleHeading({ level: level as 1 | 2 | 3 }).run()} title={`标题${level}`}>H{level}</button>
        ))}
      </div>
      <div className="toolbar-divider" />
      <div className="toolbar-group">
        <button className={`toolbar-btn ${editor.isActive("bulletList") ? "active" : ""}`} onClick={() => editor.chain().focus().toggleBulletList().run()} title="无序列表">≡</button>
        <button className={`toolbar-btn ${editor.isActive("orderedList") ? "active" : ""}`} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="有序列表">1.</button>
        <button className={`toolbar-btn ${editor.isActive("taskList") ? "active" : ""}`} onClick={() => editor.chain().focus().toggleTaskList().run()} title="任务列表">☑</button>
        <button className={`toolbar-btn ${editor.isActive("blockquote") ? "active" : ""}`} onClick={() => editor.chain().focus().toggleBlockquote().run()} title="引用">❝</button>
        <button className="toolbar-btn" onClick={() => editor.chain().focus().setHorizontalRule().run()} title="水平分割线">―</button>
        <div className="toolbar-lang-group" ref={langPickerRef}>
          <button className={`toolbar-btn ${editor.isActive("codeBlock") ? "active" : ""}`} onClick={() => setShowLangPicker((value) => !value)} title="代码块">&lt;/&gt;</button>
          {showLangPicker && <CodeLanguagePicker editor={editor} onClose={() => setShowLangPicker(false)} />}
        </div>
      </div>
      <div className="toolbar-divider" />
      <div className="toolbar-group">
        <div className="toolbar-lang-group" ref={linkPickerRef}>
          <button className={`toolbar-btn ${editor.isActive("link") ? "active" : ""}`} onClick={() => setShowLinkPicker((value) => !value)} title="插入链接" data-toolbar-action="link">🔗</button>
          {showLinkPicker && <div className="lang-picker-dropdown"><button className="lang-option" onClick={insertWebLink}>🌐 网页链接…</button><button className="lang-option" onClick={insertFileLink}>📁 本地文件…</button></div>}
          {showLinkEditor && <LinkEditor editor={editor} initialRange={linkRange} onClose={() => setShowLinkEditor(false)} />}
        </div>
        <div className="toolbar-lang-group" ref={imagePickerRef}>
          <ImageInsertPopover editor={editor} open={showImagePicker} onOpenChange={setShowImagePicker} />
        </div>
        <div className="toolbar-lang-group" ref={tablePickerRef}>
          <button className="toolbar-btn" onClick={() => setShowTablePicker((value) => !value)} title="插入表格" data-toolbar-action="table">⊞</button>
          {showTablePicker && <TablePicker maxRows={20} maxCols={20} onSelect={addTable} onClose={() => setShowTablePicker(false)} />}
        </div>
      </div>
      {editor.isActive("table") && <><div className="toolbar-divider" /><div className="toolbar-group table-actions">
        <button className="toolbar-btn" onClick={() => editor.chain().focus().addRowBefore().run()} disabled={!editor.can().chain().focus().addRowBefore().run()} title="在上方插入行">行↑</button>
        <button className="toolbar-btn" onClick={() => editor.chain().focus().addRowAfter().run()} disabled={!editor.can().chain().focus().addRowAfter().run()} title="在下方插入行">行↓</button>
        <button className="toolbar-btn" onClick={() => editor.chain().focus().addColumnBefore().run()} disabled={!editor.can().chain().focus().addColumnBefore().run()} title="在左侧插入列">列←</button>
        <button className="toolbar-btn" onClick={() => editor.chain().focus().addColumnAfter().run()} disabled={!editor.can().chain().focus().addColumnAfter().run()} title="在右侧插入列">列→</button>
        <button className="toolbar-btn" onClick={() => editor.chain().focus().deleteRow().run()} disabled={!editor.can().chain().focus().deleteRow().run()} title="删除当前行">删行</button>
        <button className="toolbar-btn" onClick={() => editor.chain().focus().deleteColumn().run()} disabled={!editor.can().chain().focus().deleteColumn().run()} title="删除当前列">删列</button>
        <button className="toolbar-btn" onClick={() => editor.chain().focus().deleteTable().run()} title="删除表格">删表</button>
      </div></>}
      <div className="toolbar-divider" />
      <div className="toolbar-group">
        <button className="toolbar-btn" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} title="撤销 (Ctrl+Z)">↩</button>
        <button className="toolbar-btn" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} title="重做 (Ctrl+Y)">↪</button>
      </div>
      <style>{`
        .editor-toolbar { display:flex; align-items:center; gap:2px; padding:6px 12px; background:var(--bg-secondary); border-bottom:1px solid var(--border-color); flex-wrap:wrap; min-height:40px; }
        .toolbar-group { display:flex; gap:1px; }
        .toolbar-divider { width:1px; height:20px; background:var(--border-color); margin:0 4px; }
        .toolbar-btn { width:32px; height:28px; display:flex; align-items:center; justify-content:center; border-radius:3px; font-size:13px; color:var(--text-secondary); transition:all .15s ease; }
        .toolbar-btn:hover { background:var(--bg-tertiary); color:var(--text-primary); }
        .toolbar-btn.active { background:var(--accent-light); color:var(--accent); }
        .toolbar-btn:disabled { opacity:.3; cursor:default; }
        .toolbar-lang-group { position:relative; }
        .table-picker,.link-editor { position:absolute; top:calc(100% + 6px); left:0; z-index:30; padding:10px; border:1px solid var(--border-color); border-radius:8px; background:var(--bg-primary); box-shadow:0 8px 24px rgba(0,0,0,.18); }
        .table-picker-size { margin-bottom:8px; color:var(--text-secondary); font-size:12px; text-align:center; }
        .table-picker-grid { display:grid; gap:2px; max-width:360px; max-height:360px; overflow:auto; }
        .table-picker-cell { width:16px; height:16px; padding:0; border:1px solid var(--border-color); border-radius:2px; background:var(--bg-secondary); }
        .table-picker-cell.highlighted { border-color:var(--accent); background:var(--accent-light); }
        .link-editor { width:300px; }
        .link-editor label { display:grid; gap:4px; margin-bottom:8px; color:var(--text-secondary); font-size:12px; }
        .link-editor input { width:100%; box-sizing:border-box; padding:7px 8px; border:1px solid var(--border-color); border-radius:6px; background:var(--bg-secondary); color:var(--text-primary); }
        .link-editor-error { color:var(--danger); font-size:12px; }
        .link-editor-actions { display:flex; justify-content:flex-end; gap:6px; margin-top:10px; }
        .link-editor-actions button { padding:5px 9px; }
        .lang-picker-dropdown { position:absolute; top:100%; left:0; z-index:50; background:var(--bg-primary); border:1px solid var(--border-color); border-radius:var(--radius); box-shadow:var(--shadow-lg); padding:4px; min-width:140px; max-height:280px; overflow-y:auto; margin-top:2px; }
        .lang-option { display:block; width:100%; padding:6px 12px; font-size:12px; text-align:left; border-radius:var(--radius-sm); color:var(--text-primary); }
        .lang-option:hover { background:var(--bg-secondary); }
      `}</style>
    </div>
  );
}
