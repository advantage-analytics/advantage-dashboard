import Link from "next/link";
import { DayZeroOffer } from "@/components/dashboard/home/day-zero-offer";
import { advButton } from "@/lib/ui/adv-button";

/**
 * Team Home before the program has a roster, dual or match.
 *
 * The personal Home teaches its eventual page through a quiet, non-interactive
 * preview beneath one clear setup step. The normal title row, its upload CTA,
 * setup line, and usage footer stay out of this state; none is useful before
 * a team has anything to report. The preview is only the page's data regions,
 * each responsible for its own empty anatomy and copy.
 */
export function TeamDayZeroHome({
  canManage,
  children,
}: {
  /** Staff can build the team; players see the same promise without controls. */
  canManage: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col gap-4">
      <DayZeroOffer
        headline="Every court, every dual, and who is moving."
        headlineMeasure="28ch"
        actions={
          canManage ? (
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/dashboard/team/roster"
                className={advButton("primary")}
              >
                Add players
              </Link>
              <Link
                href="/dashboard/team/schedule/new/dual"
                className={advButton("ghost")}
              >
                Schedule a dual
              </Link>
            </div>
          ) : null
        }
        conditions={
          canManage
            ? "Build the roster first, then schedule a dual and send its match video for analysis."
            : "Your coaching staff build the roster, schedule duals, and send match video. Every report lands here for the team."
        }
      />

      <p className="sr-only">
        Once the program&apos;s first match is analysed, this page shows its
        season numbers, weekend dual, top movers, court record, and dual
        history. Nothing below is real data yet.
      </p>

      <div
        inert
        className="flex flex-1 flex-col gap-4"
        style={{
          WebkitMaskImage:
            "linear-gradient(180deg, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0.46) 40%, rgba(0,0,0,0.32) 100%)",
          maskImage:
            "linear-gradient(180deg, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0.46) 40%, rgba(0,0,0,0.32) 100%)",
        }}
      >
        {children}
      </div>
    </div>
  );
}
