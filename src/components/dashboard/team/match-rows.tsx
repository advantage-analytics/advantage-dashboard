import Link from "next/link";
import {
  isAnalysisFailed,
  isAnalysisReady,
  isWorking,
  type AnalysisStatus,
} from "@/lib/data/match-analysis";
import type { TeamMatchRow } from "@/lib/data/team-home-server";

/**
 * F8 — what has come back, as rows.
 *
 * Onboarding is over when this table has something in it, which is why F6's
 * three cards have no "skip": they are dismissed by producing a row here.
 *
 * The status word is the product's own — `ANALYSIS_LABEL`, the same vocabulary
 * the matches list and the match page use. A second set of words for the same
 * five states is how "Analyzing" and "Analyzed" end up meaning different things
 * on different screens.
 */

const ROW =
  "grid gap-3 px-[18px] py-3.5 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_150px_120px] sm:items-center sm:gap-4";

/** One dot, four meanings: running, done, broken, or nothing is happening. */
function dotColor(status: AnalysisStatus): string {
  if (isAnalysisFailed(status)) return "#E51837";
  if (isAnalysisReady(status)) return "var(--viz-good)";
  if (isWorking(status)) return "var(--blue)";
  return "var(--ink-300)";
}

export function MatchRows({ matches }: { matches: TeamMatchRow[] }) {
  return (
    <ul className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--border-medium)]">
      {matches.map((match, index) => (
        <li
          key={match.id}
          className={
            index === 0 ? "" : "border-t border-[var(--border-hairline)]"
          }
        >
          <Link
            href={`/dashboard/matches/${match.id}`}
            className={`${ROW} transition-colors duration-150 hover:bg-[var(--surface-page)] focus-visible:bg-[var(--surface-page)] focus-visible:outline-none`}
          >
            <span className="truncate text-[13px] text-[var(--ink-900)]">
              {match.title}
            </span>
            <span className="truncate text-[12px] text-[var(--ink-700)]">
              {match.context}
            </span>
            <span className="flex items-center gap-[7px]">
              <span
                className="size-1.5 shrink-0 rounded-full"
                style={{ background: dotColor(match.status) }}
                aria-hidden="true"
              />
              <span className="truncate text-[12px] text-[var(--ink-700)]">
                {match.label}
              </span>
            </span>
            <span className="font-mono text-[11px] text-[var(--ink-500)] sm:text-right">
              {match.date}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
