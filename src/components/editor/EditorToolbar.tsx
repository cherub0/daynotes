import type { Editor } from "@tiptap/react";
import { useEffect, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import type { SaveStatus } from "../../hooks/useNoteSession";
import { LinkEditor, type EditorRange } from "../LinkEditor";
import { SaveStatusIndicator } from "../SaveStatus";
import { TablePicker } from "../TablePicker";
import { IconButton } from "../ui/Button";
import { isElementVisible } from "../ui/focus";
import { MenuPopover } from "../ui/MenuPopover";
import { CodeLanguagePicker } from "./CodeLanguagePicker";
import { ImageInsertPopover } from "./ImageInsertPopover";

interface EditorToolbarProps {
  editor: Editor;
  saveStatus: SaveStatus;
  onRetrySave: () => void;
}

export function EditorToolbar({ editor, saveStatus, onRetrySave }: EditorToolbarProps) {
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [showImagePicker, setShowImagePicker] = useState(false);
  const [showLinkPicker, setShowLinkPicker] = useState(false);
  const [showLinkEditor, setShowLinkEditor] = useState(false);
  const [showTablePicker, setShowTablePicker] = useState(false);
  const [linkRange, setLinkRange] = useState<EditorRange>({ from: 0, to: 0 });
  const toolbarRef = useRef<HTMLDivElement>(null);
  const popoverLayerRef = useRef<HTMLDivElement>(null);
  const insertMenuTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const hasOpenPopover = showLangPicker || showImagePicker || showLinkPicker || showLinkEditor || showTablePicker;
    if (!hasOpenPopover) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (popoverLayerRef.current?.contains(event.target as Node)) return;
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
    let selector: string | null = null;
    if (showLangPicker) selector = ".lang-option";
    else if (showLinkPicker) selector = ".lang-option";
    else if (showLinkEditor) selector = ".link-editor input:not(:disabled)";
    else if (showImagePicker) selector = ".toolbar-detached-image .lang-option";
    else if (showTablePicker) selector = ".table-picker-cell";
    if (selector) popoverLayerRef.current?.querySelector<HTMLElement>(selector)?.focus();
  }, [showImagePicker, showLangPicker, showLinkEditor, showLinkPicker, showTablePicker]);

  useEffect(() => {
    const hasOpenPopover = showLangPicker || showImagePicker || showLinkPicker || showLinkEditor || showTablePicker;
    if (!hasOpenPopover) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setShowLangPicker(false);
      setShowImagePicker(false);
      setShowLinkPicker(false);
      setShowLinkEditor(false);
      setShowTablePicker(false);
      insertMenuTriggerRef.current?.focus();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [showImagePicker, showLangPicker, showLinkEditor, showLinkPicker, showTablePicker]);

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
    insertMenuTriggerRef.current?.focus();
  };

  const handleToolbarKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (!(event.target instanceof HTMLButtonElement) || event.target.closest("[role='menu']")) return;
    if (!(["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp", "Home", "End"] as string[]).includes(event.key)) return;

    const buttons = Array.from(
      toolbarRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [],
    ).filter(isElementVisible);
    if (buttons.length === 0) return;
    const currentIndex = buttons.indexOf(event.target);
    if (currentIndex < 0) return;
    event.preventDefault();
    if (event.key === "Home") buttons[0].focus();
    else if (event.key === "End") buttons[buttons.length - 1].focus();
    else if (event.key === "ArrowRight" || event.key === "ArrowDown") buttons[(currentIndex + 1) % buttons.length].focus();
    else buttons[(currentIndex - 1 + buttons.length) % buttons.length].focus();
  };

  return (
    <>
      <div ref={toolbarRef} className="editor-toolbar" role="toolbar" aria-label="编辑工具栏" aria-orientation="horizontal" onKeyDown={handleToolbarKeyDown}>
        <div className="toolbar-group" role="group" aria-label="文字格式">
          <span className="toolbar-group-label">文字</span>
          <IconButton label="加粗 (Ctrl+B)" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}><strong>B</strong></IconButton>
          <IconButton label="斜体 (Ctrl+I)" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}><em>I</em></IconButton>
          <IconButton label="下划线 (Ctrl+U)" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}><u>U</u></IconButton>
          <IconButton label="高亮" active={editor.isActive("highlight")} onClick={() => editor.chain().focus().toggleHighlight().run()}>H</IconButton>
          <IconButton className="toolbar-wide-action" label="删除线" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}><s>S</s></IconButton>
        </div>

        <div className="toolbar-group" role="group" aria-label="段落结构">
          <span className="toolbar-group-label">段落</span>
          <IconButton label="标题1" active={editor.isActive("heading", { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>H1</IconButton>
          <IconButton className="toolbar-wide-action" label="标题2" active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>H2</IconButton>
          <IconButton className="toolbar-wide-action" label="标题3" active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>H3</IconButton>
          <IconButton label="无序列表" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>≡</IconButton>
          <IconButton label="有序列表" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>1.</IconButton>
          <IconButton label="任务列表" active={editor.isActive("taskList")} onClick={() => editor.chain().focus().toggleTaskList().run()}>☑</IconButton>
          <IconButton className="toolbar-wide-action" label="引用" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}>❝</IconButton>
          <IconButton className="toolbar-wide-action" label="插入分隔线" onClick={() => editor.chain().focus().setHorizontalRule().run()}>―</IconButton>
        </div>

        <MenuPopover label="插入内容" triggerContent="＋" triggerRef={insertMenuTriggerRef} active={showLangPicker || showImagePicker || showLinkPicker || showLinkEditor || showTablePicker}>
          <button type="button" className="ui-button ui-button--subtle toolbar-compact-action" role="menuitemcheckbox" aria-checked={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}>删除线</button>
          <button type="button" className="ui-button ui-button--subtle toolbar-compact-action" role="menuitemradio" aria-checked={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>标题2</button>
          <button type="button" className="ui-button ui-button--subtle toolbar-compact-action" role="menuitemradio" aria-checked={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>标题3</button>
          <button type="button" className="ui-button ui-button--subtle toolbar-compact-action" role="menuitemcheckbox" aria-checked={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}>引用</button>
          <button type="button" className="ui-button ui-button--subtle toolbar-compact-action" role="menuitem" onClick={() => editor.chain().focus().setHorizontalRule().run()}>插入分隔线</button>
          <button type="button" className="ui-button ui-button--subtle" role="menuitemcheckbox" aria-checked={editor.isActive("codeBlock")} onClick={() => setShowLangPicker(true)}>代码块</button>
          <button type="button" className="ui-button ui-button--subtle" role="menuitemcheckbox" aria-checked={editor.isActive("link")} data-toolbar-action="link" onClick={() => setShowLinkPicker(true)}>插入链接</button>
          <button type="button" className="ui-button ui-button--subtle" role="menuitem" onClick={() => setShowImagePicker(true)}>插入图片</button>
          <button type="button" className="ui-button ui-button--subtle" role="menuitem" data-toolbar-action="table" onClick={() => setShowTablePicker(true)}>插入表格</button>
        </MenuPopover>

        {editor.isActive("table") && (
          <div className="toolbar-group table-actions" role="group" aria-label="表格操作">
            <span className="toolbar-group-label">表格</span>
            <IconButton label="在上方插入行" onClick={() => editor.chain().focus().addRowBefore().run()} disabled={!editor.can().chain().focus().addRowBefore().run()}>行↑</IconButton>
            <IconButton label="在下方插入行" onClick={() => editor.chain().focus().addRowAfter().run()} disabled={!editor.can().chain().focus().addRowAfter().run()}>行↓</IconButton>
            <IconButton label="在左侧插入列" onClick={() => editor.chain().focus().addColumnBefore().run()} disabled={!editor.can().chain().focus().addColumnBefore().run()}>列←</IconButton>
            <IconButton label="在右侧插入列" onClick={() => editor.chain().focus().addColumnAfter().run()} disabled={!editor.can().chain().focus().addColumnAfter().run()}>列→</IconButton>
            <IconButton label="删除当前行" onClick={() => editor.chain().focus().deleteRow().run()} disabled={!editor.can().chain().focus().deleteRow().run()}>删行</IconButton>
            <IconButton label="删除当前列" onClick={() => editor.chain().focus().deleteColumn().run()} disabled={!editor.can().chain().focus().deleteColumn().run()}>删列</IconButton>
            <IconButton label="删除表格" onClick={() => editor.chain().focus().deleteTable().run()}>删表</IconButton>
          </div>
        )}

        <div className="toolbar-group toolbar-history" role="group" aria-label="历史操作">
          <span className="toolbar-group-label">历史</span>
          <IconButton label="撤销 (Ctrl+Z)" disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()}>↩</IconButton>
          <IconButton label="重做 (Ctrl+Y)" disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()}>↪</IconButton>
        </div>
        <SaveStatusIndicator status={saveStatus} onRetry={onRetrySave} />
      </div>

      <div ref={popoverLayerRef} className="toolbar-popover-layer">
        {showLangPicker && <CodeLanguagePicker editor={editor} onClose={() => setShowLangPicker(false)} />}
        {showLinkPicker && (
          <div className="lang-picker-dropdown">
            <button type="button" className="lang-option" onClick={insertWebLink}>🌐 网页链接…</button>
            <button type="button" className="lang-option" onClick={insertFileLink}>📁 本地文件…</button>
          </div>
        )}
        {showLinkEditor && <LinkEditor editor={editor} initialRange={linkRange} onClose={() => setShowLinkEditor(false)} />}
        <div className="toolbar-detached-image">
          <ImageInsertPopover editor={editor} open={showImagePicker} onOpenChange={setShowImagePicker} />
        </div>
        {showTablePicker && <TablePicker maxRows={20} maxCols={20} onSelect={addTable} onClose={() => setShowTablePicker(false)} />}
      </div>
    </>
  );
}
