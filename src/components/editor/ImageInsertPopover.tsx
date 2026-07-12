import type { Editor } from "@tiptap/react";
import { useRef, type ChangeEvent } from "react";
import { readImageAsDataUrl, takeSelectedFile, validateImageFile } from "./imageFiles";

interface ImageInsertPopoverProps {
  editor: Editor;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ImageInsertPopover({ editor, open, onOpenChange }: ImageInsertPopoverProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const pickLocalImage = () => {
    onOpenChange(false);
    fileInputRef.current?.click();
  };

  const insertImageUrl = () => {
    onOpenChange(false);
    const url = window.prompt("请输入图片链接地址 (https://…):");
    if (url) editor.chain().focus().setImage({ src: url }).run();
  };

  const handleFileUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = takeSelectedFile(event.target);
    if (!file) return;
    const validationError = validateImageFile(file);
    if (validationError === "not-image") return;
    if (validationError === "too-large") {
      window.alert(`图片文件过大（${(file.size / 1024 / 1024).toFixed(1)}MB），请选择小于 10MB 的图片`);
      return;
    }
    void readImageAsDataUrl(file)
      .then((src) => editor.chain().focus().setImage({ src }).run())
      .catch(() => undefined);
  };

  return (
    <>
      <button
        type="button"
        className="toolbar-btn"
        onClick={() => onOpenChange(!open)}
        title="插入图片"
        data-toolbar-action="image"
      >
        🖼
      </button>
      {open && (
        <div className="lang-picker-dropdown">
          <button type="button" className="lang-option" onClick={pickLocalImage}>📁 本地文件…</button>
          <button type="button" className="lang-option" onClick={insertImageUrl}>🔗 图片链接…</button>
        </div>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={handleFileUpload}
      />
    </>
  );
}
