import { EditorContent, useEditor } from "@tiptap/react";
import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
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
import { useEffect } from "react";
import type { SaveStatus } from "../hooks/useNoteSession";
import { EditorToolbar } from "./editor/EditorToolbar";
import { readImageAsDataUrl, validateImageFile } from "./editor/imageFiles";

const lowlight = createLowlight(common);

const CurrentTaskItem = Extension.create({
  name: "currentTaskItem",
  addProseMirrorPlugins() {
    return [new Plugin({
      props: {
        decorations(state) {
          const { $from } = state.selection;
          for (let depth = $from.depth; depth > 0; depth -= 1) {
            const node = $from.node(depth);
            if (node.type.name !== "taskItem") continue;
            const from = $from.before(depth);
            return DecorationSet.create(state.doc, [
              Decoration.node(from, from + node.nodeSize, { class: "is-current-task-item" }),
            ]);
          }
          return DecorationSet.empty;
        },
      },
    })];
  },
});

interface EditorProps {
  content: string;
  onChange: (html: string) => void;
  saveStatus: SaveStatus;
  onRetrySave: () => void;
}

export function Editor({ content, onChange, saveStatus, onRetrySave }: EditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false,
        link: false,
        underline: false,
        heading: { levels: [1, 2, 3, 4] },
      }),
      Underline,
      Highlight.configure({ multicolor: true }),
      Link.configure({
        openOnClick: false,
        protocols: ["http", "https", "file"],
        HTMLAttributes: { target: "_blank", rel: "noopener noreferrer" },
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      CurrentTaskItem,
      CodeBlockLowlight.configure({ lowlight, defaultLanguage: "plaintext" }),
      Image.configure({ inline: true, allowBase64: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      Placeholder.configure({
        includeChildren: true,
        placeholder: ({ editor: currentEditor, pos }) => (
          currentEditor.state.doc.resolve(pos).parent.type.name === "taskItem"
            ? "输入任务内容，按 Enter 新增下一项"
            : "开始记录今天的笔记…"
        ),
      }),
    ],
    content,
    editorProps: {
      attributes: { class: "prose-editor" },
      handlePaste: (view, event) => {
        const items = event.clipboardData?.items;
        if (!items) return false;
        for (const item of Array.from(items)) {
          if (!item.type.startsWith("image/")) continue;
          const file = item.getAsFile();
          if (!file || validateImageFile(file) !== null) continue;
          event.preventDefault();
          const pos = view.state.selection.from;
          void readImageAsDataUrl(file).then((src) => {
            const node = view.state.schema.nodes.image.create({ src });
            view.dispatch(view.state.tr.insert(pos, node));
          }).catch(() => undefined);
          return true;
        }
        return false;
      },
      handleDrop: (view, event) => {
        const files = event.dataTransfer?.files;
        if (!files?.length) return false;
        const imageFiles = Array.from(files).filter((file) => validateImageFile(file) !== "not-image");
        if (!imageFiles.length) return false;
        const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
        if (!coords) return false;
        event.preventDefault();
        let pos = coords.pos;
        async function processNext(index: number): Promise<void> {
          if (index >= imageFiles.length) return;
          const file = imageFiles[index];
          if (validateImageFile(file) !== null) return processNext(index + 1);
          try {
            const src = await readImageAsDataUrl(file);
            const node = view.state.schema.nodes.image.create({ src });
            view.dispatch(view.state.tr.insert(pos, node));
            pos += node.nodeSize;
          } catch {
            // Ignore unreadable images and continue with the remaining files.
          }
          await processNext(index + 1);
        }
        void processNext(0);
        return true;
      },
    },
    onUpdate: ({ editor: currentEditor }) => onChange(currentEditor.getHTML()),
  });

  useEffect(() => {
    if (editor && editor.getHTML() !== content) {
      editor.commands.setContent(content, { emitUpdate: false });
    }
  }, [content, editor]);

  if (!editor) return <div className="editor-loading">加载编辑器中…</div>;

  return (
    <div className="editor-wrapper">
      <EditorToolbar editor={editor} saveStatus={saveStatus} onRetrySave={onRetrySave} />
      <div className="editor-content"><EditorContent editor={editor} /></div>
      <style>{`
        .editor-wrapper { display:flex; flex-direction:column; height:100%; }
        .editor-content { flex:1; overflow-y:auto; padding:16px 24px; }
        .editor-content .ProseMirror { outline:none; min-height:100%; line-height:1.8; font-size:15px; }
        .editor-content .ProseMirror p.is-editor-empty:first-child::before { content:attr(data-placeholder); color:var(--text-muted); pointer-events:none; float:left; height:0; }
        .editor-content .ProseMirror h1 { font-size:1.6em; margin:.5em 0 .3em; }
        .editor-content .ProseMirror h2 { font-size:1.4em; margin:.5em 0 .3em; }
        .editor-content .ProseMirror h3 { font-size:1.2em; margin:.4em 0 .2em; }
        .editor-content .ProseMirror h4 { font-size:1.1em; margin:.3em 0 .2em; }
        .editor-content .ProseMirror p { margin:.3em 0; }
        .editor-content .ProseMirror ul,.editor-content .ProseMirror ol { padding-left:1.5em; margin:.3em 0; }
        .editor-content .ProseMirror li { margin:.1em 0; }
        .editor-content .ProseMirror blockquote { border-left:3px solid var(--accent); padding-left:12px; margin:.5em 0; color:var(--text-secondary); }
        .editor-content .ProseMirror pre { background:var(--bg-tertiary); color:var(--text-primary); border-radius:6px; padding:12px 16px; margin:.5em 0; font-family:var(--font-mono); font-size:13px; line-height:1.5; overflow-x:auto; position:relative; }
        .editor-content .ProseMirror pre code { color:inherit; background:none; padding:0; font-size:inherit; }
        .editor-content .ProseMirror code { background:var(--bg-tertiary); color:var(--danger); padding:2px 6px; border-radius:3px; font-family:var(--font-mono); font-size:.9em; }
        .editor-content .ProseMirror a { color:var(--accent); text-decoration:underline; cursor:pointer; }
        .editor-content .ProseMirror img { max-width:100%; height:auto; border-radius:4px; margin:.5em 0; }
        .editor-content .ProseMirror table { border-collapse:collapse; width:100%; margin:.5em 0; }
        .editor-content .ProseMirror th,.editor-content .ProseMirror td { border:1px solid var(--border-color); padding:6px 10px; text-align:left; }
        .editor-content .ProseMirror th { background:var(--bg-secondary); font-weight:600; }
        .editor-content .ProseMirror mark { --highlight-bg:#fff3cd; background:var(--highlight-bg); color:inherit; padding:0 2px; border-radius:2px; }
        [data-theme="dark"] .editor-content .ProseMirror mark { --highlight-bg:#5c4a00; }
        .editor-content .ProseMirror ul[data-type="taskList"] { list-style:none; margin:.5em 0; padding:8px 10px; border-left:3px solid var(--accent); border-radius:var(--radius-sm); background:var(--surface-inset); }
        .editor-content .ProseMirror ul[data-type="taskList"] > li { display:flex; align-items:flex-start; gap:8px; margin:4px 0; padding:4px 6px; border-radius:var(--radius-sm); transition:background var(--motion-fast) var(--ease-standard),box-shadow var(--motion-fast) var(--ease-standard); }
        .editor-content .ProseMirror ul[data-type="taskList"] > li.is-current-task-item,.editor-content .ProseMirror ul[data-type="taskList"] > li:focus-within { background:var(--surface-paper); box-shadow:0 0 0 2px var(--focus-ring); }
        .editor-content .ProseMirror ul[data-type="taskList"] > li > label { margin-top:2px; }
        .editor-content .ProseMirror ul[data-type="taskList"] input[type="checkbox"] { width:16px; height:16px; accent-color:var(--accent); }
        .editor-content .ProseMirror ul[data-type="taskList"] > li > div { flex:1; min-width:0; }
        .editor-content .ProseMirror ul[data-type="taskList"] > li > div > p { margin:0; }
        .editor-content .ProseMirror ul[data-type="taskList"] p.is-empty::before { content:attr(data-placeholder); float:left; height:0; color:var(--text-muted); pointer-events:none; }
        .editor-content .ProseMirror ul[data-type="taskList"] li[data-checked="true"] > div > p { text-decoration:line-through; color:var(--text-muted); }
        .editor-mode-status { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0; }
        .editor-content .ProseMirror hr { border:none; border-top:1px solid var(--border-color); margin:1em 0; }
        .editor-loading { display:flex; align-items:center; justify-content:center; height:100%; color:var(--text-muted); }
      `}</style>
    </div>
  );
}
