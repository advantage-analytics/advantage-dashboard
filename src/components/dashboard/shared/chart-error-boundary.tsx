"use client";

import { Component, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

interface ChartErrorBoundaryProps {
  children: ReactNode;
  /** Match the chart's rendered height so the fallback preserves card layout. */
  minHeight: number | string;
  /** Short hint under the headline. Defaults to "Refresh to retry." */
  hint?: string;
}

interface ChartErrorBoundaryState {
  hasError: boolean;
}

export class ChartErrorBoundary extends Component<
  ChartErrorBoundaryProps,
  ChartErrorBoundaryState
> {
  state: ChartErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ChartErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error): void {
    if (process.env.NODE_ENV !== "production") {
      console.error("[ChartErrorBoundary]", error);
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          className="w-full flex flex-col items-center justify-center gap-2 rounded-[12px] bg-[var(--color-surface-muted)] px-4"
          style={{ minHeight: this.props.minHeight }}
        >
          <AlertTriangle
            aria-hidden="true"
            className="w-4 h-4 text-[var(--color-text-dim)]"
            strokeWidth={1.5}
          />
          <p className="text-[11px] font-normal text-[var(--color-text-secondary)] leading-[16px] text-center">
            Chart unavailable
          </p>
          <p className="text-[10px] font-normal text-[var(--color-text-dim)] leading-[15px] text-center">
            {this.props.hint ?? "Refresh to retry."}
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
