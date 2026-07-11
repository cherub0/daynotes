use serde::{Deserialize, Serialize};
use printpdf::{Mm, Op, ParsedFont, PdfDocument, PdfFontHandle, PdfPage, PdfSaveOptions, PdfWarnMsg, Point, Pt, RawImage, TextItem, XObjectTransform};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Orientation { Portrait, Landscape }

#[derive(Debug, Clone, Copy)]
pub struct DocumentMetrics {
    pub natural_width: f32,
    pub widest_image_ratio: f32,
}

pub fn choose_orientation(metrics: &DocumentMetrics) -> Orientation {
    if metrics.natural_width > 720.0 || metrics.widest_image_ratio > 1.55 {
        Orientation::Landscape
    } else {
        Orientation::Portrait
    }
}

pub fn fit_size(width: f32, height: f32, max_width: f32, max_height: f32) -> (f32, f32) {
    if width <= 0.0 || height <= 0.0 { return (0.0, 0.0); }
    let scale = (max_width / width).min(max_height / height).min(1.0);
    (width * scale, height * scale)
}

#[cfg(test)]
pub fn paginate_blocks(heights: &[f32], available_height: f32) -> Vec<Vec<f32>> {
    let mut pages = vec![Vec::new()];
    let mut used = 0.0;
    for &height in heights {
        let safe_height = height.min(available_height);
        if used > 0.0 && used + safe_height > available_height {
            pages.push(Vec::new());
            used = 0.0;
        }
        pages.last_mut().unwrap().push(safe_height);
        used += safe_height;
    }
    pages
}

#[derive(Debug, Deserialize)]
pub struct PdfExportDocument {
    pub date: String,
    pub blocks: Vec<PdfExportBlock>,
}

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

#[derive(Debug, Deserialize)]
pub struct PdfInline {
    pub text: String,
    #[serde(default)]
    pub bold: bool,
    #[serde(default)]
    pub italic: bool,
    #[serde(default)]
    pub code: bool,
    #[serde(default)]
    pub href: Option<String>,
    #[serde(default)]
    pub underline: bool,
    #[serde(default)]
    pub strike: bool,
    #[serde(default)]
    pub highlight: bool,
}

#[derive(Debug, Deserialize)]
pub struct PdfTodo { pub text: String, pub done: bool, pub time: Option<String> }

#[derive(Debug, Serialize)]
pub struct PdfExportResult { pub path: String, pub pages: usize, pub orientation: String }

#[derive(Debug, Deserialize)]
pub struct PdfImagePayload {
    pub id: String,
    pub bytes: Vec<u8>,
    pub width: f32,
    pub height: f32,
}

enum LayoutItem {
    Text { text: String, size: f32, height: f32 },
    Image { id: String, width: f32, height: f32 },
    Rule,
}

fn inline_text(content: &[PdfInline]) -> String {
    content.iter().map(|run| {
        let mut value = run.text.clone();
        if run.strike {
            // Use combining long stroke overlay for strikethrough effect
            value = value.chars().map(|c| format!("{c}\u{0336}")).collect::<String>();
        }
        if run.href.as_ref().map_or(false, |href| value != *href) {
            if let Some(ref href) = run.href {
                value = format!("{value} ({href})");
            }
        }
        value
    }).collect()
}

fn wrap_text(text: &str, max_chars: usize) -> Vec<String> {
    let mut output = Vec::new();
    for source_line in text.lines() {
        let chars: Vec<char> = source_line.chars().collect();
        if chars.is_empty() { output.push(String::new()); continue; }
        for chunk in chars.chunks(max_chars.max(1)) {
            output.push(chunk.iter().collect());
        }
    }
    output
}

