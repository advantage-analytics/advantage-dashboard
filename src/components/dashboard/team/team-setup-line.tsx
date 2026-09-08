import Link from "next/link";
import type { TeamSetupProgress } from "@/lib/data/team-home-server";

/**
 * "Getting set up · 1 of 3 · A dual on the schedule. Add a dual" — one quiet
 * line above the usage footer, in the personal Home's `SetupLine` register.
 *
 * This replaces round 45's three-card checklist. Platform Audit Ta3 has no
 * slot for a card row, and CJ asked for the personal Home's treatment: the
 * page is the thing being set up, and every region above this line already
 * shows what it will hold, so what is left to say is which of three steps
 * remain and where the next one is. Staff only — every step is a write the
 * database refuses a player.
 *
 * Renders nothing once all three are done. The line leaves once and does not
 * come back, which is what makes the populated page the end of setup rather
 * than a state somebody declares.
 */
const STEPS: ReadonlyArray<{
  key: keyof TeamSetupProgress;
  phrase: string;
  href: string;
  link: string;
}> = [
  {
    key: "roster",
    phrase: "players on the roster",
    href: "/dashboard/team/roster",
    link: "Open roster",
  },
  {
    key: "schedule",
    phrase: "a dual on the schedule",
    href: "/dashboard/team/schedule/new/dual",
    link: "Add a dual",
  },
  {
    key: "report",
    phrase: "a first match sent",
    href: "/dashboard/matches/new",
    link: "Send a match",
  },
];

export function TeamSetupLine({ setup }: { setup: TeamSetupProgress }) {
  const remaining = STEPS.filter((step) => !setup[step.key]);
  if (remaining.length === 0) return null;

  const done = STEPS.length - remaining.length;
  const next = remaining[0];
  const sentence =
    remaining.length === STEPS.length
      ? "Players on the roster, a dual on the schedule, a first match sent."
      : `${next.phrase.charAt(0).toUpperCase()}${next.phrase.slice(1)}.`;

  return (
    <div className="flex flex-wrap items-baseline gap-2.5">
      <span className="eyebrow">Getting set up</span>
      <span className="mono tabular text-[11px] text-[var(--ink-500)]">
        {done} of {STEPS.length}
      </span>
      <span className="text-micro">{sentence}</span>
      <Link
        href={next.href}
        className="rounded-sm text-[11px] font-medium text-[var(--blue)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue-hover)] focus-visible:outline-none"
      >
        {next.link}
      </Link>
    </div>
  );
}
