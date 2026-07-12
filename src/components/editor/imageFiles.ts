export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export type ImageFileError = "not-image" | "too-large" | "read-failed";

export function validateImageFile(file: File): ImageFileError | null {
  if (!file.type.startsWith("image/")) return "not-image";
  if (file.size > MAX_IMAGE_BYTES) return "too-large";
  return null;
}

export function takeSelectedFile(input: HTMLInputElement): File | null {
  const file = input.files?.[0] ?? null;
  input.value = "";
  return file;
}

export function readImageAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("read-failed"));
    reader.onerror = () => reject(new Error("read-failed"));
    reader.readAsDataURL(file);
  });
}
