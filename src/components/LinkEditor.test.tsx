// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { normalizeWebUrl } from "../lib/linkUtils";

describe("normalizeWebUrl", () => {
  it("adds a protocol to ordinary web addresses", () => {
    expect(normalizeWebUrl("example.com")).toBe("https://example.com/");
    expect(normalizeWebUrl("https://example.com/a")).toBe("https://example.com/a");
  });

  it("rejects unsafe and non-web protocols", () => {
    expect(normalizeWebUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeWebUrl("data:text/html,hello")).toBeNull();
    expect(normalizeWebUrl("file:///C:/note.txt")).toBeNull();
  });
});
