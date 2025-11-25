import { Component, ErrorInfo, ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  componentName?: string;
  resetKey?: string | number | null;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const { componentName = 'Unknown component' } = this.props;
    console.error(`[ErrorBoundary] ${componentName} crashed`, error, errorInfo);
    this.setState({ errorInfo });
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false, error: null, errorInfo: null });
    }
  }

  render() {
    const { hasError, error, errorInfo } = this.state;
    const { children, fallback, componentName } = this.props;

    if (!hasError) {
      return children;
    }

    if (fallback) {
      return fallback;
    }

    return (
      <div className="h-full w-full flex flex-col items-center justify-center gap-4 p-6 text-error">
        <div className="text-center space-y-2">
          <p className="text-sm font-semibold uppercase tracking-widest opacity-70">{componentName || 'Component'} Error</p>
          <h2 className="text-xl font-bold">Something went wrong.</h2>
          <p className="text-sm opacity-80">
            Please try refreshing or selecting a different note. Error details are in the console.
          </p>
        </div>
        {error && (
          <pre className="text-xs text-left w-full max-w-2xl bg-base-200 border border-error/40 rounded-md p-3 overflow-auto">
            {error.toString()}
            {errorInfo?.componentStack}
          </pre>
        )}
      </div>
    );
  }
}
