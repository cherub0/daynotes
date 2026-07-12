import { Component, Suspense } from "react";
import type { ErrorInfo, ReactNode } from "react";

interface LazyModalBoundaryProps {
  children: ReactNode;
  onClose: () => void;
  retryKey: number;
}

interface LazyModalErrorBoundaryState {
  hasError: boolean;
}

class LazyModalErrorBoundary extends Component<LazyModalBoundaryProps, LazyModalErrorBoundaryState> {
  state: LazyModalErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): LazyModalErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Failed to load modal:", error, info);
  }

  componentDidUpdate(previousProps: LazyModalBoundaryProps) {
    if (this.state.hasError && previousProps.retryKey !== this.props.retryKey) {
      this.setState({ hasError: false });
    }
  }

  private retry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="modal-overlay">
          <div className="modal-backdrop" onClick={this.props.onClose} />
          <div className="modal-content" role="alert">
            <h2>功能加载失败</h2>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={this.props.onClose}>关闭</button>
              <button className="btn btn-primary" onClick={this.retry}>重试</button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export function LazyModalBoundary(props: LazyModalBoundaryProps) {
  return (
    <LazyModalErrorBoundary {...props}>
      <Suspense fallback={<div role="status">正在加载…</div>}>
        {props.children}
      </Suspense>
    </LazyModalErrorBoundary>
  );
}
