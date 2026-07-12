// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { lazy } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LazyModalBoundary } from "./LazyModalBoundary";

describe("LazyModalBoundary", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows a loading status while a lazy modal is pending", () => {
    const PendingModal = lazy(() => new Promise<never>(() => undefined));

    render(
      <LazyModalBoundary onClose={() => undefined} retryKey={0}>
        <PendingModal />
      </LazyModalBoundary>,
    );

    expect(screen.getByRole("status").textContent).toBe("正在加载…");
  });

  it("renders a resolved lazy modal", async () => {
    const ResolvedModal = lazy(async () => ({
      default: () => <div>分享内容</div>,
    }));

    render(
      <LazyModalBoundary onClose={() => undefined} retryKey={0}>
        <ResolvedModal />
      </LazyModalBoundary>,
    );

    expect(await screen.findByText("分享内容")).not.toBeNull();
  });

  it("shows recovery actions after a child render failure and closes on request", async () => {
    const onClose = vi.fn();
    function BrokenModal(): never {
      throw new Error("chunk failed");
    }

    render(
      <LazyModalBoundary onClose={onClose} retryKey={0}>
        <BrokenModal />
      </LazyModalBoundary>,
    );

    expect(await screen.findByText("功能加载失败")).not.toBeNull();
    expect(screen.getByRole("button", { name: "重试" })).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("resets a captured error when retryKey changes", async () => {
    let shouldThrow = true;
    function RecoverableModal() {
      if (shouldThrow) throw new Error("chunk failed");
      return <div>设置内容</div>;
    }

    const { rerender } = render(
      <LazyModalBoundary onClose={() => undefined} retryKey={0}>
        <RecoverableModal />
      </LazyModalBoundary>,
    );
    expect(await screen.findByText("功能加载失败")).not.toBeNull();

    shouldThrow = false;
    rerender(
      <LazyModalBoundary onClose={() => undefined} retryKey={1}>
        <RecoverableModal />
      </LazyModalBoundary>,
    );

    await waitFor(() => expect(screen.getByText("设置内容")).not.toBeNull());
  });
});
