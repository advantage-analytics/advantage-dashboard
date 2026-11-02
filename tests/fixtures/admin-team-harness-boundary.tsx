import { Component, type ReactNode } from "react";

/**
 * Stands in for the page's error screen in the Admin › Teams harnesses:
 * anything a click throws to it is recorded on `window.boundaryErrors` and
 * replaces the card, the way an error boundary replaces the real page.
 */
const host = window as unknown as {
  routerPushes: string[];
  routerRefreshes: number;
  boundaryErrors: string[];
};
host.routerPushes = [];
host.routerRefreshes = 0;
host.boundaryErrors = [];

export class HarnessBoundary extends Component<
  { children: ReactNode },
  { error: string | null }
> {
  state = { error: null as string | null };
  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
  componentDidCatch(error: unknown) {
    host.boundaryErrors.push(
      error instanceof Error ? error.message : String(error),
    );
  }
  render() {
    if (this.state.error) {
      return <p role="alert">Page error: {this.state.error}</p>;
    }
    return this.props.children;
  }
}
