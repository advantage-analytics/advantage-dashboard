import Link from "next/link";
import { Calendar, Flag, MapPin, type LucideIcon } from "lucide-react";
import { StatusChip } from "@/components/ui/status-chip";
import { ResultMark } from "@/components/dashboard/result-mark";
import { ScoreLine } from "@/components/dashboard/score-line";
import { RowAction } from "@/components/dashboard/schedule/row-action";
import { formatEventDay, siteTitle } from "@/lib/schedule/format";
import { LINE_STATUS } from "@/lib/schedule/line-status";
import {
  RESULTS_WITHHELD_LABEL,
  RESULTS_WITHHELD_SENTENCE,
} from "@/components/dashboard/team/roster-vocabulary";
import type {
  DualSheetLine,
  DualTally,
  WeekendDual,
} from "@/lib/data/team-home-server";

/**
 * 44a — this week's dual, as a sheet.
 *
 * The one thing a coach opens the page for on a Saturday: nine courts, who is
 * on each, and where the dual stands. It sits above the matches list because
 * during a dual it IS the news — the list below is the season, this is today.
 *
 * **It renders or it does not.** No dual this week and the page never mounts
 * this component at all (`weekendDual` is null and `page.tsx` gates on it), so
 * there is no empty sheet, no "nothing scheduled" line and no dashed
 * placeholder holding the space — the same rule round 45 states for the rest of
 * this page. Most weeks of most seasons are the null case.
 *
 * **Nothing here is counted twice.** The tally, the S/D split, the state of
 * every line and who won it are all resolved in `team-home-server.ts` through
 * `lib/schedule/entry-state.ts` — the same functions the event page and the
 * schedule list ask. This file draws them and adds no arithmetic of its own: a
 * dual score that disagrees with the lines printed under it is exactly the
 * failure a derived tally exists to prevent.
 *
 * **And nothing here is counted on a reader's behalf who cannot see it all.**
 * The lineup is member-visible; the results are not. A player on a program with
 * `programs.roster_visible` unset gets all nine lines and one match, so
 * `team-home-server.ts` hands this card `tally: null` and marks the lines it
 * could not read — the header prints the Roster page's sentence instead of a
 * score, and an unreadable line says **"Coaches only"** rather than "Not
 * played". Their own line still shows its score and its report link: it is
 * theirs. What this file must never do is put those two states back together
 * and average them into something confident.
 *
 * **Round 44's row treatment**, the same as the Matches card below it: rows
 * hover to a `--surface-muted` wash on a rounded rect inset from the card edge
 * (6px inset against the card's 14px radius, so the row's 8px is concentric
 * with it), and nothing is ruled inside the card — not between the lines, not
 * under the header. The card's own border is the only line it draws.
 */

/**
 * Four tracks, and what each is protecting.
 *
 * - **28px, slot.** "S1"…"D3" is two characters of Roboto Mono at 11px, ~14px
 *   wide. 28 is that with room for a wider mono fallback and no more — every
 *   pixel here comes out of the names.
 * - **162px, outcome.** The same number, for the same content, as the Matches
 *   card's outcome column: the mark's 14px slot, the 8px gap, and a five-set
 *   score carrying a tiebreak digit on every set ("6-7³, 7-6³, 6-7³, 7-6³,
 *   7-6³") at ~140px in 12px tabular figures. A best-of-5 line is the one a
 *   coach most wants to read, so it is the one sized for.
 * - **104px, trailing.** Holds either "Report" (~40px) or a status chip, and
 *   the widest chip is "Analysis failed" — 11px text plus the 5px dot and its
 *   gap, ~95px. Sized above that because this is the only cell whose text could
 *   wrap, and a wrap makes the row taller, which is the one thing the round-44
 *   row does not survive.
 *
 * The names take what is left. Below `sm` the grid collapses to stacked rows,
 * as the Matches card's does.
 */
