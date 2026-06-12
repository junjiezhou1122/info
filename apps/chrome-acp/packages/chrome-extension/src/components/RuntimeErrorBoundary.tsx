import { Component, type ErrorInfo, type ReactNode } from "react";

type RuntimeErrorBoundaryProps = {
  children: ReactNode;
};

type RuntimeErrorBoundaryState = {
  error: Error | null;
  info: ErrorInfo | null;
};

export class RuntimeErrorBoundary extends Component<
  RuntimeErrorBoundaryProps,
  RuntimeErrorBoundaryState
> {
  state: RuntimeErrorBoundaryState = {
    error: null,
    info: null,
  };

  static getDerivedStateFromError(error: Error): Partial<RuntimeErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[RuntimeErrorBoundary] side panel crashed:", error, info);
    this.setState({ info });
  }

  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex h-dvh w-full flex-col bg-background text-foreground">
        <header className="border-b px-3 py-2">
          <div className="text-sm font-semibold">Side panel crashed</div>
          <div className="text-xs text-muted-foreground">Reload after fixing the runtime error.</div>
        </header>
        <main className="flex-1 overflow-auto p-3">
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3">
            <div className="text-sm font-medium text-destructive">
              {error.name}: {error.message}
            </div>
            {error.stack && (
              <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded bg-background/70 p-2 text-[11px] leading-5">
                {error.stack}
              </pre>
            )}
            {info?.componentStack && (
              <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded bg-background/70 p-2 text-[11px] leading-5">
                {info.componentStack}
              </pre>
            )}
          </div>
        </main>
      </div>
    );
  }
}
