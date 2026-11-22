import { Component, type ReactNode } from 'react';

export class RootBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main
        role="alert"
        style={{
          maxWidth: 560,
          margin: '12vh auto',
          padding: 32,
          lineHeight: 1.7,
        }}
      >
        <h1>The workspace could not open</h1>
        <p>
          Your saved notes have not been removed. Reload to reopen the last
          saved workspace. Keep this browser’s site data when troubleshooting.
        </p>
        <button type="button" onClick={() => location.reload()}>
          Reload workspace
        </button>
      </main>
    );
  }
}
