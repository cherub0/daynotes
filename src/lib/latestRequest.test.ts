import { describe, expect, it } from "vitest";
import { createLatestRequestGuard } from "./latestRequest";

describe("createLatestRequestGuard", () => {
  it("marks earlier requests stale when a newer request begins", () => {
    const guard = createLatestRequestGuard();

    const first = guard.begin();
    const second = guard.begin();

    expect(guard.isLatest(first)).toBe(false);
    expect(guard.isLatest(second)).toBe(true);
  });
});
