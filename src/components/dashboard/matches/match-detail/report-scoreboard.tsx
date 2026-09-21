"use client";

import { useMatchData } from "@/components/dashboard/matches/match-data-provider";
import { formatClock } from "@/components/dashboard/matches/match-detail/format-clock";
import { useFilmHead } from "@/components/dashboard/matches/match-detail/film-head-context";
import { boardAt } from "@/components/dashboard/matches/match-detail/film/film-score";
import { useMatchReport } from "@/components/dashboard/matches/match-detail/match-report-context";
import {
  RailScoreboard,
  type RailScoreboardPlayer,
  type RailScoreboardProps,
} from "@/components/dashboard/matches/match-detail/rail-scoreboard";
import { useMatchSides } from "@/components/dashboard/matches/match-detail/use-match-sides";
import { formatScoreboardStatus } from "@/lib/data/match-utils";
import {
  playedSets,
  tiebreakOf,
  type ScoreLineSet,
} from "@/lib/ui/score-format";

/**
 * Which side a set favours, for the rail scoreboard's ink weight (F8/F1): the
 * set winner's digit prints ink-900, the loser's ink-400 (spec decisions #6).
 *
 * Games decide it, never the tiebreak. A tiebreak set's `player1Tiebreak`/
 * `player2Tiebreak` hold that player's own tiebreak POINTS, not games
 * (`score-format.ts`'s `ScoreLineSet` doc; guardrails §4 — a score row stores
 * the GAME count for a tiebreak set, never the tiebreak points), so a 7-6(5)
 * set resolves by 7 vs 6 like any other set; this function never reads the
 * tiebreak fields at all.
 *
 * `ScoreLineSet` carries no "unfinished" flag, so the frame's "level OR
 * unfinished sets keep both digits ink-900" collapses to the one case a pure
 * function of a finished set can see: equal games reads as `"level"`.
 *
 * `set` must already be you-first — the shape `useMatchSides().sets` hands
 * over — never `player1`/`player2` database order read directly. That order
 * depends on which end the viewer started the video on; getting it backwards
 * attributes the whole scoreboard to the wrong player with nothing looking
 * broken on screen (docs/ui-revamp-guardrails.md §4), so this function takes
 * an already-oriented set and never looks at which id is which.
 *
 * Lives in the component file rather than a sibling `report-scoreboard.ts`:
 * with both files present the extensionless specifier resolved to the `.ts`
 * under TypeScript and to the `.tsx` under Next's bundler, so typecheck and
 * the build would each have checked a different module.
 * `tests/report-scoreboard.spec.ts` imports it from here, the way
 * `tests/match-h2h-rows.spec.ts` imports `head-to-head-card.tsx`'s rules.
 */
export function setOutcome(set: ScoreLineSet): "you" | "opp" | "level" {
  if (set.player1 > set.player2) return "you";
  if (set.player2 > set.player1) return "opp";
  return "level";
}

/**
 * `formatScoreboardStatus` spells the old rail's uppercase eyebrow ("FINAL");
 * this scoreboard sets the same word in sentence case ("Final"). Cased here rather
 * than in `match-utils.ts`, so the shared helper keeps its one spelling.
 */
function sentenceCase(word: string): string {
  return word.charAt(0) + word.slice(1).toLowerCase();
}

function surname(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts[parts.length - 1] ?? name;
}

/**
 * The rail scoreboard, connected (H1 · B2): decides the state and hands
 * `RailScoreboard` its rows.
 *
 * Which row is on top, and which digit belongs to whom, comes from
 * `useMatchSides()` and nothing else (guardrails §4): "you" first — the
 * viewer's own seat, or on a team match the roster player's — with digits
 * from `sides.sets`, already you-first with the tiebreak slots swapped
 * together with the games. On the Video tab the live board comes from
 * `boardAt()`, which orients through the same `youIsPlayer1`. Nothing here
 * reads `match.score` or `player1`/`player2`.
 *
 *   live      Video view, a point under the film head
 *   untagged  no played sets on the match row
 *   final     everything else — the match as it ended
 */
export function MatchReportScoreboard() {
  const { match, points } = useMatchData();
  const sides = useMatchSides();
  const { state } = useMatchReport();
  const head = useFilmHead();

  const youId = "you";
  const oppId = "opp";
  const format = [match.matchType, match.courtType?.toLowerCase()]
    .filter(Boolean)
    .join(" · ");

  let props: RailScoreboardProps;

  if (state.view === "film" && head) {
    const board = boardAt(
      head.point,
      {
        youIsPlayer1: sides.you.isPlayer1,
        youName: sides.you.name,
        oppName: sides.opp.name,
        sets: sides.sets,
      },
      head.columns,
    );
    const [you, opp] = board.rows;
    const server = you.serving ? sides.you.name : sides.opp.name;
    props = {
      status: "live",
      label: "Playing",
      headTime: formatClock(head.time),
      caption: `Set ${head.point.setNumber} · game ${head.point.gameNumber} · ${surname(server)} serving`,
      players: [
        {
          id: youId,
          name: sides.you.name,
          sets: you.sets,
          points: you.game,
          serving: you.serving,
        },
        {
          id: oppId,
          name: sides.opp.name,
          sets: opp.sets,
          points: opp.game,
          serving: opp.serving,
        },
      ],
    };
  } else {
    // Display-only trim of the phantom trailing 0-0 sets production rows
    // carry (`playedSets`' doc). Still `sides.sets`, still you-first.
    const sets = playedSets(sides.sets);
    const status = sentenceCase(formatScoreboardStatus(match.matchContext));
    const duration =
      typeof match.durationSec === "number" && match.durationSec > 0
        ? formatClock(match.durationSec, { alwaysShowHours: true })
        : null;

    const row = (side: "you" | "opp"): RailScoreboardPlayer => {
      const isYou = side === "you";
      const lostSets = sets.map((set) => {
        const outcome = setOutcome(set);
        return outcome !== "level" && outcome !== side;
      });
      return {
        id: isYou ? youId : oppId,
        name: isYou ? sides.you.name : sides.opp.name,
        sets: sets.map((set) => (isYou ? set.player1 : set.player2)),
        // `tiebreakOf` returns the LOSER's points; only drawn on a lost set.
        tiebreaks: sets.map((set) => tiebreakOf(set)),
        lostSets,
        won: sets.length > 0 && (isYou ? match.won : !match.won),
      };
    };

    if (sets.length === 0) {
      props = {
        status: "untagged",
        label: "Not scored yet",
        caption: format || "No score entered",
        players: [row("you"), row("opp")],
      };
    } else {
      const tagged =
        points.length > 0
          ? `${points.length} point${points.length === 1 ? "" : "s"} tagged`
          : null;
      const lead = status === "Final" ? "Match complete" : status;
      props = {
        status: "final",
        label: status,
        duration,
        caption: [lead, tagged ?? format].filter(Boolean).join(" · "),
        players: [row("you"), row("opp")],
      };
    }
  }

  return <RailScoreboard {...props} />;
}
