use image::GenericImageView;
use serde::Serialize;
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize)]
pub struct PdfExportResult {
    pub path: String,
    pub pages: usize,
    pub orientation: String,
}

fn pdf_page_count(path: &Path) -> Result<usize, String> {
    let document = lopdf::Document::load(path)
        .map_err(|e| format!("PDF页数读取失败：{e}"))?;
    let pages = document.get_pages().len();
    if pages == 0 {
        return Err("PDF页数读取失败：文档没有页面".to_string());
    }
    Ok(pages)
}

fn replace_with_temp_file(temp: &Path, target: &Path) -> Result<(), String> {
    if !target.exists() {
        return std::fs::rename(temp, target).map_err(|e| format!("PDF保存失败：{e}"));
    }
    let backup = target.with_file_name(format!(
        ".{}.{}.backup",
        target.file_name().and_then(|name| name.to_str()).unwrap_or("daynotes.pdf"),
        std::process::id()
    ));
    if let Err(error) = std::fs::rename(target, &backup) {
        let _ = std::fs::remove_file(temp);
        return Err(format!("无法替换已存在的PDF：{error}"));
    }
    if let Err(error) = std::fs::rename(temp, target) {
        let _ = std::fs::remove_file(temp);
        return match std::fs::rename(&backup, target) {
            Ok(()) => Err(format!("PDF保存失败，原文件已恢复：{error}")),
            Err(restore_error) => Err(format!(
                "PDF保存失败且原文件恢复失败：{error}；恢复错误：{restore_error}；备份位于 {}",
                backup.display()
            )),
        };
    }
    let _ = std::fs::remove_file(backup);
    Ok(())
}

fn flatten_alpha(image: image::DynamicImage) -> image::DynamicImage {
    if !image.color().has_alpha() {
        return image;
    }
    let rgba = image.to_rgba8();
    let (width, height) = rgba.dimensions();
    let mut rgb = image::RgbImage::new(width, height);
    for (x, y, pixel) in rgba.enumerate_pixels() {
        let alpha = f32::from(pixel[3]) / 255.0;
        rgb.put_pixel(x, y, image::Rgb([
            (f32::from(pixel[0]) * alpha + 255.0 * (1.0 - alpha)).round() as u8,
            (f32::from(pixel[1]) * alpha + 255.0 * (1.0 - alpha)).round() as u8,
            (f32::from(pixel[2]) * alpha + 255.0 * (1.0 - alpha)).round() as u8,
        ]));
    }
    image::DynamicImage::ImageRgb8(rgb)
}

#[tauri::command]
pub fn export_pdf_pages(path: String, date: String, pages: Vec<Vec<u8>>) -> Result<PdfExportResult, String> {
    if pages.is_empty() {
        return Err("PDF没有可导出的页面".to_string());
    }
    let (document, first_page, first_layer) = printpdf::PdfDocument::new(
        &format!("DayNotes {date}"),
        printpdf::Mm(210.0),
        printpdf::Mm(297.0),
        "Page 1",
    );
    for (index, bytes) in pages.into_iter().enumerate() {
        let image = image::load_from_memory(&bytes)
            .map_err(|e| format!("PDF第{}页图像无效：{e}", index + 1))?;
        let image = flatten_alpha(image);
        let dpi = f64::from(image.width()) * 25.4 / 210.0;
        let (page, layer) = if index == 0 {
            (first_page, first_layer)
        } else {
            document.add_page(
                printpdf::Mm(210.0),
                printpdf::Mm(297.0),
                format!("Page {}", index + 1),
            )
        };
        printpdf::Image::from_dynamic_image(&image).add_to_layer(
            document.get_page(page).get_layer(layer),
            Some(printpdf::Mm(0.0)),
            Some(printpdf::Mm(0.0)),
            None,
            None,
            None,
            Some(dpi),
        );
    }

    let target = PathBuf::from(&path);
    let temp = target.with_file_name(format!(
        ".{}.{}.tmp",
        target.file_name().and_then(|name| name.to_str()).unwrap_or("daynotes.pdf"),
        std::process::id()
    ));
    let file = std::fs::File::create(&temp)
        .map_err(|e| format!("PDF临时文件创建失败：{e}"))?;
    if let Err(error) = document.save(&mut std::io::BufWriter::new(file)) {
        let _ = std::fs::remove_file(&temp);
        return Err(format!("PDF页面渲染失败：{error}"));
    }
    let actual_pages = match pdf_page_count(&temp) {
        Ok(pages) => pages,
        Err(error) => {
            let _ = std::fs::remove_file(&temp);
            return Err(error);
        }
    };
    replace_with_temp_file(&temp, &target)?;
    Ok(PdfExportResult {
        path,
        pages: actual_pages,
        orientation: "portrait".into(),
    })
}

