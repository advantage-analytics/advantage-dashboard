"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, ChevronUp } from "lucide-react";
import { ChromeTooltip } from "@/components/dashboard/shared/chrome-tooltip";
import { useMatchReport } from "@/components/dashboard/matches/match-detail/match-report-context";
import { splitInsight } from "@/components/dashboard/matches/match-detail/insight-text";

/**
 * The Advantage Intelligence insight at the top of the Statistics view
 * (design 04 F2 expanded, F3 collapsed, F4 dismissed), successor to the rail's
 * `RailInsightCard`.
 *
 * It shows the viewer's own `meta.summary` and nothing else. That string
 * arrives already picked by side in `page.tsx` (guardrails §4), so neither
 * variant chooses a player. The claim is its first sentence and the evidence
 * is the rest, split by `splitInsight`. Nothing is invented and no figure is
 * emphasised (spec › Decisions 4): F2 paints its "46%" ink-900, but no data
 * says which figure in a summary is the decisive one.
 *
 * Two explicit variants rather than a `collapsed` flag on one component.
 * Each reads `useMatchReport()` itself, so this part only picks which one
 * shows. Collapse is this visit's state and dismissal is the permanent
 * per-match key, both owned by the provider (spec › Decisions 5).
 */
export function MatchReportInsight() {
  const { state, meta } = useMatchReport();
  // No summary means no card, not an empty one. An empty string counts as no
  // summary too. Dismissed (F4) draws nothing, and the widgets follow the
  // title row at the pane's 16px gap with nothing marking the space.
  if (!meta.summary || state.insight === "dismissed") return null;

  return state.insight === "collapsed" ? (
    <InsightCollapsed />
  ) : (
    <InsightExpanded />
  );
}

/**
 * F2: the claim, the evidence ending in "Why this", then the credit line and
 * both exits, on the `.surface-card` equivalent F2 and F3 both draw. The
 * exits are always visible. F2 does not use `.ins-c`'s hover rule
 * (`helmet-style.css`), so nothing appears on hover or focus-within.
 */
export function InsightExpanded() {
  const { actions, meta } = useMatchReport();
  if (!meta.summary) return null;
  const { claim, evidence } = splitInsight(meta.summary);

  return (
    <div className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-[var(--border-hairline)] bg-[var(--surface-card)] p-[16px_18px_12px] shadow-[var(--shadow-card)]">
      {/* A 15px claim sits between the scale's 14 and 16 steps. F2 draws
          15px, and the frame wins over the DS (the conflict is recorded
          where scripts/check-design-drift.mjs seeds its `size` count). */}
      <p className="max-w-[62ch] text-[15px] leading-[1.35] font-light [text-wrap:pretty] text-[var(--ink-900)]">
        {claim}
        {!evidence && (
          <>
            {" "}
            <WhyThisLink />
          </>
        )}
      </p>

      {evidence && (
        <p className="max-w-[86ch] text-[12px] leading-[1.65] [text-wrap:pretty] text-[var(--ink-600)]">
          {evidence} <WhyThisLink />
        </p>
      )}

      <div className="flex items-center gap-[7px] border-t border-[var(--border-hairline)] pt-2">
        <InsightMark />
        {/* `.text-micro` already paints ink-500, which is the credit's colour. */}
        <span className="text-micro">Advantage Intelligence</span>
        <div className="flex-1" />
        {/* F2 groups the two exits 12px apart inside the 7px footer. */}
        <div className="flex items-center gap-3">
          <InsightDismissButton />
          <ChromeTooltip label="Collapse" side="top">
            <button
              type="button"
              aria-label="Collapse"
              onClick={actions.collapseInsight}
              className="inline-flex size-[22px] shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-element)] text-[var(--ink-400)] transition-colors duration-200 hover:bg-[var(--surface-subtle)] hover:text-[var(--ink-700)]"
            >
              <ChevronUp
                className="size-3.5"
                strokeWidth={1.5}
                aria-hidden="true"
              />
            </button>
          </ChromeTooltip>
        </div>
      </div>
    </div>
  );
}

/**
 * F3: one 44px line holding the mark, the claim cut to one line, then Show
 * (the only blue) and Dismiss (still reachable).
 *
 * Hydration: `useInsightDismissal`'s server snapshot reads "dismissed". The
 * server markup and the hydration render therefore both draw no card, and
 * this card (like `InsightExpanded`) mounts just after hydration, once the
 * real localStorage value is read. That is accepted, not a bug. It is what
 * keeps a card the player already dismissed from flashing in and back out.
 * Collapse is session state that starts at "expanded", so this variant only
 * appears after the player collapses the card during this visit.
 *
 * `shrink-0`: this card is a fixed 44px tall, and a flex item's automatic
 * minimum height is the smaller of that and its ~20px line of content. Once
 * the Statistics view overflows the scrolling pane, the flex column would
 * squeeze the card to that line. The expanded card has no fixed height, so
 * its content is already its floor.
 */
export function InsightCollapsed() {
  const { actions, meta } = useMatchReport();
  if (!meta.summary) return null;
  const { claim } = splitInsight(meta.summary);

  return (
    <div className="flex h-11 shrink-0 items-center gap-2.5 rounded-[var(--radius-card)] border border-[var(--border-hairline)] bg-[var(--surface-card)] px-[18px] shadow-[var(--shadow-card)]">
      {/* No credit line here, so the mark names the engine for a screen reader. */}
      <InsightMark label="Advantage Intelligence" />
      <p className="min-w-0 flex-1 truncate text-[13px] text-[var(--ink-700)]">
        {claim}
      </p>
      <button
        type="button"
        onClick={actions.expandInsight}
        className="cursor-pointer text-[11px] font-medium whitespace-nowrap text-[var(--blue)] transition-colors duration-200 hover:text-[var(--blue-hover)]"
      >
        Show
      </button>
      <span
        aria-hidden="true"
        className="mx-0.5 h-3.5 w-px shrink-0 bg-[var(--border-hairline)]"
      />
      <InsightDismissButton />
    </div>
  );
}

/**
 * The engine mark at the size F2 and F3 draw it: a 16px ink-900 square with
 * the 9×6 swoosh inverted to white (the frame's `logo-mark.svg` is
 * `/logos/logo3.svg` here, as in the retired rail card). DS `EngineChip` is
 * 20px with a 12×8 mark. The frame wins, and the spec records the conflict.
 * With a `label` the mark is an image that names the engine; without one it
 * is decoration beside the visible credit.
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

/** Permanent for this match: the provider writes the existing dismissal key. */
function InsightDismissButton() {
  const { actions } = useMatchReport();
  return (
    <button
      type="button"
      onClick={actions.dismissInsight}
      className="cursor-pointer text-[11px] font-medium whitespace-nowrap text-[var(--ink-500)] transition-colors duration-200 hover:text-[var(--ink-900)]"
    >
      Dismiss
    </button>
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
      className="text-[11px] font-medium whitespace-nowrap text-[var(--blue)] transition-colors duration-200 hover:text-[var(--blue-hover)]"
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
