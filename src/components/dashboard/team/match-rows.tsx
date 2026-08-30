import Link from "next/link";
import {
  isAnalysisFailed,
  isAnalysisReady,
  isLiveUpdating,
  isWorking,
  type AnalysisStatus,
} from "@/lib/data/match-analysis";
import { ResultMark } from "@/components/dashboard/result-mark";
import { ScoreLine } from "@/components/dashboard/score-line";
import type { TeamMatchRow } from "@/lib/data/team-home-server";

/**
 * F8 — what has come back, as rows.
 *
 * Onboarding is over when this table has something in it, which is why F6's
 * three cards have no "skip": they are dismissed by producing a row here.
 *
 * **A settled row shows the result, not the machinery.** Once a match is in and
 * nothing is running, "Analyzed" is the least interesting true thing about it —
 * the coach came to find out who won and by what. So a settled row spends its
 * middle column on `<ResultMark>` + `<ScoreLine>` and offers the report at the
 * end of the line, and only a row that is still moving keeps the status dot and
 * its `ANALYSIS_LABEL` word.
 *
 * The status word is still the product's own — the same vocabulary the matches
 * list and the match page use. A second set of words for the same five states
 * is how "Analyzing" and "Analyzed" end up meaning different things on
 * different screens.
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

/**
 * Five tracks, not four. `…_150px_120px` became `…_162px_72px_84px`, because
 * the outcome column now carries a mark and a score where it used to carry a
 * dot and one word, and the report affordance needs a slot of its own at the
 * end of the line.
 *
 * **What each number is protecting** — none of them is a round number picked to
 * look tidy, so measure before you shrink one:
 *
 * - **162px, outcome.** The widest thing this cell can hold: the mark's 14px
 *   slot, the 8px gap after it, and a FIVE-set score with a tiebreak digit on
 *   every set — "6-7³, 7-6³, 6-7³, 7-6³, 7-6³", the longest score a best-of-5
 *   row can store — which is ~140px at 12px tabular-nums. Cut this and a
 *   five-setter is the row that truncates, which is the one a coach most wants
 *   to read. It also clears the other branch with room to spare: dot (6px) +
 *   7px gap + the longest `ANALYSIS_LABEL` ("Stats unavailable", ~113px total),
 *   so neither branch of this cell truncates in normal use.
 * - **72px, date.** `shortDate` is at most "Sep 30" — six characters of
 *   `font-mono` at 11px, ~40px. 72px is that plus a deliberate margin for a
 *   wider mono fallback, and no more: the date used to be the last track and
 *   could afford 120px, but every pixel it holds now comes out of the names.
 * - **84px, report.** "View report" is ~62px at 11px in Inter. The slack is not
 *   decoration — this is the only cell whose text could wrap to a second line,
 *   and a wrap here would make the row taller, which is the one thing round
 *   44's treatment does not survive. Sized above the text's natural width so a
 *   fallback font cannot break it onto two lines.
 *
 * The fixed tracks therefore go 270px → 318px and the row gains a fourth
 * `gap-4`, so the two fluid tracks give up 64px between them, in their 1.4:1
 * proportion. Padding and vertical rhythm are untouched — `px-[18px] py-3.5`
 * and `sm:items-center` are byte-for-byte what they were — so the row is
 * exactly as tall as it was.
 */
const ROW =
  "grid gap-3 px-[18px] py-3.5 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_162px_72px_84px] sm:items-center sm:gap-4";

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
    <section className="rounded-[var(--radius-card)] border border-[var(--border-medium)] shadow-[var(--shadow-card)]">
      {/* The card's own word for itself. Its horizontal padding is the row's
          18px plus the list's 6px inset, so the label sits directly over the
          column it heads. Nothing rules it off from the list — whitespace is
          what separates an eyebrow from what follows it, and the gap below is
          the 8px here plus the list's 6px and the row's own 14px. */}
      <h2 className="eyebrow px-6 pt-4 pb-2">Matches</h2>

      <ul className="p-1.5">
        {matches.map((match) => {
          /* Settled: no update is coming that would change what this row
             says, nothing broke, and somebody recorded a score. A failed job
             keeps the dot — the score may be true, but burying "Failed" under
             a result is how a job nobody retries stops being visible. A
             settled row with no score has nothing to put in the column and
             falls back to the dot as well.

             `isLiveUpdating`, NOT `isInFlight`, and the difference is this
             card's whole point. `isInFlight` answers "will this ever change",
             which is true of `processed` — the state every vendor-analysed
             match sits in until Phase 2 derivation ships. Asking it here held
             the score off the one row a coach is most likely to have, showing
             "Stats pending" beside a result we have known since upload: the
             score comes from `matches.score`, entered in the wizard, and owes
             the vendor nothing. `isLiveUpdating` asks whether an update is
             actually coming, which for `processed` is no — only a deploy moves
             it. `teamAttention()` in `team-home-server.ts` already refuses
             `isInFlight` for the same reason and says so. */
          const settled =
            !isLiveUpdating(match.status) &&
            !isAnalysisFailed(match.status) &&
            match.sets.length > 0;
          /* There is only a report where analysis actually produced one. A
             hand-scored dual line is settled and has a score, but its match
             page has no numbers on it — offering "View report" there promises
             a page of zeroes, which is guardrails §3.3 in link form. This is
             also what keeps `processed` honest now that it settles: the row
             shows the result, and the absent link is the whole of what it
             claims about the statistics. `isAnalysisReady`, deliberately
             narrower than `settled` — the two questions are "is this row's
             score final" and "is there a stats page behind it", and only
             `imported`, `completed` and `timeline` answer yes to both. */
          const hasReport = settled && isAnalysisReady(match.status);

          return (
            <li key={match.id}>
              <Link
                href={`/dashboard/matches/${match.id}`}
                className={`group ${ROW} ${ROW_SURFACE}`}
              >
                <span className="truncate text-[13px] text-[var(--ink-900)]">
                  {match.title}
                </span>
                <span className="truncate text-[12px] text-[var(--ink-700)]">
                  {match.context}
                </span>

                {settled ? (
                  <span className="flex items-center gap-2">
                    {/* The mark's box is held whether or not there is a mark,
                        so scores start on one vertical line down the list. A
                        row whose side we cannot establish loses its glyph, not
                        its alignment — see `programSide()` in
                        `team-home-server.ts` for when that happens and why an
                        empty slot is the honest answer. */}
                    <span className="flex w-3.5 shrink-0 justify-center">
                      {match.won === null ? null : (
                        <ResultMark won={match.won} />
                      )}
                    </span>
                    <ScoreLine
                      sets={match.sets}
                      className="min-w-0 truncate text-[12px] text-[var(--ink-900)]"
                    />
                  </span>
                ) : (
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
                )}

                <span className="font-mono text-[11px] text-[var(--ink-500)] sm:text-right">
                  {match.date}
                </span>

                {/* Not a nested `<a>`. The whole row is already the link to
                    this match, and an anchor inside an anchor is invalid
                    markup that browsers resolve however they like — so this is
                    the row link's visible label, styled as what it is: where
                    the row goes. Omitted rather than emptied when there is no
                    report, so the stacked mobile layout gains no blank line. */}
                {hasReport ? (
                  <span className="text-[11px] text-[var(--blue)] transition-colors duration-[var(--duration-hover)] group-hover:text-[var(--blue-hover)] sm:text-right">
                    View report
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
