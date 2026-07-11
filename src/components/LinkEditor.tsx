import type { Editor } from "@tiptap/react";
import { useState } from "react";
import { normalizeWebUrl } from "../lib/linkUtils";

export interface EditorRange {
  from: number;
  to: number;
}

interface LinkEditorProps {
  editor: Editor;
  initialRange: EditorRange;
  onClose: () => void;
}

export function LinkEditor({ editor, initialRange, onClose }: LinkEditorProps) {
  const existingHref = editor.getAttributes("link").href as string | undefined;
  const selectedText = editor.state.doc.textBetween(initialRange.from, initialRange.to, " ");
  const [label, setLabel] = useState(selectedText);
  const [url, setUrl] = useState(existingHref || "");
  const [error, setError] = useState("");

  const applyLink = () => {
    const href = normalizeWebUrl(url);
    if (!href) {
      setError("请输入有效的 HTTP 或 HTTPS 链接");
      return;
    }
    const chain = editor.chain().focus().setTextSelection(initialRange);
    if (initialRange.from !== initialRange.to) {
      chain.setLink({ href }).run();
    } else {
      const visibleText = label.trim() || href;
      const mark = editor.schema.marks.link.create({ href });
      chain.insertContent(editor.schema.text(visibleText, [mark]).toJSON()).run();
    }
    onClose();
  };

  const removeLink = () => {
    editor.chain().focus().setTextSelection(initialRange).extendMarkRange("link").unsetLink().run();
    onClose();
  };

  return (
    <div className="link-editor" role="dialog" aria-label="编辑链接">
      <label>
        显示文字
        <input value={label} onChange={(event) => setLabel(event.target.value)} disabled={initialRange.from !== initialRange.to} />
      </label>
      <label>
        链接地址
        <input value={url} onChange={(event) => { setUrl(event.target.value); setError(""); }} placeholder="https://example.com" autoFocus />
      </label>
      {error && <div className="link-editor-error">{error}</div>}
      <div className="link-editor-actions">
        {existingHref && <button type="button" onClick={removeLink}>取消链接</button>}
        <button type="button" onClick={onClose}>取消</button>
        <button type="button" onClick={applyLink}>确定</button>
      </div>
    </div>
  );
}
