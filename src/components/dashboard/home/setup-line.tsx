import Link from "next/link";
import { setupSteps, type SetupFacts } from "@/lib/onboarding/tours";

/**
 * Account state, one line above the usage footer.
 *
 * It was a two-row checklist in the right column until the serve card took
 * that column.
 * That column is what the analysis will say; a list of profile fields is
 * neither analysis nor news, and it was the loudest thing on a page whose
 * subject is a match that has not happened yet. As one line it still says
 * exactly what is outstanding and still opens the page that fixes it.
 *
 * The steps are `setupSteps(facts)` (`src/lib/onboarding/tours.ts`): the two
 * report tours first, then playing profile and preferences. Every fact is read
 * back out of the database on the server — none is a local flag, a dismissal
 * or a "seen it" bit, which is what lets the line be right on a second device
 * and after a sign-out. An account with more than one finished match counts
 * both tours as done, so a veteran's line names only profile and preferences
 * (its count reads "2 of 4", not the old "0 of 2").
 *
 * "Get your first match in" is deliberately not one of them. The page's one
 * primary button is that step, twice over — in the title row and in the
 * matches card — and a third ask in link type would be outranked by both.
 *
 * The line names the NEXT outstanding step only, in that step's own words,
 * with the link that finishes it. Four steps written into one sentence read
 * as a form to fill in, not a line.
 *
 * Nothing outstanding, nothing rendered — the same rule the checklist had:
 * it leaves once, whole, rather than shedding rows as they complete. Day zero
 * never reaches here: `(home)/page.tsx` returns `HomeDayZeroPage` first.
 */
export function SetupLine({ facts }: { facts: SetupFacts }) {
  const steps = setupSteps(facts);
  const next = steps.find((step) => !step.done);
  if (!next) return null;

  const done = steps.filter((step) => step.done).length;

  return (
    <div className="flex items-baseline gap-2.5">
      <span className="eyebrow">Getting set up</span>
      <span className="mono tabular text-[11px] text-[var(--ink-500)]">
        {done} of {steps.length}
      </span>
      <span className="text-micro">{next.label}.</span>
      <Link
        href={next.href}
        className="rounded-sm text-[11px] font-medium text-[var(--blue)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue-hover)] focus-visible:outline-none"
      >
        {next.link}
      </Link>
    </div>
  );
}
