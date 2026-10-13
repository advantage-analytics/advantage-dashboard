import Link from "next/link";
import type { TeamSetupProgress } from "@/lib/data/team-home-server";
import { SCHEDULE_ENABLED } from "@/lib/schedule/availability";

/**
 * Team Home's pointer to setup: two or three progress ticks and one blue
 * link, "Finish setup: send a first match", on the title's summary line.
 *
 * The checklist itself lives in the activity tray's "Getting set up" section
 * (`activity/activity-tray.tsx`), which is quiet by design — setup never
 * lights the tray's dot — so something on the page still has to say setup
 * exists and where the next step is. This is that, and only that.
 *
 * It was a full-width `--ink-100` bar carrying an eyebrow, a mono count, a
 * sentence and a far-right link: four grey fragments of equal weight on a
 * grey slab, which read as a disabled field, with the action a page-width
 * away from the words it belonged to. Before that it was round 45's
 * three-card checklist. The ticks are the wizard's `StepBar` colours — blue
 * for done, hairline for what is left — and the link is the title row's own
 * 11px blue link, so the line adds no surface and no second button beside
 * the row's "New match". Staff only — every step is a write the database
 * refuses a player.
 *
 * Renders nothing once every step is done. The line leaves once and does not
 * come back, which is what makes the populated page the end of setup rather
 * than a state somebody declares.
 *
 * While the Schedule is a coming-soon page (`lib/schedule/availability.ts`)
 * the dual step is dropped — there is nowhere to add one — and the line
 * counts two steps.
 */
const ALL_STEPS: ReadonlyArray<{
  key: keyof TeamSetupProgress;
  /** The step as an instruction, lower case, to follow "Finish setup: ". */
  ask: string;
  href: string;
}> = [
  {
    key: "roster",
    ask: "add players to the roster",
    href: "/dashboard/team/roster",
  },
  {
    key: "schedule",
    ask: "add a dual to the schedule",
    href: "/dashboard/team/schedule/new/dual",
  },
  {
    key: "report",
    ask: "send a first match",
    href: "/dashboard/matches/new",
  },
];
const STEPS = ALL_STEPS.filter(
  (step) => SCHEDULE_ENABLED || step.key !== "schedule",
);

export function TeamSetupLine({ setup }: { setup: TeamSetupProgress }) {
  const remaining = STEPS.filter((step) => !setup[step.key]);
  if (remaining.length === 0) return null;

  const next = remaining[0];

  return (
    <Link
      href={next.href}
      className="inline-flex items-baseline gap-2 rounded-sm text-[11px] font-medium text-[var(--blue)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue-hover)]"
    >
      <span aria-hidden="true" className="flex gap-[3px] self-center">
        {STEPS.map((step) => (
          <span
            key={step.key}
            className={`h-[3px] w-3 rounded-full ${
              setup[step.key] ? "bg-[var(--blue)]" : "bg-[var(--border-medium)]"
            }`}
          />
        ))}
      </span>
      <span>
        Finish setup: {next.ask}
        <span className="sr-only">
          , step {STEPS.length - remaining.length + 1} of {STEPS.length}
        </span>{" "}
        →
      </span>
    </Link>
  );
}
