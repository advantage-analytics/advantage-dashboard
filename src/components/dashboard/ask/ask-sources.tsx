"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { ChevronRight, CircleDashed } from "lucide-react";
import { ResultMark } from "@/components/dashboard/result-mark";
import { ScoreLine } from "@/components/dashboard/score-line";
import { EmptyMark } from "@/components/ui/empty-mark";
import type { AskSourceMatch } from "@/lib/services/ask/events";
import type { ScoreLineSet } from "@/lib/ui/score-format";
import { askMatchPlayers } from "./ask-tag-menu";

/** How many matches show before "All N" is pressed. */
export const ASK_SOURCES_SHOWN = 2;

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * `2026-09-28` → `Sep 28`, with the year once it is not `thisYear`.
 *
 * Read off the string, never through `Date`: `playedOn` is a calendar day
 * with no zone, and parsing it would move a match to the evening before for
 * anyone west of Greenwich.
 */
export function askSourceDate(
  playedOn: string | null,
  thisYear: number,
): string | null {
  const parts = playedOn?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!parts) return null;
  const month = MONTHS[Number(parts[2]) - 1];
  if (!month) return null;
  const day = `${month} ${Number(parts[3])}`;
  return Number(parts[1]) === thisYear ? day : `${day}, ${parts[1]}`;
}

/**
 * `score_text` back into sets for `ScoreLine`, so a source row spells a score
 * the way every other row in the product does. The view writes games only,
 * the viewer's first ("6-4, 3-6, 7-5"); anything that does not read as that
 * is null, and the row prints the text as it came rather than guess.
 */
export function askSourceSets(scoreText: string | null): ScoreLineSet[] | null {
  const pieces = scoreText?.split(/[\s,]+/).filter(Boolean) ?? [];
  if (pieces.length === 0) return null;
  const sets: ScoreLineSet[] = [];
  for (const piece of pieces) {
    const games = piece.match(/^(\d{1,2})-(\d{1,2})$/);
    if (!games) return null;
    sets.push({ player1: Number(games[1]), player2: Number(games[2]) });
  }
  return sets;
}

/**
 * The outcome cell. Won and lost are `ResultMark`'s. A match the score cannot
 * decide — stopped, unfinished, never scored — is neither, and it is not
 * `ResultMark`'s third glyph either: that one means a dual that finished
 * level. It gets the dashed circle, in ink.
 */
function SourceResult({ iWon }: { iWon: boolean | null }) {
  if (iWon !== null) return <ResultMark won={iWon} />;
  return (
    <span className="inline-flex items-center">
      <CircleDashed
        className="size-3.5 shrink-0 text-[var(--ink-500)]"
        strokeWidth={1.5}
        aria-hidden="true"
      />
      <span className="sr-only">Unfinished</span>
    </span>
  );
}

function SourceRow({
  match,
  thisYear,
}: {
  match: AskSourceMatch;
  thisYear: number;
}) {
  const sets = askSourceSets(match.scoreText);
  const date = askSourceDate(match.playedOn, thisYear);
  const scoreClass = "text-right text-[11px] text-[var(--ink-600)]";

  return (
    <li className="col-span-full grid grid-cols-subgrid">
      <Link
        // A pattern answer's row opens the match's Video view on exactly the
        // points the answer counted there.
        href={
          match.watch?.href ??
          `/dashboard/matches/${encodeURIComponent(match.matchId)}`
        }
        className="group col-span-full -mx-2 grid h-9 grid-cols-subgrid items-center rounded-[var(--radius-element)] px-2 transition-colors duration-[var(--duration-hover)] outline-none hover:bg-[var(--surface-subtle)] focus-visible:shadow-[var(--focus-ring)]"
      >
        <SourceResult iWon={match.iWon} />
        <span className="min-w-0 truncate text-[12px] text-[var(--ink-900)]">
          {askMatchPlayers(match)}
          {match.watch && (
            <span className="text-[var(--blue)]">
              {" "}
              · Watch {match.watch.points}{" "}
              {match.watch.points === 1 ? "point" : "points"}
            </span>
          )}
        </span>
        {sets ? (
          <ScoreLine
            sets={sets}
            className={`${scoreClass} whitespace-nowrap`}
          />
        ) : match.scoreText ? (
          <span className={`${scoreClass} whitespace-nowrap tabular-nums`}>
            {match.scoreText}
          </span>
        ) : (
          <span className="text-right">
            <EmptyMark label="No score" />
          </span>
        )}
        {date ? (
          <span className="mono text-right text-[10px] whitespace-nowrap text-[var(--ink-400)]">
            {date}
          </span>
        ) : (
          <span className="text-right">
            <EmptyMark label="Undated" />
          </span>
        )}
        <ChevronRight
          className="size-[13px] text-[var(--ink-300)] transition-colors duration-[var(--duration-hover)] group-hover:text-[var(--ink-900)]"
          strokeWidth={1.5}
          aria-hidden="true"
        />
      </Link>
    </li>
  );
}

export interface AskSourcesProps {
  /** The matches the answer was computed from, in the order the route sent. */
  matches: AskSourceMatch[];
}

/**
 * "Computed from N matches": the record rows an answer stands on.
 *
 * Each row is the outcome as a mark (never the word), the opponent, the score
 * and the date, and it opens that match's report. A team answer's rows lead
 * with the program's own player ("Sokolov vs Dvorsky"): the mark and the
 * score are that player's, and the opponent alone would not say whose. The first two show; "All N"
 * opens the rest in place, under the same heading, so the answer above does
 * not move.
 *
 * Renders nothing for an answer with no matches behind it — a heading over an
 * empty list would claim a computation that did not happen.
 */
export function AskSources({ matches }: AskSourcesProps) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  if (matches.length === 0) return null;

  const count = matches.length;
  const thisYear = new Date().getFullYear();
  const shown = open ? matches : matches.slice(0, ASK_SOURCES_SHOWN);

  return (
    <section className="flex max-w-[420px] flex-col gap-0.5">
      <div className="flex items-center gap-3 pb-2">
        <h3 className="eyebrow-sm min-w-0 flex-1">
          Computed from {count} {count === 1 ? "match" : "matches"}
        </h3>
        {count > ASK_SOURCES_SHOWN && (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={listId}
            onClick={() => setOpen((current) => !current)}
            className="cursor-pointer rounded-sm text-[11px] font-medium text-[var(--blue)] transition-colors duration-[var(--duration-hover)] outline-none hover:text-[var(--blue-hover)] focus-visible:shadow-[var(--focus-ring)]"
          >
            {open ? `First ${ASK_SOURCES_SHOWN}` : `All ${count}`}
          </button>
        )}
      </div>
      <ul
        id={listId}
        className="grid grid-cols-[14px_minmax(0,1fr)_auto_auto_13px] gap-x-2.5"
      >
        {shown.map((match) => (
          <SourceRow key={match.matchId} match={match} thisYear={thisYear} />
        ))}
      </ul>
    </section>
  );
}
