"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { MessageSquare } from "lucide-react";
import { ChromeTooltip } from "@/components/dashboard/shared/chrome-tooltip";
import { useMatchReport } from "@/components/dashboard/matches/match-detail/match-report-context";
import { REPORT_VIEWS } from "@/components/dashboard/matches/match-detail/report-view";
import { askEntryHref } from "@/lib/services/ask/entry";

/**
 * The pane's title row (design 04 F1/F4/F5/F6): the view's name in display
 * type with the match facts under it on the left, the actions on the right,
 * both sitting on the facts line's baseline.
 *
 *   <MatchReport.TitleRow>
 *     <div className="min-w-0"><MatchReport.Title /><MatchReport.Facts /></div>
 *     <MatchReport.TitleActions>
 *       <MatchReport.AskLink /> <MatchReport.MoreMenu />
 *     </MatchReport.TitleActions>
 *   </MatchReport.TitleRow>
 *
 * Layout only — the parts inside decide what to draw. The left block wants
 * `min-w-0` (the frame's), so a long facts line cannot push the actions out
 * of the row.
 */
export function MatchReportTitleRow({ children }: { children: ReactNode }) {
  return <div className="flex items-end gap-2.5">{children}</div>;
}

/**
 * The page's first heading in the scroll body (DS › Title Slot), and it names
 * the active view — "Statistics", "Visualizations" or "Video" — from
 * `REPORT_VIEWS`, so it can never disagree with the rail switcher's row.
 *
 * `.text-title-lg` is 24px / 300 and already paints ink-900 — the same size as
 * Team Home's "Team season" title (`team-season-title.tsx`), so the two
 * dashboards' page titles read alike. Team Home overrides the class's −0.4px
 * tracking to −0.3px inline (the class is unlayered, so a utility would lose),
 * and this does the same.
 */
export function MatchReportTitle() {
  const { state } = useMatchReport();
  const label =
    REPORT_VIEWS.find((view) => view.value === state.view)?.label ??
    REPORT_VIEWS[0].label;

  return (
    <h1
      className="text-title-lg whitespace-nowrap"
      style={{ letterSpacing: "-0.3px" }}
    >
      {label}
    </h1>
  );
}

/**
 * "Ask about this match": one chat glyph in the title row, the sidebar's own
 * `MessageSquare` so it reads as the same Ask everywhere. On the Video view
 * the film tab has registered its drawer (`askControl`) and the glyph toggles
 * it in place, pressed while it is open; on every other view it is a link
 * into Ask with this match already tagged (`askEntryHref`,
 * `/dashboard/ask?match=…`, or the team page's when the match is read in a
 * team workspace). Icon-only, so it carries its label and the dark tooltip.
 * Absent on a read-only report (the public link, the sample match): there is
 * nothing of the reader's to ask about.
 */
export function MatchReportAskLink() {
  const { meta, askControl } = useMatchReport();
  if (meta.readOnly) return null;
  const className =
    "inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-button)] text-[var(--ink-600)] transition-colors duration-[var(--duration-hover)] hover:bg-[var(--surface-subtle)] hover:text-[var(--ink-900)] aria-pressed:bg-[var(--surface-subtle)] aria-pressed:text-[var(--ink-900)]";
  const glyph = (
    <MessageSquare className="size-4" strokeWidth={1.5} aria-hidden="true" />
  );
  if (askControl) {
    return (
      <ChromeTooltip label="Ask about this match">
        <button
          type="button"
          aria-label="Ask about this match"
          aria-pressed={askControl.open}
          aria-controls="ask-film-drawer"
          onClick={askControl.toggle}
          data-ask-about="match"
          data-testid="film-ask-open"
          className={className}
        >
          {glyph}
        </button>
      </ChromeTooltip>
    );
  }
  const href = askEntryHref(
    meta.workspaceKind === "team"
      ? { kind: "team", programId: "", programName: "" }
      : { kind: "personal" },
    { kind: "match", id: meta.matchId },
  );
  if (!href) return null;
  return (
    <ChromeTooltip label="Ask about this match">
      <Link
        href={href}
        aria-label="Ask about this match"
        data-ask-about="match"
        className={className}
      >
        {glyph}
      </Link>
    </ChromeTooltip>
  );
}

/**
 * The right end of the row: a spacer that takes the free width, then the
 * cluster of actions. Children are the actions; one that has nothing to offer
 * (Compare on a first match) renders null and the cluster closes up.
 */
export function MatchReportTitleActions({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="flex-1" />
      {/* `shrink-0`: when the title block runs long, the facts line gives up
          width (its tournament fact truncates), never the actions. */}
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </>
  );
}
