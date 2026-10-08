import { Component } from "react";
import type { ErrorInfo, PropsWithChildren, ReactNode } from "react";

interface State {
  hasError: boolean;
}

/**
 * Top-level error boundary. Without it, any render-time exception unmounts the
 * whole React tree and leaves the user staring at a blank page.
 */
export class ErrorBoundary extends Component<PropsWithChildren, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Replace with a real error-reporting sink before production.
    console.error("Unhandled UI error:", error, info.componentStack);
  }

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;
    return (
      <div role="alert" style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
        <h1 style={{ fontSize: "1.25rem", marginBottom: "0.5rem" }}>Something went wrong</h1>
        <p style={{ marginBottom: "1rem", color: "#555" }}>
          The page failed to load. Reload to try again; if it keeps happening, contact support.
        </p>
        <button type="button" onClick={() => window.location.reload()}>
          Reload
        </button>
      </div>
    );
  }
}

export default ErrorBoundary;
