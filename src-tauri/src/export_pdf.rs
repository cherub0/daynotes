use serde::{Deserialize, Serialize};
use std::path::PathBuf;

// ── Frontend types ──

#[derive(Debug, Deserialize)]
pub struct PdfExportDocument { pub date: String, pub blocks: Vec<PdfExportBlock> }

#[derive(Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum PdfExportBlock {
    Heading { level: u8, content: Vec<PdfInline> },
    Paragraph { content: Vec<PdfInline> },
    List { ordered: bool, items: Vec<Vec<PdfInline>> },
    Quote { content: Vec<PdfInline> },
    Code { language: String, text: String },
    Table { rows: Vec<Vec<String>>, header: bool },
    Rule,
    Image { #[serde(rename = "imageId")] image_id: String, alt: String },
    Todos { items: Vec<PdfTodo> },
}

#[derive(Debug, Deserialize, Clone)]
pub struct PdfInline {
    pub text: String,
    #[serde(default)] pub bold: bool,
    #[serde(default)] pub italic: bool,
    #[serde(default)] pub code: bool,
    #[serde(default)] pub href: Option<String>,
    #[serde(default)] pub underline: bool,
    #[serde(default)] pub strike: bool,
    #[serde(default)] pub highlight: bool,
}

#[derive(Debug, Deserialize)]
pub struct PdfTodo { pub text: String, pub done: bool, pub time: Option<String> }
#[derive(Debug, Deserialize)]
pub struct PdfImagePayload { pub id: String, pub bytes: Vec<u8>, pub width: f32, pub height: f32 }
#[derive(Debug, Serialize)]
pub struct PdfExportResult { pub path: String, pub pages: usize, pub orientation: String }

fn flatten(content: &[PdfInline]) -> String {
    content.iter().map(|r| {
        let mut v = r.text.clone();
        if !r.href.as_ref().map_or(true, |h| v == *h) {
            if let Some(ref href) = r.href { v = format!("{v} ({href})"); }
        }
        v
    }).collect()
}

fn find_font() -> Result<Vec<u8>, String> {
    [r"C:\Windows\Fonts\simhei.ttf", r"C:\Windows\Fonts\msyh.ttc", r"C:\Windows\Fonts\msyh.ttf"]
        .iter().find_map(|p| std::fs::read(p).ok())
        .ok_or_else(|| "未找到中文字体".to_string())
}

#[tauri::command]
pub fn export_pdf(path: String, document: PdfExportDocument, _images: Vec<PdfImagePayload>) -> Result<PdfExportResult, String> {
    use genpdf::{Document, SimplePageDecorator, Element as _};
    use genpdf::elements::{Paragraph, Break};
    use genpdf::fonts;

    let font_bytes = find_font()?;
    let family = fonts::FontFamily {
        regular: fonts::FontData::new(font_bytes.clone(), None).map_err(|e| format!("{e}"))?,
        bold: fonts::FontData::new(font_bytes.clone(), None).map_err(|e| format!("{e}"))?,
        italic: fonts::FontData::new(font_bytes.clone(), None).map_err(|e| format!("{e}"))?,
        bold_italic: fonts::FontData::new(font_bytes, None).map_err(|e| format!("{e}"))?,
    };

    let mut doc = Document::new(family);
    doc.set_title(&format!("DayNotes {}", document.date));

    // Page margin
    let mut dec = SimplePageDecorator::new();
    dec.set_margins(15);
    doc.set_page_decorator(dec);

    // Date heading
    doc.push(Paragraph::new(document.date.clone()));

    for block in &document.blocks {
        match block {
            PdfExportBlock::Heading { level, content } => {
                let prefix = match level { 1 => "# ", 2 => "## ", 3 => "### ", _ => "#### " };
                doc.push(Break::new(2));
                doc.push(Paragraph::new(format!("{prefix}{}", flatten(content))));
            }
            PdfExportBlock::Paragraph { content } => {
                doc.push(Break::new(1));
                doc.push(Paragraph::new(flatten(content)));
            }
            PdfExportBlock::Quote { content } => {
                doc.push(Break::new(2));
                doc.push(Paragraph::new(format!("│ {}", flatten(content))));
            }
            PdfExportBlock::Code { language: _, text } => {
                doc.push(Break::new(1));
                for line in text.lines() {
                    doc.push(Paragraph::new(format!("  {line}")));
                }
            }
            PdfExportBlock::List { ordered, items } => {
                doc.push(Break::new(1));
                for (i, item) in items.iter().enumerate() {
                    let prefix = if *ordered { format!("{}. ", i + 1) } else { "• ".to_string() };
                    doc.push(Paragraph::new(format!("{prefix}{}", flatten(item))));
                }
            }
            PdfExportBlock::Table { rows, header: _ } => {
                doc.push(Break::new(2));
                for row in rows {
                    doc.push(Paragraph::new(row.join("  │  ")));
                }
                doc.push(Paragraph::new("─".repeat(40)));
            }
            PdfExportBlock::Rule => {
                doc.push(Break::new(2));
                doc.push(Paragraph::new("─".repeat(60)));
            }
            PdfExportBlock::Image { image_id: _, alt } => {
                doc.push(Break::new(1));
                doc.push(Paragraph::new(format!("[图片：{alt}]")));
            }
            PdfExportBlock::Todos { items } => {
                doc.push(Break::new(3));
                doc.push(Paragraph::new("待办清单："));
                for item in items {
                    let mark = if item.done { "☑" } else { "☐" };
                    let time = item.time.as_ref().map(|t| format!(" @ {t}")).unwrap_or_default();
                    doc.push(Paragraph::new(format!("  {mark} {}{time}", item.text)));
                }
            }
        }
    }

    let target = PathBuf::from(&path);
    let temp = target.with_file_name(format!(".{}.tmp", target.file_name().and_then(|n| n.to_str()).unwrap_or("daynotes.pdf")));
    doc.render_to_file(&temp).map_err(|e| format!("PDF渲染失败：{e}"))?;
    std::fs::rename(&temp, &target).map_err(|e| format!("保存失败：{e}"))?;

    Ok(PdfExportResult { path, pages: 1, orientation: "portrait".into() })
}
