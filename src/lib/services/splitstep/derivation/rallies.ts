/**
 * Stroke stream → rallies.
 *
 * The vendor's segmentation is the one part of this payload that holds up.
 * Across both sample matches: rally ids contiguous, `pred_rally_stroke_number`
 * exactly 1..n in every rally with no gaps or repeats, and every rally but one
 * opens on a serve. That answers vendor question Q3 — numbering restarts per
 * rally and faults are counted in it.
 *
 * So this module groups and orders, and reports the exceptions rather than
 * papering over them.
 */

import type { SplitStepRally, SplitStepStroke } from './types';

export interface RallyGrouping {
  rallies: SplitStepRally[];
  /** Rallies whose stroke numbers were not exactly 1..n. */
  malformedNumbering: number[];
  /** Rallies that did not begin with a serve. */
  missingOpeningServe: number[];
}

/**
 * Group strokes into rallies, ordered by the vendor's own numbering.
 *
 * Rally order follows first appearance in the stream rather than a numeric
 * sort on the id. Both sample files happen to be already ordered, but stream
 * order is the safer key: it matches the video timeline, which is what a
 * viewer scrubs and what every downstream time calculation assumes.
 */
export function groupIntoRallies(strokes: SplitStepStroke[]): RallyGrouping {
  const byRally = new Map<number, SplitStepStroke[]>();

  for (const stroke of strokes) {
    const existing = byRally.get(stroke.rallyId);
    if (existing) existing.push(stroke);
    else byRally.set(stroke.rallyId, [stroke]);
  }

  const rallies: SplitStepRally[] = [];
  const malformedNumbering: number[] = [];
  const missingOpeningServe: number[] = [];

  for (const [rallyId, group] of byRally) {
    const ordered = [...group].sort((a, b) => a.strokeNumber - b.strokeNumber);

    const numbersAreClean = ordered.every(
      (stroke, index) => stroke.strokeNumber === index + 1
    );
    if (!numbersAreClean) malformedNumbering.push(rallyId);

    if (ordered[0]?.strokeType !== 'serve') missingOpeningServe.push(rallyId);

    rallies.push({
      rallyId,
      strokes: ordered,
      server: ordered[0]?.playerLabel ?? '',
      serves: ordered.filter((stroke) => stroke.strokeType === 'serve'),
    });
  }

  return { rallies, malformedNumbering, missingOpeningServe };
}

/**
 * The distinct player labels in the stream, in order of first appearance.
 *
 * The vendor echoes back whatever names were submitted with the job, so these
 * are free text and have been seen to differ from the match record's spelling
 * ("Quann" for a player recorded as "Quan"). Map them to player1/player2 by
 * position via `matches.initial_top_player_is_player1`, never by string match.
 */
export function playerLabels(strokes: SplitStepStroke[]): string[] {
  const seen: string[] = [];
  for (const stroke of strokes) {
    if (!seen.includes(stroke.playerLabel)) seen.push(stroke.playerLabel);
  }
  return seen;
}

/** The other player in a two-player stream, or null if that's ambiguous. */
export function opponentOf(label: string, labels: string[]): string | null {
  if (labels.length !== 2) return null;
  return labels[0] === label ? labels[1] : labels[0];
}

/** Seconds from the first stroke of a rally to its last. */
export function rallyDuration(rally: SplitStepRally): number | null {
  const first = rally.strokes[0];
  const last = rally.strokes[rally.strokes.length - 1];
  if (!first || !last) return null;
  return last.videoTime - first.videoTime;
}
