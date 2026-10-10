/**
 * A label session as ground truth for `scripts/splitstep-eval.ts --session`:
 * the join of checked label points onto a rebuilt transcript's points, and the
 * arithmetic that scores the PUBLISHED rows and the segmenter's PROPOSED ones
 * against it.
 *
 * Pure: no client, no I/O. The script reads the rows; this file only joins
 * and counts, so the join rules are pinned by an offline spec
 * (`tests/label-session-truth.spec.ts`).
 *
 * The join:
 * - only points the labeller checked (`checkedAt` set) and did not delete
 *   count as truth;
 * - the first id in `vendorRallyIds` is the point's rally, the rest are rallies
 *   the labeller merged into it; a point with no ids (added by hand) or whose
 *   rally the transcript has no point for is reported as unmatched;
 * - `p1`/`p2` mean `matches.player1_name`/`player2_name`, the same mapping the
 *   point-check sheet path uses (`server_is_player1` → player1's name).
 *
 * "Same game" is judged by partition, not by number: a row's game is right
 * when the set of joined rallies sharing its game under the candidate equals
 * the set sharing its game in the labels. The labeller kept the vendor's
 * match-cumulative game numbers, gaps included, so the raw numbers are not
 * comparable — who is in the game with whom is.
 */

import {
  proposalDiffers,
  type ProposedPoint,
  SegmentationProposal,
} from "@/lib/services/splitstep/derivation";
import { labelEnding, type LabelEnding, type LabelSide } from "./seed";
import type { LabelPointStatus } from "./session";

/** The fields of a label point the join reads. */
export interface TruthLabelPoint {
  pointIndex: number;
  vendorRallyIds: readonly number[];
  setNumber: number | null;
  gameNumber: number | null;
  server: LabelSide | null;
  winner: LabelSide | null;
  ending: LabelEnding | null;
  status: LabelPointStatus;
  checkedAt: string | null;
}

/** The fields of a transcript point the join reads. */
export interface TruthTranscriptPoint {
  rally_id: number;
  point_number: number;
  set_number: number;
  game_number: number;
  server_is_player1: boolean;
  won_by_player1: boolean;
  result_type: string | null;
}

export interface TruthNames {
  p1: string;
  p2: string;
}

/** One side of a comparison: who served, who won, how, and in which game. */
export interface TruthValues {
  server: LabelSide | null;
  winner: LabelSide | null;
  ending: LabelEnding | null;
  /** `set|game`; only compared by partition (see the file comment). */
  gameKey: string | null;
}

export interface SessionTruthRow {
  label: TruthLabelPoint;
  point: TruthTranscriptPoint;
  rallyId: number;
  /** The labeller's merge: rallies after the first in `vendorRallyIds`. */
  mergedRallyIds: number[];
  truth: TruthValues & { serverName: string | null; winnerName: string | null };
  published: TruthValues;
  /**
   * The proposal's reading of this rally, or null when there is no proposal
   * or it does not cover the rally. Its ending is the published ending: the
   * proposal moves servers and game boundaries, never how a point ended. Its
   * winner keeps the published server-relative outcome under the proposed
   * server.
   */
  proposed: (TruthValues & { mergedWith: number | null }) | null;
  /** The proposal's game or server for this rally differs from the rows. */
  fired: boolean;
}

export interface SessionTruthJoin {
  rows: SessionTruthRow[];
  /** Included label points with no rally id, or none the transcript has. */
  unmatched: TruthLabelPoint[];
  /** Label points left out: unchecked or deleted. */
  excluded: number;
}

/** The label session's truth rows: checked and not deleted. */
export function isTruthPoint(point: TruthLabelPoint): boolean {
  return point.checkedAt !== null && point.status !== "deleted";
}

export function sideName(side: LabelSide | null, names: TruthNames) {
  return side === null ? null : names[side];
}

const sideOf = (isPlayer1: boolean): LabelSide => (isPlayer1 ? "p1" : "p2");
const other = (side: LabelSide): LabelSide => (side === "p1" ? "p2" : "p1");

/**
 * An ace is never derived (result-type.ts), so a labelled ace scored against
 * a derived service winner would always miss for a reason no rule can fix.
 * Both read as `service_winner` for accuracy.
 */
export function comparableEnding(
  ending: LabelEnding | null,
): LabelEnding | null {
  return ending === "ace" ? "service_winner" : ending;
}

export function joinSessionTruth(args: {
  labels: readonly TruthLabelPoint[];
  points: readonly TruthTranscriptPoint[];
  /** `proposedPointsOf(proposal, rallyIds)`, or null without a proposal. */
  proposed: ReadonlyMap<number, ProposedPoint> | null;
  names: TruthNames;
}): SessionTruthJoin {
  const byRally = new Map(args.points.map((p) => [p.rally_id, p]));
  const rows: SessionTruthRow[] = [];
  const unmatched: TruthLabelPoint[] = [];
  let excluded = 0;

  for (const label of args.labels) {
    if (!isTruthPoint(label)) {
      excluded += 1;
      continue;
    }
    const [rallyId, ...mergedRallyIds] = label.vendorRallyIds;
    const point = rallyId === undefined ? undefined : byRally.get(rallyId);
    if (rallyId === undefined || !point) {
      unmatched.push(label);
      continue;
    }

    const publishedServer = sideOf(point.server_is_player1);
    const publishedWinner = sideOf(point.won_by_player1);
    const serverWon = point.won_by_player1 === point.server_is_player1;
    const publishedEnding = labelEnding(point.result_type);
    const p = args.proposed?.get(rallyId) ?? null;

    rows.push({
      label,
      point,
      rallyId,
      mergedRallyIds,
      truth: {
        server: label.server,
        winner: label.winner,
        ending: label.ending,
        gameKey:
          label.setNumber === null || label.gameNumber === null
            ? null
            : `${label.setNumber}|${label.gameNumber}`,
        serverName: sideName(label.server, args.names),
        winnerName: sideName(label.winner, args.names),
      },
      published: {
        server: publishedServer,
        winner: publishedWinner,
        ending: publishedEnding,
        gameKey: `${point.set_number}|${point.game_number}`,
      },
      proposed: p && {
        server: p.server === "player1" ? "p1" : "p2",
        winner: serverWon
          ? sideOf(p.server === "player1")
          : other(sideOf(p.server === "player1")),
        ending: publishedEnding,
        gameKey: `${p.set}|${p.game}`,
        mergedWith: p.mergedWith,
      },
      // The same test transcript.ts uses to raise segment_proposal_differs.
      fired: p !== null && proposalDiffers(p, point),
    });
  }
  return { rows, unmatched, excluded };
}

