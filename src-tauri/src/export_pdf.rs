use serde::Serialize;
use std::path::PathBuf;

#[derive(Debug, Serialize)]
pub struct PdfExportResult { pub path: String, pub pages: usize, pub orientation: String }

#[tauri::command]
pub fn export_pdf(path: String, html: String) -> Result<PdfExportResult, String> {
    let target = PathBuf::from(&path);
    // Change extension to .html so it opens properly in browser
    let html_path = target.with_extension("html");
    std::fs::write(&html_path, &html).map_err(|e| format!("写入失败：{e}"))?;
    open::that(&html_path).map_err(|e| format!("打开浏览器失败：{e}"))?;
    Ok(PdfExportResult { path: html_path.to_string_lossy().into(), pages: 1, orientation: "portrait".into() })
}
