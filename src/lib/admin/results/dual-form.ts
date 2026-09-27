import {
  DUAL_SLOTS,
  validateDualLineup,
  validateLineup,
} from "@/lib/schedule/lineup-validation";
import type { EventFormat } from "@/lib/schedule/types";
import { planSave, type ScoreFormState } from "@/lib/schedule/score-seed";
import { isValidDateString } from "@/lib/admin/validation";
import type { EventPreset } from "@/components/dashboard/matches/new-match-wizard/types";
import type {
  CreateDualInput,
  LineupLineInput,
} from "@/lib/schedule/write-types";
import type {
  AdminDualSubmissionInput,
  AdminLineResult,
  AdminResultItemOutcome,
} from "./types";

export interface AdminDualOption {
  id: string;
  label: string;
}
export interface AdminDualContext {
  eventId: string;
  fingerprint: string;
  label: string;
  dual: CreateDualInput;
  saved: Record<string, string>;
  format?: EventFormat;
}
export function hasNineDualCourts(
  lines: { slot: string; discipline: string }[],
) {
  return (
    lines.length === 9 &&
    new Set(lines.map((l) => l.slot)).size === 9 &&
    lines.every(
      (l) =>
        (DUAL_SLOTS as readonly string[]).includes(l.slot) &&
        l.discipline === (l.slot.startsWith("D") ? "doubles" : "singles"),
    )
  );
}
export interface DualResultDraft {
  line: LineupLineInput;
  score: ScoreFormState;
  outcome:
    | ""
    | "ours-forfeit"
    | "theirs-forfeit"
    | "ours-default"
    | "theirs-default"
    | "ours-withdrawal"
    | "theirs-withdrawal";
}
export function emptyDualLines(): LineupLineInput[] {
  return [...DUAL_SLOTS]
    .sort((a, b) => a.localeCompare(b))
    .map((slot) => ({
      slot,
      position: Number(slot.slice(1)),
      discipline: slot.startsWith("D") ? "doubles" : "singles",
      playerUserIds: [],
      playerLabels: [],
      opponentLabels: [],
    }));
}
export function emptyScore(count: number, opponents = ""): ScoreFormState {
  return {
    opponentName: opponents,
    playerScores: Array(count).fill(null),
    opponentScores: Array(count).fill(null),
    playerTiebreaks: Array(count).fill(null),
    opponentTiebreaks: Array(count).fill(null),
    ending: null,
    stoppedBy: null,
  };
}
export function draftResult(draft: DualResultDraft): {
  result: AdminLineResult | null;
  error: string | null;
} {
  const { line, score, outcome } = draft;
  if (outcome) {
    const [side, kind] = outcome.split("-") as [
      "ours" | "theirs",
      "forfeit" | "default" | "withdrawal",
    ];
    return { result: { kind: "outcome", side, outcome: kind }, error: null };
  }
  const hasScore = [
    ...score.playerScores,
    ...score.opponentScores,
    ...score.playerTiebreaks,
    ...score.opponentTiebreaks,
  ].some((n) => n !== null);
  if (!hasScore && !score.ending) return { result: null, error: null };
  const played = score.playerScores
    .map((_, i) => i)
    .filter(
      (i) => score.playerScores[i] !== null || score.opponentScores[i] !== null,
    );
  if (
    played.some(
      (i, j) =>
        i !== j ||
        score.playerScores[i] === null ||
        score.opponentScores[i] === null,
    )
  )
    return {
      result: null,
      error: "Enter both game counts in consecutive sets.",
    };
  if (
    [...score.playerScores, ...score.opponentScores].some(
      (n) => n !== null && (!Number.isInteger(n) || n < 0 || n > 99),
    ) ||
    [...score.playerTiebreaks, ...score.opponentTiebreaks].some(
      (n) => n !== null && (!Number.isInteger(n) || n < 0 || n > 999),
    )
  )
    return {
      result: null,
      error: "Use whole game counts 0–99 and tiebreak points 0–999.",
    };
  if (
    score.playerTiebreaks.some((n, i) => n !== null && !played.includes(i)) ||
    score.opponentTiebreaks.some((n, i) => n !== null && !played.includes(i))
  )
    return {
      result: null,
      error: "Enter games for each set with tiebreak points.",
    };
  const preset = {
    entryId: line.id ?? null,
    eventKind: "dual",
    discipline: line.discipline,
    round: null,
    matchId: null,
  } as EventPreset;
  const plan = planSave(preset, score, null);
  if (plan.kind === "error") return { result: null, error: plan.message };
  if (plan.kind === "outcome")
    return {
      result: { kind: "outcome", outcome: "default", side: plan.side },
      error: null,
    };
  const {
    ourGames,
    theirGames,
    ourTiebreaks,
    theirTiebreaks,
    opponentLabels,
    ending,
  } = plan.input;
  if (opponentLabels.length !== (line.discipline === "doubles" ? 2 : 1))
    return {
      result: null,
      error: "Name each opponent; separate a pair with /.",
    };
  return {
    result: {
      kind: "score",
      ourGames,
      theirGames,
      ourTiebreaks,
      theirTiebreaks,
      opponentLabels,
      ending: ending ?? null,
    },
    error: null,
  };
}
export function validateDualDraft(
  dual: CreateDualInput,
  drafts: DualResultDraft[],
  existing: AdminDualContext | null,
) {
  const errors: Record<string, string> = {};
  if (!existing) {
    if (!dual.opponent.trim()) errors.event = "Name the opposing team.";
    if (!isValidDateString(dual.date))
      errors.event = "Choose a valid event date and opposing team.";
    for (const error of [
      ...validateLineup(drafts.map((d) => d.line)),
      ...validateDualLineup(drafts.map((d) => d.line)),
    ])
      errors[error.slot] = error.reason;
  }
  const selected: { slot: string; result: AdminLineResult }[] = [];
  for (const draft of drafts) {
    if (existing?.saved[draft.line.slot]) continue;
    const parsed = draftResult(draft);
    if (parsed.error) errors[draft.line.slot] = parsed.error;
    const missingSide = draft.line.noPlayer
      ? "ours"
      : draft.line.opponentNoPlayer
        ? "theirs"
        : null;
    if (
      missingSide &&
      (!parsed.result ||
        parsed.result.kind !== "outcome" ||
        parsed.result.outcome !== "forfeit" ||
        parsed.result.side !== missingSide)
    )
      errors[draft.line.slot] =
        "No player requires the matching forfeit result.";
    if (parsed.result)
      selected.push({ slot: draft.line.slot, result: parsed.result });
  }
  return {
    errors,
    selected,
    valid: Object.keys(errors).length === 0 && selected.length > 0,
  };
}
export function freezeDualRequest(
  programId: string,
  dual: CreateDualInput,
  drafts: DualResultDraft[],
  existing: AdminDualContext | null,
  uuid: () => string,
): AdminDualSubmissionInput {
  const checked = validateDualDraft(dual, drafts, existing);
  if (!checked.valid) throw new Error("Complete valid changes before review.");
  return JSON.parse(
    JSON.stringify({
      operationId: uuid(),
      programId,
      event: existing
        ? {
            kind: "existing",
            eventId: existing.eventId,
            fingerprint: existing.fingerprint,
          }
        : { kind: "new", dual: { ...dual, lines: drafts.map((d) => d.line) } },
      items: checked.selected.map((item) => ({ ...item, itemId: uuid() })),
    }),
  );
}
/** A later interrupted response must never erase an acknowledged success. */
export function retainSuccesses(
  previous: AdminResultItemOutcome[],
  next: AdminResultItemOutcome[],
) {
  const map = new Map(previous.map((item) => [item.itemId, item]));
  for (const item of next)
    if (map.get(item.itemId)?.status !== "succeeded")
      map.set(item.itemId, item);
  return [...map.values()];
}
