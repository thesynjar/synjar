import { Component, type ReactNode, type ErrorInfo } from 'react';

/**
 * NavigationErrorBoundary - Critical error boundary for navigation components
 *
 * Catches errors in WorkspaceUIProvider and navigation components
 * to prevent the entire application from crashing
 *
 * See: docs/specifications/2025-12-30-navigation-redesign.md (Section H6)
 */

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class NavigationErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Navigation error:', error, errorInfo);
    // Optional: Send to monitoring (Sentry, DataDog) in production
    // if (import.meta.env.PROD) {
    //   sentryService.captureException(error, { extra: errorInfo });
    // }
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center">
          <div className="text-center p-8 max-w-md">
            <div className="text-6xl mb-4">
              <ErrorIcon className="h-16 w-16 mx-auto text-red-400" />
            </div>
            <h1 className="text-xl font-semibold text-white mb-4">Navigation Error</h1>
            <p className="text-slate-400 mb-6">
              We encountered an error loading workspaces. This may be a temporary issue.
            </p>
            {import.meta.env.DEV && this.state.error && (
              <pre className="text-left text-xs text-red-400 bg-slate-800 p-4 rounded-lg mb-6 overflow-auto max-h-32">
                {this.state.error.message}
              </pre>
            )}
            <button
              onClick={this.handleReload}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg text-white font-medium transition-colors"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

function ErrorIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
      />
    </svg>
  );
}
