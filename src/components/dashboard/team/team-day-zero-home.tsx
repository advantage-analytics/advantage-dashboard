import Link from "next/link";
import { DayZeroOffer } from "@/components/dashboard/home/day-zero-offer";
import { advButton } from "@/lib/ui/adv-button";
import { SCHEDULE_ENABLED } from "@/lib/schedule/availability";

/**
 * Team Home before the program has a roster, dual or match.
 *
 * The personal Home teaches its eventual page through a quiet, non-interactive
 * preview beneath one clear setup step. The normal title row, its upload CTA,
 * setup line, and usage footer stay out of this state; none is useful before
 * a team has anything to report. The preview is only the page's data regions,
 * each responsible for its own empty anatomy and copy.
 *
 * While the Schedule is a coming-soon page (`lib/schedule/availability.ts`)
 * the offer promises no duals and offers no "Schedule a dual": the preview
 * below draws no dual cards, and the button would land on the stub.
 *
 * "Add players" lands on the Roster with Add player already open (`?add=player`,
 * read by `RosterHeaderButtons`) — the dialog needs the roster's seats and
 * names, and the row it makes should be what the coach sees next, so it opens
 * there rather than here; but the button said what it does, so it is one click.
 *
 * The ghost slot is "Upload a match" while the Schedule is off. An empty
 * roster used to make that a dead end; staff can now add themselves as a
 * player from the wizard's For menu, so it leads somewhere. It stays the
 * ghost: for most programs the roster comes first. One ghost only — when the
 * Schedule returns, "Schedule a dual" takes the slot back.
 */
export function TeamDayZeroHome({
  canManage,
  canUpload,
  children,
}: {
  /**
   * `canUploadForProgram()` for this viewer — the upload policy may be
   * narrower than "staff", and a button that refuses on the next page is worse
   * than no button.
   */
  canUpload: boolean;
  /** Staff can build the team; players see the same promise without controls. */
  canManage: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col gap-4">
      <DayZeroOffer
        headline={
          SCHEDULE_ENABLED
            ? "Every court, every dual, and who is moving."
            : "Every match, every player, and who is moving."
        }
        headlineMeasure="28ch"
        actions={
          canManage ? (
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/dashboard/team/roster?add=player"
                className={advButton("primary")}
              >
                Add players
              </Link>
              {SCHEDULE_ENABLED ? (
                <Link
                  href="/dashboard/team/schedule/new/dual"
                  className={advButton("ghost")}
                >
                  Schedule a dual
                </Link>
              ) : canUpload ? (
                <Link
                  href="/dashboard/matches/new"
                  className={advButton("ghost")}
                >
                  Upload a match
                </Link>
              ) : null}
            </div>
          ) : null
        }
        conditions={
          SCHEDULE_ENABLED
            ? canManage
              ? "Build the roster first, then schedule a dual and send its match video for analysis."
              : "Your coaching staff build the roster, schedule duals, and send match video. Every report lands here for the team."
            : canManage
              ? canUpload
                ? "Build the roster, then send a match for analysis. If you play too, add yourself as a player when you upload."
                : "Build the roster first, then send a match for analysis."
              : "Your coaching staff build the roster and send match video. Every report lands here for the team."
        }
      />

      <p className="sr-only">
        {SCHEDULE_ENABLED
          ? "Once the program's first match is analysed, this page shows its season numbers, weekend dual, top movers, court record, and dual history. Nothing below is real data yet."
          : "Once the program's first match is analysed, this page shows its season numbers, top movers, and program insight. Nothing below is real data yet."}
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
