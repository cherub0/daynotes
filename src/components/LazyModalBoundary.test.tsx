// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { lazy } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRetryableLazy, LazyModalBoundary } from "./LazyModalBoundary";

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

  it("calls a rejected lazy loader again and renders it after retry", async () => {
    let attempts = 0;
    const loader = vi.fn(async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("chunk failed");
      return { default: () => <div>恢复后的分享</div> };
    });
    const RetryableModal = createRetryableLazy(loader);

    render(
      <LazyModalBoundary onClose={() => undefined} retryKey={0}>
        <RetryableModal retryKey={0} />
      </LazyModalBoundary>,
    );
    expect(await screen.findByText("功能加载失败")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "重试" }));

    expect(await screen.findByText("恢复后的分享")).not.toBeNull();
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("keeps retry generations independent between modal boundaries", async () => {
    const shareLoader = vi.fn()
      .mockRejectedValueOnce(new Error("share failed"))
      .mockResolvedValue({ default: () => <div>分享已恢复</div> });
    const settingsLoader = vi.fn().mockRejectedValue(new Error("settings failed"));
    const RetryableShare = createRetryableLazy(shareLoader);
    const RetryableSettings = createRetryableLazy(settingsLoader);

    render(
      <>
        <LazyModalBoundary onClose={() => undefined} retryKey={0}>
          <RetryableShare retryKey={0} />
        </LazyModalBoundary>
        <LazyModalBoundary onClose={() => undefined} retryKey={0}>
          <RetryableSettings retryKey={0} />
        </LazyModalBoundary>
      </>,
    );
    await waitFor(() => expect(screen.getAllByText("功能加载失败")).toHaveLength(2));

    fireEvent.click(screen.getAllByRole("button", { name: "重试" })[0]);

    expect(await screen.findByText("分享已恢复")).not.toBeNull();
    expect(shareLoader).toHaveBeenCalledTimes(2);
    expect(settingsLoader).toHaveBeenCalledTimes(1);
  });

  it("creates a fresh lazy wrapper when a modal is closed and reopened", async () => {
    const loader = vi.fn()
      .mockRejectedValueOnce(new Error("first open failed"))
      .mockResolvedValue({ default: () => <div>重新打开成功</div> });
    const RetryableModal = createRetryableLazy(loader);
    const { rerender } = render(
      <LazyModalBoundary onClose={() => undefined} retryKey={1}>
        <RetryableModal retryKey={1} />
      </LazyModalBoundary>,
    );
    expect(await screen.findByText("功能加载失败")).not.toBeNull();

    rerender(
      <LazyModalBoundary onClose={() => undefined} retryKey={2}>
        <RetryableModal retryKey={2} />
      </LazyModalBoundary>,
    );

    expect(await screen.findByText("重新打开成功")).not.toBeNull();
    expect(loader).toHaveBeenCalledTimes(2);
  });
});
