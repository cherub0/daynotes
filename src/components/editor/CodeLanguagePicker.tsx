import type { Editor } from "@tiptap/react";

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

interface CodeLanguagePickerProps {
  editor: Editor;
  onClose: () => void;
}

export function CodeLanguagePicker({ editor, onClose }: CodeLanguagePickerProps) {
  const selectLanguage = (language: string) => {
    const chain = editor.chain().focus();
    if (editor.isActive("codeBlock")) {
      chain.updateAttributes("codeBlock", { language }).run();
    } else {
      chain.setCodeBlock({ language }).run();
    }
    onClose();
  };

  return (
    <div className="lang-picker-dropdown">
      {LANGUAGES.map((language) => (
        <button
          type="button"
          key={language.value}
          className="lang-option"
          onClick={() => selectLanguage(language.value)}
        >
          {language.label}
        </button>
      ))}
    </div>
  );
}
