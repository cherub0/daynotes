// The application tsconfig intentionally omits Node types, while Vitest executes this contract test in Node.
// @ts-expect-error node:fs is available in the Vitest runtime.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const stylesheet = readFileSync(new URL("./index.css", import.meta.url), "utf8");

function relativeLuminance(color: string): number {
  const channels = color
    .trim()
    .replace("#", "")
    .match(/.{2}/g)
    ?.map((channel) => parseInt(channel, 16) / 255)
    .map((channel) => channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4);
  if (!channels || channels.length !== 3) throw new Error(`Unsupported color: ${color}`);
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(foreground: string, background: string): number {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

function themeTokens(selector: ":root" | "[data-theme=\"dark\"]"): Map<string, string> {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const block = stylesheet.match(new RegExp(`${escapedSelector}\\s*\\{([^}]+)\\}`))?.[1];
  if (!block) throw new Error(`Missing token block: ${selector}`);
  return new Map(Array.from(block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g), ([, name, value]) => [name, value.trim()]));
}

describe("semantic text contrast", () => {
  it("keeps muted text at WCAG AA contrast on light raised and paper surfaces", () => {
    const tokens = themeTokens(":root");
    expect(contrastRatio(tokens.get("--text-muted") ?? "", tokens.get("--surface-raised") ?? "")).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(tokens.get("--text-muted") ?? "", tokens.get("--surface-paper") ?? "")).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps muted text at WCAG AA contrast on dark raised and paper surfaces", () => {
    const tokens = themeTokens("[data-theme=\"dark\"]");
    expect(contrastRatio(tokens.get("--text-muted") ?? "", tokens.get("--surface-raised") ?? "")).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(tokens.get("--text-muted") ?? "", tokens.get("--surface-paper") ?? "")).toBeGreaterThanOrEqual(4.5);
  });
});
