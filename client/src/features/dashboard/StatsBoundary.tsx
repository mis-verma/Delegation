import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  label: string;
  children: ReactNode;
}

interface State {
  failed: boolean;
}

export class StatsBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (import.meta.env.DEV) console.error(`${this.props.label} failed to render`, error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="flex items-center justify-between gap-3 border-b border-border/40 px-4 py-3 sm:px-5" role="alert">
        <p className="t-meta font-medium text-text-muted">{this.props.label} could not be shown.</p>
        <button
          type="button"
          onClick={() => this.setState({ failed: false })}
          className="inline-flex h-9 items-center rounded-full border border-border px-3 t-meta font-display font-semibold text-text-secondary transition-colors hover:border-vivid-blue/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50 cursor-pointer"
        >
          Try again
        </button>
      </div>
    );
  }
}
