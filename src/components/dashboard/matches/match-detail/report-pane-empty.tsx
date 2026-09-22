"use client";

import type { ReactNode } from "react";
import { advButton } from "@/lib/ui/adv-button";

/**
 * A report view with nothing to draw: one heading, one sentence naming what
 * arrives and how, and at most one way onward. Text only — the design
 * system's rule for a region whose whole shape would otherwise be empty
 * cards ("a dashboard of empty widgets goes text-only rather than repeating
 * an icon per card"), and the same left-aligned, top-weighted shape
 * `film-unavailable-state.tsx` already gives the Video view, so the three
 * views' empties read as one family.
 *
 * Never a skeleton (nothing is arriving) and never a sample figure (a number
 * here is a claim about this match). A match still being analysed never
 * reaches this: `page.tsx` short-circuits to `MatchAnalysisProgress` first.
 */
export function ReportPaneEmpty({
  heading,
  body,
  action,
  testId,
}: {
  heading: string;
  body: ReactNode;
  action?: { label: string; onClick: () => void };
  testId?: string;
}) {
  return (
    <div
      role="status"
      data-testid={testId}
      className="flex flex-1 flex-col items-start gap-3 py-8"
    >
      <div className="flex max-w-[56ch] flex-col gap-2">
        <h2 className="text-title" style={{ fontSize: "16px" }}>
          {heading}
        </h2>
        <p
          className="text-body-sm [text-wrap:pretty]"
          style={{ color: "var(--ink-600)" }}
        >
          {body}
        </p>
      </div>
      {action ? (
        <div className="pt-1">
          <button
            type="button"
            className={advButton("ghost", "sm")}
            onClick={action.onClick}
          >
            {action.label}
          </button>
        </div>
      ) : null}
    </div>
  );
}
