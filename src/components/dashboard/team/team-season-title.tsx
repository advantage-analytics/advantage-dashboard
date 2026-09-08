import Link from "next/link";
import { advButton } from "@/lib/ui/adv-button";
import { formatHoursShort, secondsLeft } from "@/lib/data/usage-format";
import type { ProgramUsage } from "@/lib/data/usage-server";

/**
 * Team Home's title row — Platform Audit Ta3, in the personal Home's Pa2
 * register (`home/season-title.tsx`).
 *
 * "Team season" in 24px title type over one line of facts, with the page's
 * one primary beside it. The 30px greeting this replaces moved up into the
 * header bar, the way Pa2 moved the personal one: the page opens on the
 * numbers, so the largest type on the first screen is a statistic.
 *
 * The subline is the one part that changes with state; the title and the
 * button hold still. Three states, in the order a program meets them:
 *
 * - **Day zero.** What the page becomes once a match is in, in a sentence.
 * - **First match in, nothing analyzed.** The report is on its way — said
 *   here because the strip below is still drawing its empty shape.
 * - **In season.** "34 matches analyzed · 31 h left this month", then the
 *   "4 new results since Friday →" link into the matches list.
 */
export function TeamSeasonTitle({
  matchCount,
  analyzedCount,
  newResults,
  usage,
  awaitingReport,
  action,
}: {
  /** Every match filed, video in flight included. */
  matchCount: number;
  /** Matches a report exists for — the strip's "Matches analyzed". */
  analyzedCount: number;
  newResults: { count: number; since: string };
  usage: ProgramUsage;
  /**
   * A match is in and no report has come back yet. Decided by the page and
   * passed to both this row and the empty KPI strip, so the two cannot
   * describe the same morning differently.
   */
  awaitingReport: boolean;
  /**
   * The primary, decided by the page: a link, a disabled button while a claim
   * is in review, or nothing for a player the program has not opened uploads
   * to. The slot holds its place in every case.
   */
  action: React.ReactNode;
}) {
  const hoursLeft = (
    <>
      <span className="tabular">
        {formatHoursShort(secondsLeft(usage.usedSeconds, usage.capSeconds))}
      </span>{" "}
      h left this month
    </>
  );

  return (
    <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-end">
      <div>
        {/* The frame overrides the class's -0.4px tracking to -0.3px inline. */}
        <h1 className="text-title-lg" style={{ letterSpacing: "-0.3px" }}>
          Team season
        </h1>
        <div className="mt-[7px] flex flex-wrap items-baseline gap-3">
          {matchCount === 0 ? (
            <span className="text-body-sm" style={{ maxWidth: "66ch" }}>
              Every court, every dual, and who is moving. All of it from the
              first match.
            </span>
          ) : awaitingReport ? (
            <span className="text-body-sm">
              {matchCount === 1 ? "First report on its way" : "First reports on their way"}
              {" · "}
              {hoursLeft}
            </span>
          ) : (
            <>
              <span className="text-body-sm">
                <span className="tabular">{analyzedCount}</span>{" "}
                {analyzedCount === 1 ? "match" : "matches"} analyzed · {hoursLeft}
              </span>
              {newResults.count > 0 && (
                <Link
                  href="/dashboard/matches"
                  className="text-[11px] font-medium text-[var(--blue)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue-hover)]"
                >
                  <span className="tabular">{newResults.count}</span> new{" "}
                  {newResults.count === 1 ? "result" : "results"} since {newResults.since} →
                </Link>
              )}
            </>
          )}
        </div>
      </div>
      <div className="hidden flex-1 sm:block" />
      {action}
    </div>
  );
}

/** The primary in its three shapes, so the page states the rule once. */
export function NewMatchAction({
  canUpload,
  canSubmitVideo,
}: {
  canUpload: boolean;
  canSubmitVideo: boolean;
}) {
  if (!canUpload) return null;
  if (canSubmitVideo) {
    return (
      <Link href="/dashboard/matches/new" className={advButton("primary")}>
        New match
      </Link>
    );
  }
  // Claim still in review. The claim-review screen promises that everything
  // except sending video works now, so the control is where it will be and
  // refuses rather than disappearing.
  //
  // The reason is on screen, not in a `title`. It used to live in the setup
  // checklist's first card, which Ta3 retired; a native tooltip is not a
  // design element, is not announced on a disabled control and does not exist
  // on touch, so the only remaining statement of why the button is dead would
  // have been one most people never see.
  return (
    <div className="flex flex-col items-start gap-1.5 sm:items-end">
      <button type="button" disabled className={advButton("primary")}>
        New match
      </button>
      <span className="text-micro" style={{ maxWidth: "28ch" }}>
        Paused until we confirm the program
      </span>
    </div>
  );
}
