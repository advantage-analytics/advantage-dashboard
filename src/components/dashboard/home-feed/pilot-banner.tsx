import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { LiveDots } from "@/components/ui/live-dots";
import { PILOT_ENDS_AT } from "@/lib/services/splitstep/config";
import { isUnlimitedCap } from "@/lib/data/usage-format";
import { utcToday } from "@/lib/data/match-day";

/** Inside this many days of the end, the banner says so. */
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
  // "December 31" never breaks across two lines of the banner.
  .replace(" ", "\u00A0");

function Digits({ value }: { value: string }) {
  return (
    <span className="flex gap-[3px]" aria-hidden>
      {[...value].map((char, i) => (
        <span
          key={i}
          className="tabular relative flex h-7 w-[22px] items-center justify-center rounded-[5px] bg-white/[0.18] text-[16px] font-light shadow-[inset_0_-1px_0_rgba(255,255,255,0.12),0_1px_2px_rgba(13,13,13,0.08)] after:absolute after:inset-x-0 after:top-1/2 after:h-px after:bg-[rgba(13,13,13,0.08)]"
        >
          {char}
        </span>
      ))}
    </span>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <Digits value={value} />
      <span className="text-[10px] whitespace-nowrap text-white/85">
        <span className="sr-only">{value} </span>
        {label}
      </span>
    </div>
  );
}

/**
 * The pilot banner both Homes open on: the offer on the left, the three
 * figures that change — days left, hours left this month, matches analyzed —
 * on the right, and the way into Usage.
 *
 * It carries the pilot's own end too: inside the last two weeks the headline
 * becomes the date and the sentence says what happens next. Once the pilot is
 * over it draws nothing.
 */
export function PilotBanner({
  recipient,
  eyebrow,
  usedSeconds,
  capSeconds,
  creditSeconds = 0,
  analyzed,
  today,
}: {
  /** Who gets the hours: the program's name, or "Your account". */
  recipient: string;
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
  const capHours = Math.round(capSeconds / 3600);
  const hoursLeft = Math.max(
    0,
    Math.floor((capSeconds - usedSeconds + creditSeconds) / 3600),
  );
  const ending = daysLeft <= ENDING_SOON_DAYS;
  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <section
      aria-label="Advantage pilot"
      className="brand-mesh-gradient relative overflow-hidden rounded-[var(--radius-card)] text-white shadow-[0_1px_2px_rgba(59,130,246,0.35)]"
    >
      <LiveDots />
      <div className="relative flex min-h-[108px] items-center gap-10 py-3.5 pr-5 pl-6">
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="mb-1.5 text-[12px] leading-4 text-white/[0.88]">
            {eyebrow}
          </span>
          <h2 className="mb-1.5 text-[24px] leading-[1.1] font-light tracking-[-0.4px]">
            {ending ? `Free through ${endDay}.` : "Free while we build."}
          </h2>
          <p className="max-w-[72ch] text-[12px] leading-[1.5] text-white/90">
            {ending
              ? `The pilot ends ${daysLeft === 0 ? "today" : `in ${daysLeft} ${daysLeft === 1 ? "day" : "days"}`}. Paid plans start in January 2027, and we’ll tell you before anything changes.`
              : unlimited
                ? `${recipient} has unlimited match video analysis, free until ${endDay}.`
                : `${recipient} gets ${capHours} hours of match video analysis a month, free until ${endDay}.`}
          </p>
        </div>
        <div
          role="group"
          aria-label="Pilot at a glance"
          className="flex shrink-0 items-start gap-5"
        >
          <Stat value={pad(daysLeft)} label="Days left" />
          <Stat
            value={unlimited ? "∞" : pad(hoursLeft)}
            label="Hours left this month"
          />
          <Stat
            value={pad(analyzed)}
            label={analyzed === 1 ? "Match analyzed" : "Matches analyzed"}
          />
          <span aria-hidden className="mx-1 h-7 w-px bg-white/30" />
          <div className="flex flex-col items-center gap-2">
            <Link
              href="/dashboard/settings/usage"
              className="flex h-7 items-center gap-1 rounded-[var(--radius-cell)] text-[12px] font-medium text-white underline-offset-[3px] hover:underline focus-visible:shadow-[0_0_0_2px_rgba(255,255,255,0.7)] focus-visible:outline-none"
            >
              See usage
              <ChevronRight aria-hidden strokeWidth={1.5} className="size-3" />
            </Link>
            <span className="text-[10px] whitespace-nowrap text-white/85">
              Resets on the 1st
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
