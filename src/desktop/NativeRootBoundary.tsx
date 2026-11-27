import { Component, type ReactNode } from 'react';

/** One permanent boundary type per native window owner, never recreated by effects. */
export function createNativeRootBoundary(
  fail: () => void,
  isFailed: () => boolean,
) {
  return class NativeRootBoundary extends Component<
    { children: ReactNode },
    { failed: boolean }
  > {
    state = { failed: isFailed() };

    static getDerivedStateFromError() {
      // This irreversible safety latch deliberately also covers React's render
      // retries. Waiting for componentDidCatch permits subtree cleanup first.
      fail();
      return { failed: true };
    }

    render() {
      if (!this.state.failed && !isFailed()) return this.props.children;
      return (
        <main role="alert" className="boot-message">
          <h1>The native workspace cannot continue safely</h1>
          <p>
            Save and close completion cannot be confirmed. Unpublished edits may
            not have reached the file. Reload and restart cannot be offered
            safely in this window.
          </p>
        </main>
      );
    }
  };
}