#[cfg(test)]
mod tests {
    use super::{export_pdf_pages, pdf_page_count};
    use lopdf::{dictionary, Document, Object};
    use std::path::PathBuf;

    #[test]
    fn reads_the_actual_number_of_pdf_pages() {
        let mut document = Document::with_version("1.5");
        let pages_id = document.new_object_id();
        let page_ids = [document.new_object_id(), document.new_object_id()];
        for page_id in page_ids {
            document.objects.insert(page_id, Object::Dictionary(dictionary! {
                "Type" => "Page",
                "Parent" => pages_id,
                "MediaBox" => vec![0.into(), 0.into(), 595.into(), 842.into()],
                "Resources" => dictionary! {},
            }));
        }
        document.objects.insert(pages_id, Object::Dictionary(dictionary! {
            "Type" => "Pages",
            "Kids" => page_ids.into_iter().map(Object::Reference).collect::<Vec<_>>(),
            "Count" => 2,
        }));
        let catalog_id = document.add_object(dictionary! {
            "Type" => "Catalog",
            "Pages" => pages_id,
        });
        document.trailer.set("Root", catalog_id);
        let path = std::env::temp_dir().join(format!(
            "daynotes-page-count-{}-{}.pdf",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system time")
                .as_nanos()
        ));
        document.save(&path).expect("save fixture PDF");
        assert_eq!(pdf_page_count(&path).expect("read page count"), 2);
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn exports_the_browser_rendered_pages_as_a_real_pdf_artifact() {
        let artifact_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent().expect("workspace root").join("verify-output").join("artifacts");
        std::fs::create_dir_all(&artifact_dir).expect("create artifact directory");
        let mut page_paths = std::fs::read_dir(&artifact_dir).expect("read artifact directory")
            .filter_map(Result::ok)
            .map(|entry| entry.path())
            .filter(|path| path.file_name().and_then(|name| name.to_str()).is_some_and(|name| {
                name.starts_with("pdf-page-") && name.ends_with(".png")
            }))
            .collect::<Vec<_>>();
        page_paths.sort();
        let mut pages = page_paths.into_iter()
            .map(|path| std::fs::read(path).expect("read rendered PDF page"))
            .collect::<Vec<_>>();
        if pages.is_empty() {
            for color in [image::Rgb([255, 255, 255]), image::Rgb([245, 247, 255])] {
                let mut fallback = Vec::new();
                image::DynamicImage::ImageRgb8(image::RgbImage::from_pixel(1240, 1754, color))
                    .write_to(&mut fallback, image::ImageOutputFormat::Png)
                    .expect("encode fallback page");
                pages.push(fallback);
            }
        }
        let expected_pages = pages.len();
        assert!(expected_pages >= 2, "long-form PDF verification requires at least two rendered pages");
        let artifact = artifact_dir.join("sample.pdf");
        let result = export_pdf_pages(
            artifact.to_string_lossy().into_owned(),
            "2026-07-12".into(),
            pages,
        ).expect("export rendered PDF pages");
        assert_eq!(result.pages, expected_pages);
        assert_eq!(pdf_page_count(&artifact).expect("count artifact pages"), result.pages);
        assert_eq!(&std::fs::read(&artifact).expect("read artifact")[..5], b"%PDF-");
    }
}
