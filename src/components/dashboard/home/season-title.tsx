import Link from "next/link";
import { NewReportsSubline } from "@/components/dashboard/home/new-reports-subline";
import { advButton } from "@/lib/ui/adv-button";
import { formatHoursShort } from "@/lib/data/usage-format";
import type { PersonalUsage } from "@/lib/data/usage-server";

/**
 * The personal Home's title row — Platform Audit Pa2.
 *
 * "Your season" in 24px title type over one line of facts, with the page's one
 * primary beside it. This replaced the 30px greeting when Pa2 moved the
 * greeting into the header bar: the page now opens on the numbers, "so the
 * largest type on the first screen is a statistic, not a salutation".
 *
 * The subline is the one part that changes with state. With matches in it
 * reads "12 matches analyzed · 5.5 h left this month", then the "N new report
 * →" link; on day zero it is the sentence that tells a new player what this
 * page is for. The title and the button hold still either way — round 45's
 * "the frame never moves", carried over from Team Home.
 *
 * The button is the design system's `Button variant="primary" size="md"`,
 * which `advButton()` transcribes — label only, no leading icon. It is the
 * same button Team Home and the Matches title row render for the same action.
 */
export function SeasonTitle({
  hasMatches,
  analyzedMatchCount,
  usage,
  userId,
}: {
  hasMatches: boolean;
  /** `OverallPerformanceData.analyzedMatchCount` — matches a report exists for. */
  analyzedMatchCount: number;
  usage: PersonalUsage;
  userId: string;
}) {
  // Clamped like the footer: an over-spend is a quota bug, not the viewer's
  // problem, and "-2 h left" would report it as one.
  const leftSeconds = Math.max(0, usage.capSeconds - usage.usedSeconds);

  return (
    <div className="flex items-end gap-4">
      <div>
        {/* The frame overrides the class's -0.4px tracking to -0.3px inline. */}
        <h1 className="text-title-lg" style={{ letterSpacing: "-0.3px" }}>
          Your season
        </h1>
        <div className="mt-[7px] flex items-baseline gap-3">
          {hasMatches ? (
            <>
              <span className="text-body-sm">
                <span className="tabular">{analyzedMatchCount}</span>{" "}
                {analyzedMatchCount === 1 ? "match" : "matches"} analyzed ·{" "}
                <span className="tabular">{formatHoursShort(leftSeconds)}</span> h
                left this month
              </span>
              <NewReportsSubline userId={userId} fallback="" />
            </>
          ) : (
            <span className="text-body-sm">
              Send a match and the analysis comes back to this page.
            </span>
          )}
        </div>
      </div>
      <div className="flex-1" />
      <Link href="/dashboard/matches/new" className={advButton("primary")}>
        New match
      </Link>
    </div>
  );
}
