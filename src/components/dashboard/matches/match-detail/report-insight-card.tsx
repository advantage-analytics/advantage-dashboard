"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, ChevronDown, ChevronUp } from "lucide-react";
import { ChromeTooltip } from "@/components/dashboard/shared/chrome-tooltip";
import { useMatchReport } from "@/components/dashboard/matches/match-detail/match-report-context";
import { splitInsight } from "@/components/dashboard/matches/match-detail/insight-text";

/**
 * The Advantage Intelligence insight at the top of the Statistics view
 * (design 04 F2 expanded, F3 collapsed), successor to the rail's
 * `RailInsightCard`.
 *
 * It shows the viewer's own `meta.summary` and nothing else. That string
 * arrives already picked by side in `page.tsx` (guardrails §4), so neither
 * variant chooses a player. The claim is its first sentence and the evidence
 * is the rest, split by `splitInsight`. Nothing is invented and no figure is
 * emphasised (spec › Decisions 4).
 *
 * Two explicit variants rather than a `collapsed` flag on one component.
 * Collapse is this visit's state, owned by the provider; there is no dismiss
 * (spec › Decisions 5), so the summary can be folded away but always returns.
 */
export function MatchReportInsight() {
  const { state, meta } = useMatchReport();
  // No summary means no card, not an empty one. An empty string counts as no
  // summary too.
  if (!meta.summary) return null;

  return state.insight === "collapsed" ? (
    <InsightCollapsed />
  ) : (
    <InsightExpanded />
  );
}

/**
 * The card spans the pane, so its edges line up with the widgets row below;
 * its text does not run the full width.
 *
 * From 720px of pane (the `@container` on `MatchReport.Pane`) it is two
 * columns. The narrow one holds the claim at the title step (16px, the DS
 * InsightCard's short falsifiable line) with a foot row under it: the engine
 * credit and Collapse, pinned to the column's bottom so the column ends where
 * the evidence ends. The wide one holds the evidence at 12px, which keeps a
 * 600-character summary to a short block. Below 720px everything stacks as
 * claim, evidence, foot row, the same order as the DOM and the tab order.
 */
export function InsightExpanded() {
  const { actions, meta } = useMatchReport();
  if (!meta.summary) return null;
  const { claim, evidence } = splitInsight(meta.summary);

  return (
    <section
      aria-label="Advantage Intelligence summary"
      className="grid shrink-0 grid-cols-1 gap-x-8 gap-y-3 rounded-[var(--radius-card)] border border-[var(--border-hairline)] bg-[var(--surface-card)] p-[16px_20px] shadow-[var(--shadow-card)] @min-[720px]:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] @min-[720px]:grid-rows-[auto_1fr] @min-[720px]:gap-y-4"
    >
      {/* `.text-title` is the scale's 16px step: 400, 1.5, −0.4px, ink-900. */}
      <p className="text-title [text-wrap:balance] @min-[720px]:col-start-1 @min-[720px]:row-start-1">
        {claim}
        {!evidence && (
          <>
            {" "}
            <WhyThisLink />
          </>
        )}
      </p>

      {evidence && (
        // `pt-[3px]` sets the 12px evidence's first line level with the
        // 16px claim's when the two sit side by side.
        <p className="text-[12px] leading-[1.65] [text-wrap:pretty] text-[var(--ink-700)] @min-[720px]:col-start-2 @min-[720px]:row-span-2 @min-[720px]:row-start-1 @min-[720px]:pt-[3px]">
          {evidence} <WhyThisLink />
        </p>
      )}

      <div className="flex items-center gap-[7px] @min-[720px]:col-start-1 @min-[720px]:row-start-2 @min-[720px]:self-end">
        <InsightMark />
        {/* `.text-micro` already paints ink-500, which is the credit's colour. */}
        <span className="text-micro">Advantage Intelligence</span>
        <div className="flex-1" />
        <ChromeTooltip label="Collapse summary" side="top">
          <button
            type="button"
            aria-label="Collapse summary"
            aria-expanded="true"
            onClick={actions.collapseInsight}
            className="-my-1 inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-element)] text-[var(--ink-400)] transition-colors duration-200 hover:bg-[var(--surface-subtle)] hover:text-[var(--ink-700)]"
          >
            <ChevronUp
              className="size-3.5"
              strokeWidth={1.5}
              aria-hidden="true"
            />
          </button>
        </ChromeTooltip>
      </div>
    </section>
  );
}

/**
 * F3: one 44px line holding the mark, the claim cut to one line, then Show
 * (the only blue). Collapse is session state that starts at "expanded", so
 * this variant only appears after the player collapses the card this visit.
 *
 * `shrink-0`: the row is a fixed 44px tall, and once the Statistics view
 * overflows the scrolling pane a flex column would squeeze it to its ~20px
 * line of content.
 */
export function InsightCollapsed() {
  const { actions, meta } = useMatchReport();
  if (!meta.summary) return null;
  const { claim } = splitInsight(meta.summary);

  return (
    <section
      aria-label="Advantage Intelligence summary"
      className="flex h-11 shrink-0 items-center gap-2.5 rounded-[var(--radius-card)] border border-[var(--border-hairline)] bg-[var(--surface-card)] pr-3 pl-5 shadow-[var(--shadow-card)]"
    >
      {/* No credit line here, so the mark names the engine for a screen reader. */}
      <InsightMark label="Advantage Intelligence" />
      <p className="min-w-0 flex-1 truncate text-[13px] text-[var(--ink-700)]">
        {claim}
      </p>
      <button
        type="button"
        aria-expanded="false"
        onClick={actions.expandInsight}
        className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-[var(--radius-element)] px-2 py-1 text-[11px] font-medium whitespace-nowrap text-[var(--blue)] transition-colors duration-200 hover:text-[var(--blue-hover)]"
      >
        Show
        <ChevronDown
          className="size-3.5"
          strokeWidth={1.5}
          aria-hidden="true"
        />
      </button>
    </section>
  );
}

/**
 * The engine mark at the size F2 and F3 draw it beside small text: a 16px
 * ink-900 square with the 9×6 swoosh inverted to white (the frame's
 * `logo-mark.svg` is `/logos/logo3.svg` here, as on Home's Focus card). With a
 * `label` the mark is an image that names the engine; without one it is
 * decoration beside the visible credit.
 */
function InsightMark({ label }: { label?: string }) {
  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className="flex size-4 shrink-0 items-center justify-center rounded-[3px] bg-[var(--ink-900)]"
    >
      <Image
        src="/logos/logo3.svg"
        alt=""
        width={9}
        height={6}
        className="brightness-0 invert"
        aria-hidden="true"
      />
    </span>
  );
}

/**
 * The inline link at the end of the evidence, or the claim when a summary is
 * one sentence. `/dashboard/ask` is the retired rail card's destination. A
 * blue word rests on `--blue` and hovers to `--blue-hover`
 * (foundations › Text Colors). It is a text link, so it gets no tooltip.
 */
function WhyThisLink() {
  return (
    <Link
      href="/dashboard/ask"
      className="text-[12px] font-medium tracking-normal whitespace-nowrap text-[var(--blue)] transition-colors duration-200 hover:text-[var(--blue-hover)]"
    >
      Why this
      <ArrowUpRight
        className="ml-[3px] inline-block size-3 align-[-1px]"
        strokeWidth={1.5}
        aria-hidden="true"
      />
    </Link>
  );
}
