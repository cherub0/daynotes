import { toBlob } from "html-to-image";

export interface PageSlice {
  start: number;
  end: number;
}

export function calculatePageSlices(totalHeight: number, idealPageHeight: number, breakpoints: number[]): PageSlice[] {
  const slices: PageSlice[] = [];
  const sorted = [...new Set(breakpoints)].filter((value) => value > 0 && value <= totalHeight).sort((a, b) => a - b);
  let start = 0;
  while (start < totalHeight) {
    const idealEnd = Math.min(start + idealPageHeight, totalHeight);
    if (idealEnd === totalHeight) {
      slices.push({ start, end: totalHeight });
      break;
    }
    const minimumUsefulEnd = start + idealPageHeight * 0.55;
    const candidates = sorted.filter((value) => value >= minimumUsefulEnd && value <= idealEnd);
    const boundary = candidates[candidates.length - 1];
    const end = boundary && boundary > start ? boundary : idealEnd;
    slices.push({ start, end });
    start = end;
  }
  return slices;
}

function canvasToPng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (!blob) {
        reject(new Error("无法生成 PDF 页面图片"));
        return;
      }
      resolve(new Uint8Array(await blob.arrayBuffer()));
    }, "image/png");
  });
}

export async function renderPdfPages(element: HTMLElement): Promise<Uint8Array[]> {
  await document.fonts.ready;
  const blob = await toBlob(element, { pixelRatio: 1.5, backgroundColor: "#ffffff", cacheBust: true });
  if (!blob) throw new Error("无法生成 PDF 预览图像");
  const bitmap = await createImageBitmap(blob);
  try {
    const pageHeight = Math.round(bitmap.width * 297 / 210);
    const scale = bitmap.width / Math.max(element.scrollWidth, 1);
    const rootTop = element.getBoundingClientRect().top;
    const contentElements = [
      element.querySelector(":scope > .export-header"),
      ...element.querySelectorAll(":scope > .export-body > *"),
      element.querySelector(":scope > .export-footer"),
    ].filter((node): node is Element => Boolean(node));
    const breakpoints = contentElements.map((node) => Math.round((node.getBoundingClientRect().bottom - rootTop) * scale));
    const slices = calculatePageSlices(bitmap.height, pageHeight, breakpoints);
    const pages: Uint8Array[] = [];
    for (const slice of slices) {
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = pageHeight;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("无法创建 PDF 页面画布");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, slice.start, bitmap.width, slice.end - slice.start, 0, 0, bitmap.width, slice.end - slice.start);
      pages.push(await canvasToPng(canvas));
    }
    return pages;
  } finally {
    bitmap.close();
  }
}
