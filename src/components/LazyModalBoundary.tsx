import { Component, createContext, lazy, Suspense, useContext } from "react";
import type { ComponentType, ErrorInfo, LazyExoticComponent, ReactNode } from "react";

interface LazyModalBoundaryProps {
  children: ReactNode;
  onClose: () => void;
  retryKey: number;
}

interface LazyModalErrorBoundaryState {
  hasError: boolean;
  retryGeneration: number;
}

const RetryGenerationContext = createContext(0);

class LazyModalErrorBoundary extends Component<LazyModalBoundaryProps, LazyModalErrorBoundaryState> {
  state: LazyModalErrorBoundaryState = { hasError: false, retryGeneration: 0 };

  static getDerivedStateFromError(): Partial<LazyModalErrorBoundaryState> {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Failed to load modal:", error, info);
  }

  componentDidUpdate(previousProps: LazyModalBoundaryProps) {
    if (this.state.hasError && previousProps.retryKey !== this.props.retryKey) {
      this.setState((state) => ({
        hasError: false,
        retryGeneration: state.retryGeneration + 1,
      }));
    }
  }

  private retry = () => {
    this.setState((state) => ({
      hasError: false,
      retryGeneration: state.retryGeneration + 1,
    }));
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

    return (
      <RetryGenerationContext value={this.state.retryGeneration}>
        {this.props.children}
      </RetryGenerationContext>
    );
  }
}

// The factory is intentionally colocated with the boundary because they share retry context.
// eslint-disable-next-line react-refresh/only-export-components
export function createRetryableLazy<Props extends object>(
  loader: () => Promise<{ default: ComponentType<Props> }>,
) {
  let slot: {
    retryKey: number;
    retryGeneration: number;
    component: LazyExoticComponent<ComponentType<Props>>;
  } | null = null;

  return function RetryableLazy({ retryKey, ...props }: Props & { retryKey: number }) {
    const retryGeneration = useContext(RetryGenerationContext);
    if (
      slot === null ||
      slot.retryKey !== retryKey ||
      slot.retryGeneration !== retryGeneration
    ) {
      slot = { retryKey, retryGeneration, component: lazy(loader) };
    }

    const LazyComponent = slot.component;
    return <LazyComponent {...props as Props} />;
  };
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
