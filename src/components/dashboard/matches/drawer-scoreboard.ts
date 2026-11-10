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
  const word = formatScoreboardStatus(match.matchContext);
  const status = word.charAt(0) + word.slice(1).toLowerCase();
  const format = [match.matchType, match.courtType?.toLowerCase()]
    .filter(Boolean)
    .join(" · ");

  // The last set of an unfinished match is the one left open.
  const completed = (index: number) =>
    status === "Final" || index < sets.length - 1;

  const row = (seat: "player1" | "player2"): RailScoreboardPlayer => {
    const outcomes = sets.map((set): "player1" | "player2" | "level" =>
      set.player1 > set.player2
        ? "player1"
        : set.player2 > set.player1
          ? "player2"
          : "level",
    );
    return {
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
      won: sets.length > 0 && match.score.winner === seat,
    };
  };

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
