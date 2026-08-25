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
 *
 * **Round 44, the result-list row.** A row's hover is a rounded rect inset from
 * the card, not a wash running edge to edge: the corners stay visible inside
 * the border, so the highlight reads as *this row* rather than as a band across
 * the card. The inset is 6px against the card's 14px radius, which leaves the
 * row's own 8px exactly concentric with it.
 *
 * Nothing is ruled inside the card at all — not between the rows, not under the
 * label. The card's own border is the only line it draws, and whitespace does
 * the separating, which is what v2 did to eyebrows everywhere. Rules between
 * rows are for a list you read line by line; this is one you scan, and the
 * hover rect is already telling you which row you are on.
 *
 * That is also why the card no longer clips its contents. `overflow-hidden`
 * existed to keep a full-bleed wash inside the rounded corners; with the wash
 * inset it has nothing left to clip except the focus ring, which is the one
 * thing here that must not be clipped.
 */

const ROW =
  "grid gap-3 px-[18px] py-3.5 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_150px_120px] sm:items-center sm:gap-4";

/**
 * The row's own box. Keyboard gets what the mouse gets — a focused row is a
 * row someone is looking at, and the wash is how this list says which one.
 */
const ROW_SURFACE =
  "rounded-[var(--radius-element)] transition-colors duration-150 hover:bg-[var(--surface-muted)] focus-visible:bg-[var(--surface-muted)]";

/** One dot, four meanings: running, done, broken, or nothing is happening. */
function dotColor(status: AnalysisStatus): string {
  if (isAnalysisFailed(status)) return "#E51837";
  if (isAnalysisReady(status)) return "var(--viz-good)";
  if (isWorking(status)) return "var(--blue)";
  return "var(--ink-300)";
}

export function MatchRows({ matches }: { matches: TeamMatchRow[] }) {
  return (
    <section className="rounded-[var(--radius-card)] border border-[var(--border-medium)]">
      {/* The card's own word for itself. Its horizontal padding is the row's
          18px plus the list's 6px inset, so the label sits directly over the
          column it heads. Nothing rules it off from the list — whitespace is
          what separates an eyebrow from what follows it, and the gap below is
          the 8px here plus the list's 6px and the row's own 14px. */}
      <h2 className="eyebrow px-6 pt-4 pb-2">Matches</h2>

      <ul className="p-1.5">
        {matches.map((match) => (
          <li key={match.id}>
            <Link
              href={`/dashboard/matches/${match.id}`}
              className={`${ROW} ${ROW_SURFACE}`}
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
    </section>
  );
}
