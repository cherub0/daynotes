import type { ReactNode } from "react";
import type { ExportCollection, ExportDocument, ExportInline } from "../lib/exportDocument";
import { formatDateDisplay } from "../lib/types";

interface ExportPreviewProps {
  document?: ExportDocument;
  collection?: ExportCollection;
  previewRef?: React.Ref<HTMLDivElement>;
}

function InlineContent({ content }: { content: ExportInline[] }) {
  return content.map((run, index) => {
    let node: ReactNode = run.text;
    if (run.code) node = <code>{node}</code>;
    if (run.bold) node = <strong>{node}</strong>;
    if (run.italic) node = <em>{node}</em>;
    if (run.strike) node = <del>{node}</del>;
    if (run.underline) node = <u>{node}</u>;
    if (run.highlight) node = <mark>{node}</mark>;
    if (run.href) node = <a href={run.href}>{node}</a>;
    return <span key={index}>{node}</span>;
  });
}

function DocumentBody({ document }: { document: ExportDocument }) {
  const images = new Map(document.images.map((image) => [image.id, image]));
  return (
    <>
      {document.blocks.map((block, index) => {
        switch (block.kind) {
          case "heading": {
            const children = <InlineContent content={block.content} />;
            if (block.level === 1) return <h1 key={index}>{children}</h1>;
            if (block.level === 2) return <h2 key={index}>{children}</h2>;
            if (block.level === 3) return <h3 key={index}>{children}</h3>;
            return <h4 key={index}>{children}</h4>;
          }
          case "paragraph": return <p key={index}><InlineContent content={block.content} /></p>;
          case "quote": return <blockquote key={index}><InlineContent content={block.content} /></blockquote>;
          case "code": return <pre key={index}><code className={block.language ? `language-${block.language}` : undefined}>{block.text}</code></pre>;
          case "rule": return <hr key={index} />;
          case "list": {
            const items = block.items.map((item, itemIndex) => <li key={itemIndex}><InlineContent content={item} /></li>);
            return block.ordered ? <ol key={index}>{items}</ol> : <ul key={index}>{items}</ul>;
          }
          case "tasklist": return (
            <ul key={index} className="export-task-list">{block.items.map((item, itemIndex) => (
              <li key={itemIndex} className={item.checked ? "done" : ""}>{item.checked ? "☑" : "☐"} <InlineContent content={item.content} /></li>
            ))}</ul>
          );
          case "table": return (
            <table key={index}><tbody>{block.rows.map((row, rowIndex) => (
              <tr key={rowIndex}>{row.map((cell, cellIndex) => block.header && rowIndex === 0
                ? <th key={cellIndex}><InlineContent content={cell} /></th>
                : <td key={cellIndex}><InlineContent content={cell} /></td>)}</tr>
            ))}</tbody></table>
          );
          case "image": {
            const image = images.get(block.imageId);
            return image ? <img key={index} src={image.source} alt={block.alt || image.alt} /> : null;
          }
          case "todos": return (
            <section key={index}><h2>待办清单</h2><ul className="export-todos">{block.items.map((item) => (
              <li key={item.id} className={item.done ? "done" : ""}>{item.done ? "☑" : "☐"} {item.text}{item.date || item.time ? `（截止：${[item.date, item.time].filter(Boolean).join(" ")}）` : ""}</li>
            ))}</ul></section>
          );
        }
      })}
    </>
  );
}

export function ExportPreview({ document, collection, previewRef }: ExportPreviewProps) {
  const documents = collection?.documents ?? (document ? [document] : []);
  const displayDate = collection
    ? collection.startDate === collection.endDate
      ? formatDateDisplay(collection.startDate)
      : `${collection.startDate} — ${collection.endDate}`
    : document
      ? formatDateDisplay(document.date)
      : "";
  return (
    <div className="export-document" ref={previewRef}>
      <div className="export-header">
        <div className="export-header-brand">📝 DayNotes</div>
        <div className="export-header-date">{displayDate}</div>
      </div>
      <div className="export-body">
        {documents.map((item) => (
          <section className="export-day" data-date={item.date} key={item.date}>
            {collection && <h1 className="export-day-date">{formatDateDisplay(item.date)}</h1>}
            <DocumentBody document={item} />
          </section>
        ))}
      </div>
      <div className="export-footer">由 DayNotes 生成</div>
    </div>
  );
}