type Side = "published" | "proposed";

/**
 * Per row, whether the candidate's game holds exactly the rallies the
 * labeller's does — among the joined rows. A row with no label game, or no
 * candidate reading, is false.
 */
export function gameMatches(
  rows: readonly SessionTruthRow[],
  side: Side,
): boolean[] {
  const group = (key: (r: SessionTruthRow) => string | null) => {
    const members = new Map<string, number[]>();
    for (const r of rows) {
      const k = key(r);
      if (k === null) continue;
      const list = members.get(k) ?? [];
      list.push(r.rallyId);
      members.set(k, list);
    }
    return (r: SessionTruthRow) => {
      const k = key(r);
      return k === null ? null : [...(members.get(k) ?? [])].sort().join(",");
    };
  };
  const truthMates = group((r) => r.truth.gameKey);
  const candidateMates = group((r) =>
    side === "published" ? r.published.gameKey : (r.proposed?.gameKey ?? null),
  );
  return rows.map((r) => {
    const t = truthMates(r);
    return t !== null && t === candidateMates(r);
  });
}

export interface AccuracyTally {
  right: number;
  /** Rows where the label has a value for the field. */
  of: number;
}

export interface SessionTruthScore {
  published: Record<"server" | "winner" | "ending" | "game", AccuracyTally>;
  /**
   * The proposal's values; a row the proposal does not cover counts with its
   * published values (`uncovered` says how many).
   */
  proposed: Record<"server" | "winner" | "ending" | "game", AccuracyTally>;
  uncovered: number;
  /** Fired rows: hit when the proposed server AND game match the label. */
  firings: Array<{ rallyId: number; pointIndex: number; hit: boolean }>;
}

export function scoreSessionTruth(
  rows: readonly SessionTruthRow[],
): SessionTruthScore {
  const blank = () => ({
    server: { right: 0, of: 0 },
    winner: { right: 0, of: 0 },
    ending: { right: 0, of: 0 },
    game: { right: 0, of: 0 },
  });
  const published = blank();
  const proposed = blank();
  const publishedGame = gameMatches(rows, "published");
  const proposedGame = gameMatches(rows, "proposed");
  let uncovered = 0;
  const firings: SessionTruthScore["firings"] = [];

  rows.forEach((r, i) => {
    const p = r.proposed ?? r.published;
    if (!r.proposed) uncovered += 1;
    const tally = (
      into: ReturnType<typeof blank>,
      values: TruthValues,
      game: boolean,
    ) => {
      if (r.truth.server !== null) {
        into.server.of += 1;
        if (values.server === r.truth.server) into.server.right += 1;
      }
      if (r.truth.winner !== null) {
        into.winner.of += 1;
        if (values.winner === r.truth.winner) into.winner.right += 1;
      }
      if (r.truth.ending !== null) {
        into.ending.of += 1;
        if (
          comparableEnding(values.ending) === comparableEnding(r.truth.ending)
        ) {
          into.ending.right += 1;
        }
      }
      if (r.truth.gameKey !== null) {
        into.game.of += 1;
        if (game) into.game.right += 1;
      }
    };
    tally(published, r.published, publishedGame[i]);
    tally(proposed, p, r.proposed ? proposedGame[i] : publishedGame[i]);
    if (r.fired) {
      firings.push({
        rallyId: r.rallyId,
        pointIndex: r.label.pointIndex,
        hit: r.proposed?.server === r.truth.server && proposedGame[i],
      });
    }
  });
  return { published, proposed, uncovered, firings };
}

/**
 * The proposal's merges against the labeller's multi-id points. A proposed
 * pair agrees when both rallies sit in one label point's `vendorRallyIds`.
 * Only truth points (checked, not deleted) are read.
 */
export function compareMerges(
  proposal: Pick<SegmentationProposal, "merges"> | null,
  labels: readonly TruthLabelPoint[],
): {
  proposed: Array<[number, number]>;
  labelled: number[][];
  agreed: Array<[number, number]>;
} {
  const labelled = labels
    .filter((l) => isTruthPoint(l) && l.vendorRallyIds.length > 1)
    .map((l) => [...l.vendorRallyIds]);
  const proposed = (proposal?.merges ?? []).map(
    ([a, b]) => [a, b] as [number, number],
  );
  const agreed = proposed.filter(([a, b]) =>
    labelled.some((ids) => ids.includes(a) && ids.includes(b)),
  );
  return { proposed, labelled, agreed };
}