fn build_layout(document: &PdfExportDocument, images: &[PdfImagePayload], content_width: f32) -> Vec<LayoutItem> {
    let mut items = vec![LayoutItem::Text { text: document.date.clone(), size: 20.0, height: 32.0 }];
    let chars_per_line = (content_width / 7.5).floor() as usize;
    for block in &document.blocks {
        match block {
            PdfExportBlock::Heading { level, content } => {
                let size = match level { 1 => 18.0, 2 => 16.0, 3 => 14.0, _ => 12.0 };
                items.push(LayoutItem::Text { text: inline_text(content), size, height: size + 10.0 });
            }
            PdfExportBlock::Paragraph { content } => for line in wrap_text(&inline_text(content), chars_per_line) {
                items.push(LayoutItem::Text { text: line, size: 11.0, height: 18.0 });
            },
            PdfExportBlock::Quote { content } => for line in wrap_text(&format!("│ {}", inline_text(content)), chars_per_line.saturating_sub(2)) {
                items.push(LayoutItem::Text { text: line, size: 11.0, height: 18.0 });
            },
            PdfExportBlock::Code { language, text } => {
                if !language.is_empty() { items.push(LayoutItem::Text { text: format!("代码 · {language}"), size: 9.0, height: 15.0 }); }
                for line in wrap_text(text, chars_per_line) { items.push(LayoutItem::Text { text: line, size: 9.0, height: 15.0 }); }
            }
            PdfExportBlock::List { ordered, items: rows } => for (index, row) in rows.iter().enumerate() {
                let prefix = if *ordered { format!("{}. ", index + 1) } else { "• ".to_string() };
                for line in wrap_text(&format!("{prefix}{}", inline_text(row)), chars_per_line) {
                    items.push(LayoutItem::Text { text: line, size: 11.0, height: 18.0 });
                }
            },
            PdfExportBlock::Table { rows, header } => {
                let _has_header = *header;
                for row in rows {
                    let text = row.join("  │  ");
                    for line in wrap_text(&text, chars_per_line) { items.push(LayoutItem::Text { text: line, size: 9.0, height: 17.0 }); }
                    items.push(LayoutItem::Rule);
                }
            }
            PdfExportBlock::Rule => items.push(LayoutItem::Rule),
            PdfExportBlock::Image { image_id, alt } => {
                if let Some(image) = images.iter().find(|image| &image.id == image_id) {
                    let (width, height) = fit_size(image.width, image.height, content_width, 500.0);
                    items.push(LayoutItem::Image { id: image.id.clone(), width, height });
                } else if !alt.is_empty() {
                    items.push(LayoutItem::Text { text: format!("图片：{alt}"), size: 10.0, height: 18.0 });
                }
            }
            PdfExportBlock::Todos { items: todos } => {
                items.push(LayoutItem::Text { text: "待办清单".into(), size: 16.0, height: 26.0 });
                for todo in todos {
                    let mark = if todo.done { "☑" } else { "☐" };
                    let time = todo.time.as_ref().map(|time| format!(" @ {time}")).unwrap_or_default();
                    items.push(LayoutItem::Text { text: format!("{mark} {}{time}", todo.text), size: 11.0, height: 18.0 });
                }
            }
        }
    }
    items
}

fn find_chinese_font() -> Result<Vec<u8>, String> {
    [r"C:\Windows\Fonts\msyh.ttc", r"C:\Windows\Fonts\msyh.ttf", r"C:\Windows\Fonts\simhei.ttf"]
        .iter()
        .find_map(|path| std::fs::read(path).ok())
        .ok_or_else(|| "未找到可嵌入 PDF 的中文字体（微软雅黑/黑体）".to_string())
}

fn temp_path(path: &Path) -> PathBuf {
    let filename = path.file_name().and_then(|name| name.to_str()).unwrap_or("daynotes.pdf");
    path.with_file_name(format!(".{filename}.tmp"))
}

