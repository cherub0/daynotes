use serde::{Deserialize, Serialize};
use std::io::{Cursor, Write};
use std::path::{Component, Path, PathBuf};
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipWriter};

#[derive(Debug, Clone, Deserialize)]
pub struct ExportImagePayload {
    pub path: String,
    pub bytes: Vec<u8>,
}

#[derive(Debug, Serialize)]
pub struct ExportResult {
    pub path: String,
    pub image_count: usize,
}

fn validate_entry_path(value: &str) -> Result<(), String> {
    if value.is_empty() || value.contains('\\') {
        return Err(format!("无效的压缩包路径：{value}"));
    }
    let path = Path::new(value);
    if path.is_absolute()
        || path.components().any(|part| matches!(part, Component::ParentDir | Component::Prefix(_)))
    {
        return Err(format!("不安全的压缩包路径：{value}"));
    }
    Ok(())
}

pub fn build_markdown_zip(
    markdown_name: &str,
    markdown: &str,
    images: &[ExportImagePayload],
) -> Result<Vec<u8>, String> {
    validate_entry_path(markdown_name)?;
    for image in images {
        validate_entry_path(&image.path)?;
        if !image.path.starts_with("images/") {
            return Err(format!("图片必须位于 images/ 目录：{}", image.path));
        }
    }

    let mut cursor = Cursor::new(Vec::new());
    {
        let mut archive = ZipWriter::new(&mut cursor);
        let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
        archive.start_file(markdown_name, options).map_err(|e| format!("创建 Markdown 条目失败：{e}"))?;
        archive.write_all(markdown.as_bytes()).map_err(|e| format!("写入 Markdown 失败：{e}"))?;
        for image in images {
            archive.start_file(&image.path, options).map_err(|e| format!("创建图片条目失败：{e}"))?;
            archive.write_all(&image.bytes).map_err(|e| format!("写入图片失败：{e}"))?;
        }
        archive.finish().map_err(|e| format!("完成 ZIP 失败：{e}"))?;
    }
    Ok(cursor.into_inner())
}

fn temporary_path(path: &Path) -> PathBuf {
    let filename = path.file_name().and_then(|name| name.to_str()).unwrap_or("daynotes.zip");
    path.with_file_name(format!(".{filename}.tmp"))
}

#[tauri::command]
pub fn export_markdown_zip(
    path: String,
    markdown_name: String,
    markdown: String,
    images: Vec<ExportImagePayload>,
) -> Result<ExportResult, String> {
    let bytes = build_markdown_zip(&markdown_name, &markdown, &images)?;
    let target = PathBuf::from(&path);
    let temp = temporary_path(&target);
    std::fs::write(&temp, bytes).map_err(|e| format!("写入临时 ZIP 失败：{e}"))?;
    if target.exists() {
        std::fs::remove_file(&target).map_err(|e| format!("替换已有 ZIP 失败：{e}"))?;
    }
    if let Err(error) = std::fs::rename(&temp, &target) {
        let _ = std::fs::remove_file(&temp);
        return Err(format!("保存 ZIP 失败：{error}"));
    }
    Ok(ExportResult { path, image_count: images.len() })
}

#[cfg(test)]
mod tests {
    use std::io::{Cursor, Read};
    use super::{build_markdown_zip, ExportImagePayload};

    #[test]
    fn creates_markdown_and_image_entries() {
        let bytes = build_markdown_zip(
            "2026-07-11.md",
            "![图](images/image-1.png)",
            &[ExportImagePayload { path: "images/image-1.png".into(), bytes: b"hello".to_vec() }],
        ).unwrap();
        let mut archive = zip::ZipArchive::new(Cursor::new(bytes)).unwrap();
        assert_eq!(archive.len(), 2);
        let mut markdown = String::new();
        archive.by_name("2026-07-11.md").unwrap().read_to_string(&mut markdown).unwrap();
        assert!(markdown.contains("images/image-1.png"));
        let mut image = Vec::new();
        archive.by_name("images/image-1.png").unwrap().read_to_end(&mut image).unwrap();
        assert_eq!(image, b"hello");
    }

    #[test]
    fn rejects_unsafe_archive_paths() {
        assert!(build_markdown_zip("../note.md", "x", &[]).is_err());
        assert!(build_markdown_zip("C:/note.md", "x", &[]).is_err());
        assert!(build_markdown_zip(
            "note.md", "x",
            &[ExportImagePayload { path: "images/../../secret".into(), bytes: vec![] }],
        ).is_err());
    }
}