const ROW =
  "grid gap-3 px-[18px] py-3 sm:grid-cols-[28px_minmax(0,1fr)_162px_104px] sm:items-center sm:gap-4";

/** Keyboard gets what the mouse gets — see `match-rows.tsx`. The row is not
 *  itself a link, so focus is caught from the controls inside it. */
const ROW_SURFACE =
  "rounded-[var(--radius-element)] transition-colors duration-150 hover:bg-[var(--surface-muted)] has-[:focus-visible]:bg-[var(--surface-muted)]";

export function DualSheet({ dual }: { dual: WeekendDual }) {
  return (
    <section className="rounded-[var(--radius-card)] border border-[var(--border-medium)] shadow-[var(--shadow-card)]">
      <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4 px-6 pt-4 pb-3">
        <div className="flex min-w-0 flex-col gap-2">
          {/* The card's name for itself, and it does not change with the day.
              A dual is a weekend fixture; which day it actually falls on is a
              fact, and facts belong in the line below, where the date is. */}
          <span className="eyebrow">This weekend</span>

          {/* "vs" inside the heading: the fixture is what this card is about,
              not the opponent standing on their own. One text node rather than
              two flex children, so the accessible name keeps its space. */}
          <h2>
            <Link
              href={`/dashboard/team/schedule/${dual.id}`}
              className="text-title-lg rounded-[var(--radius-cell)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue)]"
            >
              vs {dual.opponent}
            </Link>
          </h2>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            {/* Site and surface travel together — they are the same fact about
                where this is played. The surface is dropped rather than filled
                with a dash when the dual was created without one: an em dash
                on a facts line is a placeholder for a fact, which is the shape
                this page removes everywhere else. */}
            <Fact icon={MapPin}>
              {siteTitle(dual.site)}
              {dual.surface ? ` · ${dual.surface}` : ""}
            </Fact>
            <Fact icon={Calendar}>{formatEventDay(dual.startsOn)}</Fact>

            {/* Only when the lines actually clinch it — see `clinchedBy`. Named
                rather than implied, because "clinched" and "finished" are
                different facts about a dual and a coach reads for the first
                one while courts are still going. */}
            {dual.tally?.clinchedBy ? (
              <Fact icon={Flag}>
                {dual.tally.clinchedBy === "us"
                  ? "Clinched"
                  : `${dual.opponent} clinched`}
              </Fact>
            ) : null}
          </div>
        </div>

        {/* Where the dual stands — or, for a reader who cannot see every line,
            the reason there is no number here. Not a dimmed score, not a score
            with a caveat under it: `tally` is null precisely because no honest
            one exists, and the type is what makes that unrenderable rather
            than merely discouraged. */}
        <div className="flex max-w-[24ch] shrink-0 flex-col items-end gap-1.5">
          {dual.tally ? (
            <Tally tally={dual.tally} lines={dual.lines.length} />
          ) : (
            /* The Roster page's sentence, word for word — one flag, one
               explanation, wherever a program surface has to give it. */
            <p className="text-micro text-right">{RESULTS_WITHHELD_SENTENCE}</p>
          )}
        </div>
      </div>

      <ul className="p-1.5">
        {dual.lines.map((line) => (
          <li key={line.id} className={`${ROW} ${ROW_SURFACE}`}>
            <span className="mono text-[11px] text-[var(--ink-600)]">
              {line.slot}
            </span>

            {/* "vs", never "d." / "f.". The mark two cells over is this row's
                outcome vocabulary, and round 44's rule is one per row shape —
                spelling the result again as a verb in the middle of the names
                is the second spelling, not a second fact. */}
            <span className="min-w-0 truncate text-[13px] text-[var(--ink-900)]">
              {line.ours || "—"}{" "}
              <span className="text-[var(--ink-600)]">vs</span>{" "}
              {line.theirs || "—"}
            </span>

            {/* The mark's box is held whether or not there is a mark, so every
                score on the card starts on one vertical line — the same
                treatment the Matches card gives its outcome column. A line
                whose sets are level keeps its score and loses only the glyph. */}
            <span className="flex items-center gap-2">
              <span className="flex w-3.5 shrink-0 justify-center">
                {line.won === null ? null : <ResultMark won={line.won} />}
              </span>
              <ScoreLine
                sets={line.sets}
                className="min-w-0 truncate text-[12px] text-[var(--ink-900)]"
              />
            </span>

            <span className="flex sm:justify-end">
              <Trailing line={line} />
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** One fact about the dual — an icon and a phrase, on the line under the name. */
function Fact({
  icon: Icon,
  children,
}: {
  icon: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <span className="text-micro flex items-center gap-1.5">
      <Icon className="size-[13px] shrink-0" strokeWidth={1.5} aria-hidden />
      {children}
    </span>
  );
}

/**
 * The team score and the two halves it is made of.
 *
 * Its own component because it is the half of the header that can be absent:
 * a `tally` in hand is the whole precondition for every number in here, and
 * taking it as a non-null prop is what keeps the absent case from being an
 * `?.` chain that renders `undefined–undefined` the day somebody loosens it.
 */
function Tally({ tally, lines }: { tally: DualTally; lines: number }) {
  // ink-300 until a point is actually on the board, which is `dual-detail.tsx`'s
  // rule for the same number: a 0–0 in full ink reads as a result rather than
  // as the absence of one.
  const anyPoint = tally.us > 0 || tally.them > 0;

  return (
    <>
      <span
        className="text-score leading-none"
        style={{ color: anyPoint ? "var(--ink-900)" : "var(--ink-300)" }}
      >
        {tally.us}–{tally.them}
      </span>

      {/* The two halves the tally is made of, and they add up to it: six
          singles points and the one point three doubles courts produce.
          Then where the card is up to — "final" only once every line is in,
          which is the same word and the same rule the schedule list prints
          a dual under. */}
      <span className="text-micro tabular">
        S {tally.singles.us}–{tally.singles.them} · D {tally.doubles.us}–
        {tally.doubles.them} ·{" "}
        {tally.decided ? (
          "final"
        ) : (
          <>
            {tally.playedLines} of {lines} in
          </>
        )}
      </span>
    </>
  );
}

/**
 * The end of the line: where to read it, or what it is waiting for.
 *
 * The waiting states are not spelled here. Their words, tones and the pulse on
 * the one that is moving come from `lib/schedule/line-status.ts`, which the
 * event page's `line-row.tsx` reads too — a second set of words for one job is
 * how two screens start telling a coach different stories about it.
 *
 * What this does NOT carry is the event page's edit actions. "Add score" and
 * "Add video" are writes; Team Home is a read, a player may be the one reading
 * it, and the line's own page is one click away through the card's heading.
 */
function Trailing({ line }: { line: DualSheetLine }) {
  // Nothing about this line came back, and under a narrowed read that is not a
  // fact about the court — see `DualSheetLine.readable`. It was very likely
  // played; this reader is not the one who gets told. First, because every
  // test below is a claim about a match we would have to be able to see.
  if (!line.readable) {
    return <StatusChip>{RESULTS_WITHHELD_LABEL}</StatusChip>;
  }

  if (line.reportId) {
    return <RowAction href={`/dashboard/matches/${line.reportId}`}>Report</RowAction>;
  }

  const status = LINE_STATUS[line.state];
  if (status) {
    return (
      <StatusChip tone={status.tone} live={status.live}>
        {status.label}
      </StatusChip>
    );
  }

  // Played and scored, with no video and nothing pending. The score two cells
  // over has already said everything true about this line, so the cell is
  // empty rather than filled with a word for "nothing is happening".
  if (line.sets.length > 0) return null;

  return <StatusChip>Not played</StatusChip>;
}
