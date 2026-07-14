// The application tsconfig intentionally omits Node types, while Vitest executes this contract test in Node.
// @ts-expect-error node:fs is available in the Vitest runtime.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const indexCss = readFileSync(new URL("./index.css", import.meta.url), "utf8");
const appCss = readFileSync(new URL("./App.css", import.meta.url), "utf8");
const uiCss = readFileSync(new URL("./components/ui/ui.css", import.meta.url), "utf8");

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
  const block = indexCss.match(new RegExp(`${escapedSelector}\\s*\\{([^}]+)\\}`))?.[1];
  if (!block) throw new Error(`Missing token block: ${selector}`);
  return new Map(Array.from(block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g), ([, name, value]) => [name, value.trim()]));
}

function rule(stylesheet: string, selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const block = stylesheet.match(new RegExp(`${escapedSelector}\\s*\\{([^}]+)\\}`))?.[1];
  if (!block) throw new Error(`Missing CSS rule: ${selector}`);
  return block;
}

interface ContrastUsage {
  usage: string;
  foreground: string;
  background: string;
}

const toolbarUsages: ContrastUsage[] = [
  { usage: "toolbar group label", foreground: "--text-secondary", background: "--surface-inset" },
  { usage: "default toolbar button", foreground: "--text-primary", background: "--surface-inset" },
  { usage: "saved status", foreground: "--success", background: "--surface-inset" },
  { usage: "dirty/warning status", foreground: "--warning", background: "--surface-inset" },
  { usage: "saving status", foreground: "--text-secondary", background: "--surface-inset" },
  { usage: "error status", foreground: "--danger", background: "--surface-inset" },
  { usage: "active toolbar button", foreground: "--accent-hover", background: "--accent-light" },
  { usage: "checked menu item", foreground: "--accent-hover", background: "--accent-light" },
  { usage: "unchecked menu item", foreground: "--text-secondary", background: "--surface-raised" },
];

describe("toolbar semantic color contract", () => {
  it("binds actual toolbar and status selectors to the reviewed semantic pairs", () => {
    expect(rule(appCss, ".editor-toolbar")).toContain("background: var(--surface-inset)");
    expect(rule(appCss, ".toolbar-group-label")).toContain("color: var(--text-secondary)");
    expect(rule(uiCss, ".ui-button--secondary")).toContain("background: var(--surface-inset)");
    expect(rule(uiCss, ".ui-button--secondary")).toContain("color: var(--text-primary)");
    expect(rule(uiCss, ".ui-status--saved")).toContain("color: var(--success)");
    expect(rule(uiCss, ".ui-status--dirty, .ui-status--warning")).toContain("color: var(--warning)");
    expect(rule(uiCss, ".ui-status--saving")).toContain("color: var(--text-secondary)");
    expect(rule(uiCss, ".ui-status--error")).toContain("color: var(--danger)");
    expect(rule(uiCss, ".ui-icon-button.is-active")).toContain("color: var(--accent-hover)");
    expect(rule(uiCss, ".ui-icon-button.is-active")).toContain("background: var(--accent-light)");
    expect(rule(appCss, '.editor-toolbar .ui-menu-popover__menu [aria-checked="true"]')).toContain("color: var(--accent-hover)");
    expect(rule(appCss, '.editor-toolbar .ui-menu-popover__menu [aria-checked="true"]')).toContain("background: var(--accent-light)");
    expect(rule(uiCss, ".ui-button--subtle")).toContain("color: var(--text-secondary)");
    expect(rule(uiCss, ".ui-menu-popover__menu")).toContain("background: var(--surface-raised)");
  });

  it.each([
    ["light", ":root" as const],
    ["dark", '[data-theme="dark"]' as const],
  ])("keeps every actual %s toolbar text pair at WCAG AA", (theme, selector) => {
    const tokens = themeTokens(selector);
    for (const usage of toolbarUsages) {
      const foreground = tokens.get(usage.foreground) ?? "";
      const background = tokens.get(usage.background) ?? "";
      const ratio = contrastRatio(foreground, background);
      expect(ratio, `${theme} ${usage.usage}: ${usage.foreground} on ${usage.background} = ${ratio.toFixed(3)}:1`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
