import { Component, type ReactNode } from 'react';

interface PopupBoundaryProps {
  onFail: () => void;
  children: ReactNode;
}

interface PopupBoundaryState {
  failed: boolean;
}

export class PopupBoundary extends Component<PopupBoundaryProps, PopupBoundaryState> {
  state: PopupBoundaryState = { failed: false };

  static getDerivedStateFromError(): PopupBoundaryState {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onFail();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}
