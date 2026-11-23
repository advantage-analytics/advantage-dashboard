import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { LiveDots } from "@/components/ui/live-dots";
import { PILOT_ENDS_AT } from "@/lib/services/splitstep/config";
import { isUnlimitedCap } from "@/lib/data/usage-format";
import { utcToday } from "@/lib/data/match-day";

/** Inside this many days of the end, the card says so. */
const ENDING_SOON_DAYS = 14;
const DAY_MS = 86_400_000;

/** Whole days from today (UTC) to the pilot's last day; negative once over. */
export function pilotDaysLeft(today: string = utcToday()): number {
  return Math.round(
    (Date.parse(`${PILOT_ENDS_AT}T00:00:00Z`) -
      Date.parse(`${today}T00:00:00Z`)) /
      DAY_MS,
  );
}

const endDay = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  timeZone: "UTC",
})
  .format(new Date(`${PILOT_ENDS_AT}T00:00:00Z`))
  // "December 31" never breaks across two lines of the card.
  .replace(" ", " ");

/**
 * The pilot card in the Home's rail, in the pilot dialog's own treatment: one
 * figure at display size — the hours of analysis left this month — and the
 * rest as a quiet line beneath: when the pilot ends, how many days that is,
 * and how many matches have a report. The whole card opens Usage.
 *
 * Inside the last two weeks a sentence says what happens next. Once the pilot
 * is over it draws nothing.
 */
export function PilotCard({
  eyebrow,
  usedSeconds,
  capSeconds,
  creditSeconds = 0,
  analyzed,
  today,
}: {
  /** "Centennial High School · Pilot" */
  eyebrow: string;
  usedSeconds: number;
  capSeconds: number;
  creditSeconds?: number;
  /** Matches with a finished report. */
  analyzed: number;
  today?: string;
}) {
  const daysLeft = pilotDaysLeft(today);
  if (daysLeft < 0) return null;
  const unlimited = isUnlimitedCap(capSeconds);
  const hoursLeft = Math.max(
    0,
    Math.floor((capSeconds - usedSeconds + creditSeconds) / 3600),
  );
  const ending = daysLeft <= ENDING_SOON_DAYS;
  return (
    <Link
      href="/dashboard/settings/usage"
      aria-label="Advantage pilot: see usage"
      className="brand-mesh-gradient group @container relative flex h-full min-h-[214px] overflow-hidden rounded-[var(--radius-card)] text-white shadow-[0_1px_2px_rgba(59,130,246,0.35)] transition-shadow duration-[var(--duration-hover)] hover:shadow-[0_6px_18px_rgba(59,130,246,0.35)] focus-visible:shadow-[0_0_0_2px_rgba(59,130,246,0.6)] focus-visible:outline-none"
    >
      <LiveDots />
      <span className="absolute top-5 right-6 z-[1] flex items-center gap-1 text-[12px] leading-4 font-medium underline-offset-[3px] group-hover:underline group-focus-visible:underline">
        See usage
        <ChevronRight aria-hidden strokeWidth={1.5} className="size-3" />
      </span>
      <span className="relative flex w-full flex-col px-6 py-5">
        <span className="text-[12px] leading-4 text-white/[0.88]">
          {eyebrow}
        </span>
        {/* The figure and the facts sit together at the foot of the card,
            so a taller card adds air above them, never between them. */}
        <span className="mt-auto flex flex-col gap-3 pt-5">
          {unlimited ? (
            // No cap means no figure worth setting large: the offer itself is
            // the headline, as a whole sentence, and the allowance follows.
            <span className="flex flex-col gap-1.5">
              <b className="text-[28px] leading-[1.1] font-light tracking-[-0.6px]">
                Free while we build.
              </b>
              <span className="text-[13px] leading-[18px] text-white/[0.88]">
                Unlimited match video analysis, every month.
              </span>
            </span>
          ) : (
            <span className="flex items-end gap-3">
              <b className="tabular text-[56px] leading-[0.85] font-light tracking-[-2px]">
                {hoursLeft}
              </b>
              <span className="pb-[3px] text-[13px] leading-[1.35] text-white/[0.88]">
                {hoursLeft === 1 ? "hour" : "hours"} of match video
                <br />
                analysis left this month
              </span>
            </span>
          )}
          {ending ? (
            <span className="text-[12px] leading-[1.5] text-white/90">
              Paid plans start in January 2027, and we’ll tell you before
              anything changes.
            </span>
          ) : null}
        </span>
        <span className="mt-5 flex gap-5 border-t border-white/25 pt-3 text-[12px] leading-4 whitespace-nowrap text-white/90">
          <span>Free until {endDay}</span>
          {/* The date already says when: on the narrowed rail the count of
              days gives way so nothing is clipped. */}
          <span className="@max-[380px]:hidden">
            {daysLeft === 0
              ? "Ends today"
              : `${daysLeft} ${daysLeft === 1 ? "day" : "days"} left`}
          </span>
          <span>
            {analyzed} {analyzed === 1 ? "match" : "matches"} analyzed
          </span>
        </span>
      </span>
    </Link>
  );
}
