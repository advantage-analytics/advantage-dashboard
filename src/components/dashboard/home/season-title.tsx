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
 * The subline is the one part that changes with state; the title and the
 * button hold still — round 45's "the frame never moves", carried over from
 * Team Home. Three states, in the order a new player meets them:
 *
 * - **Day zero.** What this page will become once a match is in, in one
 *   sentence, because nothing below it can show that yet.
 * - **First match in, nothing analysed.** The report is on its way. Said here
 *   because the KPI strip stays off the page until a number is honest, so
 *   without this line the moment between sending and reading would look like
 *   the page had nothing to say about the match it just took.
 * - **Mid-season.** "12 matches analyzed · 5.5 h left this month", then the
 *   "N new report →" link.
 *
 * The button is the design system's `Button variant="primary" size="md"`,
 * which `advButton()` transcribes — label only, no leading icon. It is the
 * same button Team Home and the Matches title row render for the same action.
 */
export function SeasonTitle({
  hasMatches,
  matchCount,
  analyzedMatchCount,
  usage,
  userId,
}: {
  hasMatches: boolean;
  /** Every match filed, including video still in the pipeline. */
  matchCount: number;
  /** `OverallPerformanceData.analyzedMatchCount` — matches a report exists for. */
  analyzedMatchCount: number;
  usage: PersonalUsage;
  userId: string;
}) {
  // Clamped like the footer: an over-spend is a quota bug, not the viewer's
  // problem, and "-2 h left" would report it as one.
  const leftSeconds = Math.max(0, usage.capSeconds - usage.usedSeconds);
  const hoursLeft = (
    <>
      <span className="tabular">{formatHoursShort(leftSeconds)}</span> h left this month
    </>
  );

  const awaitingFirstReport = hasMatches && analyzedMatchCount === 0 && matchCount > 0;

  return (
    <div className="flex items-end gap-4">
      <div>
        {/* The frame overrides the class's -0.4px tracking to -0.3px inline. */}
        <h1 className="text-title-lg" style={{ letterSpacing: "-0.3px" }}>
          Your season
        </h1>
        <div className="mt-[7px] flex items-baseline gap-3">
          {!hasMatches ? (
            // The product's voice rather than an instruction: the button beside
            // it and the matches card below both already say what to do, and
            // every region under this line is present and labelled with what
            // it will hold. What is left for the opening line is what all of
            // it adds up to.
            <span className="text-body-sm" style={{ maxWidth: "66ch" }}>
              Every serve, every point, and one thing to work on. All of it from
              one match.
            </span>
          ) : awaitingFirstReport ? (
            <span className="text-body-sm">
              {matchCount === 1 ? "First report on its way" : "First reports on their way"}
              {" · "}
              {hoursLeft}
            </span>
          ) : (
            <>
              <span className="text-body-sm">
                <span className="tabular">{analyzedMatchCount}</span>{" "}
                {analyzedMatchCount === 1 ? "match" : "matches"} analyzed · {hoursLeft}
              </span>
              <NewReportsSubline userId={userId} fallback="" />
            </>
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
