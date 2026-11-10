import type {
  RailScoreboardPlayer,
  RailScoreboardProps,
} from "@/components/dashboard/matches/match-detail/rail-scoreboard";
import type { DisplayMatch } from "@/lib/data/matches-list-types";
import { formatScoreboardStatus } from "@/lib/data/match-utils";
import {
  playedSets,
  tiebreakOf,
  type ScoreLineSet,
} from "@/lib/ui/score-format";
import { capitalize } from "@/lib/utils";

/**
 * The Matches drawer's scoreboard: the match report's `RailScoreboard`, fed
 * from the list's row instead of the report's data — the same rules as
 * `MatchReportScoreboard`'s final and untagged states, so a match reads the
 * same in the drawer as on its page.
 *
 * Seat one of a `DisplayMatch` is already the side the row reads from (the
 * viewer, or the roster player on a team match; `turned` rows were swapped by
 * `fromPlayerSide`), so player1 is drawn first, as the report draws "you".
 * Kept out of `report-scoreboard.tsx` so the list's bundle does not pull in
 * the report's film-room context.
 */
export function drawerScoreboardProps(
  match: DisplayMatch,
): RailScoreboardProps {
  // Display-only trim of the phantom trailing 0-0 sets (`playedSets`' doc).
  const sets = playedSets(match.score.sets as ScoreLineSet[]);
  const status = capitalize(
    formatScoreboardStatus(match.matchContext).toLowerCase(),
  );
  const format = [match.matchType, match.courtType?.toLowerCase()]
    .filter(Boolean)
    .join(" · ");

  // Who took each set, once for both rows.
  const outcomes = sets.map((set): "player1" | "player2" | "level" =>
    set.player1 > set.player2
      ? "player1"
      : set.player2 > set.player1
        ? "player2"
        : "level",
  );
  // The last set of an unfinished match is the one left open.
  const completed = (index: number) =>
    status === "Final" || index < sets.length - 1;
  // Whether anyone won. The list defaults `score.winner` to player2 when the
  // score decides nobody (a level or unfinished score), and that default must
  // not draw a winner's check: only a retirement, withdrawal or default — a
  // winner the games may not show — or a final with more sets on one side
  // names one.
  const setsWon = (seat: "player1" | "player2") =>
    outcomes.filter((outcome) => outcome === seat).length;
  const decided =
    status !== "Unfinished" &&
    (status !== "Final" || setsWon("player1") !== setsWon("player2"));

  const row = (seat: "player1" | "player2"): RailScoreboardPlayer => ({
    id: seat,
    name: match[seat].name,
    sets: sets.map((set) => set[seat]),
    // `tiebreakOf` returns the LOSER's points; only drawn on a lost set.
    tiebreaks: sets.map((set) => tiebreakOf(set)),
    lostSets: outcomes.map(
      (outcome, index) =>
        outcome !== "level" && outcome !== seat && completed(index),
    ),
    wonSets: outcomes.map(
      (outcome, index) => outcome === seat && completed(index),
    ),
    won: sets.length > 0 && decided && match.score.winner === seat,
  });

  const players: [RailScoreboardPlayer, RailScoreboardPlayer] = [
    row("player1"),
    row("player2"),
  ];

  if (sets.length === 0) {
    return {
      status: "untagged",
      label: "Not scored yet",
      caption: format || "No score entered",
      players,
      bare: true,
    };
  }
  const lead = status === "Final" ? "Match complete" : status;
  return {
    status: "final",
    label: status,
    duration: match.duration ?? null,
    caption: [lead, format].filter(Boolean).join(" · "),
    players,
    bare: true,
  };
}