#[tauri::command]
pub fn export_pdf(path: String, document: PdfExportDocument, images: Vec<PdfImagePayload>) -> Result<PdfExportResult, String> {
    let natural_width = document.blocks.iter().filter_map(|block| match block {
        PdfExportBlock::Table { rows, .. } => Some(rows.iter().map(|row| row.len()).max().unwrap_or(1) as f32 * 110.0),
        _ => None,
    }).fold(0.0_f32, f32::max);
    let widest_image_ratio = images.iter().filter(|image| image.height > 0.0).map(|image| image.width / image.height).fold(0.0_f32, f32::max);
    let orientation = choose_orientation(&DocumentMetrics { natural_width, widest_image_ratio });
    let (page_width_mm, page_height_mm) = match orientation { Orientation::Portrait => (210.0, 297.0), Orientation::Landscape => (297.0, 210.0) };
    let page_width_pt = page_width_mm * 72.0 / 25.4;
    let page_height_pt = page_height_mm * 72.0 / 25.4;
    let margin = 42.0_f32;
    let content_width = page_width_pt - margin * 2.0;

    let font_bytes = find_chinese_font()?;
    let mut font_warnings = Vec::new();
    let font = ParsedFont::from_bytes(&font_bytes, 0, &mut font_warnings).ok_or_else(|| "解析中文字体失败".to_string())?;
    let mut pdf = PdfDocument::new(&format!("DayNotes {}", document.date));
    let font_id = pdf.add_font(&font);
    let mut warnings: Vec<PdfWarnMsg> = Vec::new();

    let mut image_ids = HashMap::new();
    for payload in &images {
        if let Ok(raw) = RawImage::decode_from_bytes(&payload.bytes, &mut warnings) {
            image_ids.insert(payload.id.clone(), pdf.add_image(&raw));
        }
    }

    let layout = build_layout(&document, &images, content_width);
    let mut pages = Vec::new();
    let mut ops = Vec::new();
    let mut y = page_height_pt - margin;
    for item in layout {
        let height = match &item { LayoutItem::Text { height, .. } => *height, LayoutItem::Image { height, .. } => *height + 10.0, LayoutItem::Rule => 10.0 };
        if y - height < margin && !ops.is_empty() {
            pages.push(PdfPage::new(Mm(page_width_mm), Mm(page_height_mm), ops));
            ops = Vec::new();
            y = page_height_pt - margin;
        }
        match item {
            LayoutItem::Text { text, size, .. } => {
                ops.extend([
                    Op::StartTextSection,
                    Op::SetTextCursor { pos: Point { x: Pt(margin), y: Pt(y - size) } },
                    Op::SetFont { font: PdfFontHandle::External(font_id.clone()), size: Pt(size) },
                    Op::ShowText { items: vec![TextItem::Text(text)] },
                    Op::EndTextSection,
                ]);
            }
            LayoutItem::Image { id, width, height } => if let Some(image_id) = image_ids.get(&id) {
                let base_width = images.iter().find(|image| image.id == id).map(|image| image.width * 72.0 / 96.0).unwrap_or(width).max(1.0);
                let base_height = images.iter().find(|image| image.id == id).map(|image| image.height * 72.0 / 96.0).unwrap_or(height).max(1.0);
                ops.push(Op::UseXobject { id: image_id.clone(), transform: XObjectTransform {
                    translate_x: Some(Pt(margin)), translate_y: Some(Pt(y - height)), rotate: None,
                    scale_x: Some(width / base_width), scale_y: Some(height / base_height), dpi: Some(96.0),
                }});
            },
            LayoutItem::Rule => {}
        }
        y -= height;
    }
    if !ops.is_empty() || pages.is_empty() { pages.push(PdfPage::new(Mm(page_width_mm), Mm(page_height_mm), ops)); }
    let page_count = pages.len();
    let bytes = pdf.with_pages(pages).save(&PdfSaveOptions { subset_fonts: true, ..Default::default() }, &mut warnings);
    let target = PathBuf::from(&path);
    let temp = temp_path(&target);
    std::fs::write(&temp, bytes).map_err(|e| format!("写入临时 PDF 失败：{e}"))?;
    std::fs::rename(&temp, &target).map_err(|e| {
        let _ = std::fs::remove_file(&temp);
        format!("保存 PDF 失败：{e}")
    })?;
    Ok(PdfExportResult { path, pages: page_count, orientation: match orientation { Orientation::Portrait => "portrait", Orientation::Landscape => "landscape" }.into() })
}

#[cfg(test)]
mod tests {
    use super::{choose_orientation, fit_size, paginate_blocks, DocumentMetrics, Orientation};

    #[test]
    fn chooses_orientation_from_content_width() {
        assert_eq!(choose_orientation(&DocumentMetrics { natural_width: 500.0, widest_image_ratio: 1.0 }), Orientation::Portrait);
        assert_eq!(choose_orientation(&DocumentMetrics { natural_width: 900.0, widest_image_ratio: 1.0 }), Orientation::Landscape);
        assert_eq!(choose_orientation(&DocumentMetrics { natural_width: 500.0, widest_image_ratio: 1600.0 / 900.0 }), Orientation::Landscape);
    }

    #[test]
    fn fits_images_without_changing_aspect_ratio() {
        let (width, height) = fit_size(1600.0, 900.0, 700.0, 500.0);
        assert!(width <= 700.0 && height <= 500.0);
        assert!((width / height - 1600.0 / 900.0).abs() < 0.001);
    }

    #[test]
    fn paginates_without_crossing_bottom_margin() {
        let pages = paginate_blocks(&[120.0, 500.0, 300.0], 700.0);
        assert!(pages.len() >= 2);
        assert!(pages.iter().all(|page| page.iter().sum::<f32>() <= 700.0));
    }
}
