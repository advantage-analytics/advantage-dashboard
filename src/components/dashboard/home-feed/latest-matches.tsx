import Link from "next/link";
import type { DisplayMatch } from "@/lib/data/matches-list-types";
import { formatMatchDayShortYear } from "@/lib/data/match-day";
import { isPracticeMatch } from "@/lib/matches/match-type";
import { ResultMark } from "@/components/dashboard/result-mark";
import { ScoreLine } from "@/components/dashboard/score-line";
import { cn } from "@/lib/utils";
import {
  EmptyBand,
  GhostBar,
  GhostRows,
  HEAD_LINK,
  LIST_CARD,
  LIST_ROW,
  LIST_ROW_HOVER,
  ROW_SUB,
  ROW_TITLE,
  RowChevron,
  SectionHead,
} from "./home-title";
import { RememberHomeRows } from "./home-shape-memory";
import type { ListKind } from "./list-pending";
import { MatchFrame } from "./match-frame";
import { MatchStatus } from "./match-status";

/** The verb between the two names, the same in both workspaces. */
function resultVerb(match: DisplayMatch): string {
  // A level score decided nothing, so the row says who played, not who won.
  if (isPracticeMatch(match.matchType) || match.level) return "vs";
  return match.score.winner === "player1" ? "def." : "lost to";
}

/**
 * The newest matches as a short list — the Matches page stays the table with
 * headers, sorting and filters. Each row reads on its own: a still, who beat
 * whom, the day and event, then where the match stands beside its result.
 *
 * A personal list leaves the player's own name off: every row is theirs.
 */
export function LatestMatches({
  matches,
  scope,
  empty,
  title = "Latest matches",
  link = { label: "All matches", href: "/dashboard/matches" },
  list = "matches",
}: {
  matches: DisplayMatch[];
  /**
   * How a row names its match: `team` leads with the program's player
   * ("Avery def. Riley Park"); `personal` is spoken to the reader ("def.
   * Riley Park").
   */
  scope: "personal" | "team";
  /** Omitted for a list that is not drawn when it has nothing to show. */
  empty?: { title: string; body: string; href?: string };
  title?: string;
  /** The heading's quiet link; null for none. */
  link?: { label: string; href: string } | null;
  /** Which remembered row count this list teaches its skeleton. */
  list?: ListKind;
}) {
  return (
    <section aria-label={title} className="flex min-w-0 flex-col gap-2.5">
      <SectionHead title={title}>
        {link ? (
          <Link href={link.href} className={HEAD_LINK}>
            {link.label}
          </Link>
        ) : null}
      </SectionHead>
      <RememberHomeRows list={list} rows={matches.length} />
      <div className={cn(LIST_CARD, "@container")}>
        {matches.length === 0 ? (
          <>
            <GhostRows
              lead={<GhostBar width={78} height={44} />}
              lines={[160, 120]}
              tail={<GhostBar width={70} />}
            />
            {empty ? <EmptyBand {...empty} /> : null}
          </>
        ) : (
          matches.map((match) => {
            const practice = isPracticeMatch(match.matchType);
            const names = `${match.player1.name} vs ${match.player2.name}`;
            return (
              <Link
                key={match.id}
                href={`/dashboard/matches/${match.id}`}
                className={cn(LIST_ROW, LIST_ROW_HOVER)}
              >
                {/* A narrow card gives the still's room to the names. */}
                <span className="contents @max-[640px]:hidden">
                  <MatchFrame
                    matchId={match.id}
                    alt={`Frame from ${names}`}
                    size="row"
                  />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className={ROW_TITLE}>
                    {scope === "team" ? (
                      <b className="font-medium">{match.player1.name} </b>
                    ) : null}
                    <span className="text-[var(--ink-500)]">
                      {resultVerb(match)}{" "}
                    </span>
                    <span
                      className={
                        scope === "team"
                          ? "text-[var(--ink-700)]"
                          : "font-medium"
                      }
                    >
                      {match.player2.name}
                    </span>
                  </span>
                  <span className={ROW_SUB}>
                    <span className="tabular mr-2">
                      {formatMatchDayShortYear(match.date)}
                    </span>
                    {/* A practice match says so, whatever event name it
                        was filed under. */}
                    {practice
                      ? "Practice match"
                      : (match.tournamentName ?? "No event")}
                  </span>
                </span>
                {/* The Matches table's own order: the result and score in a
                    fixed track, flush left, so every outcome sits at one x;
                    then where the match stands, in a track of its own. A
                    score longer than three sets widens its own row rather
                    than being cut. */}
                <span className="flex h-7 min-w-[132px] shrink-0 items-center gap-2">
                  {/* A level score gets the level mark, never a loss: its
                      `score.winner` is only the transform's default. */}
                  <ResultMark
                    won={match.level ? null : match.score.winner === "player1"}
                  />
                  <ScoreLine
                    sets={match.score.sets}
                    className="tabular text-[13px] whitespace-nowrap text-[var(--ink-900)]"
                  />
                </span>
                {/* Not the Matches table's `row-lifecycle` cell: that is a
                    size container, and one sized by its own content collapses
                    to nothing — which hid every status here. */}
                <span className="flex w-[148px] shrink-0 items-center overflow-hidden">
                  <MatchStatus match={match} />
                </span>
                <RowChevron />
              </Link>
            );
          })
        )}
      </div>
    </section>
  );
}
