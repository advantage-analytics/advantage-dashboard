/**
 * Round choices for the Edit Match dialog, keyed by match type — and the one
 * place a round's spelling is settled on its way in.
 *
 * `matches.round` holds short codes everywhere the schedule reads it: the
 * tournament ladder (`ROUND_ORDER` — Q1…R16…F…C3, what `roundRank` sorts and
 * `program_event_outcomes` checks) and a dual's line slot (S1…D3). The upload
 * wizard's Round menu saves long labels ("Round of 16"), which none of those
 * readers recognise. The dialog reads both and saves the code; a value that is
 * neither survives as its own option rather than being cleared.
 */

import { ROUND_ORDER } from "@/lib/schedule/format";

interface RoundOption {
  value: string;
  label: string;
}

const TOURNAMENT_LABEL: Record<string, string> = {
  Q1: "Qualifying 1",
  Q2: "Qualifying 2",
  Q3: "Qualifying 3",
  R128: "Round of 128",
  R64: "Round of 64",
  R32: "Round of 32",
  R16: "Round of 16",
  QF: "Quarterfinal",
  SF: "Semifinal",
  F: "Final",
  C1: "Consolation 1",
  C2: "Consolation 2",
  C3: "Consolation 3",
};

const TOURNAMENT_ROUNDS: readonly RoundOption[] = ROUND_ORDER.map((code) => ({
  value: code,
  label: TOURNAMENT_LABEL[code] ?? code,
}));

const DUAL_LINES: readonly RoundOption[] = [
  ...[1, 2, 3, 4, 5, 6].map((n) => ({ value: `S${n}`, label: `Singles ${n}` })),
  ...[1, 2, 3].map((n) => ({ value: `D${n}`, label: `Doubles ${n}` })),
];

/** The wizard's long labels, and the other spellings people type, → codes. */
const LONG_TO_CODE: Record<string, string> = {
  "round of 128": "R128",
  "round of 64": "R64",
  "round of 32": "R32",
  "round of 16": "R16",
  quarterfinal: "QF",
  quarterfinals: "QF",
  "quarter-final": "QF",
  "quarter-finals": "QF",
  semifinal: "SF",
  semifinals: "SF",
  "semi-final": "SF",
  "semi-finals": "SF",
  final: "F",
  finals: "F",
};

/** A stored or typed round as its short code, or trimmed as-is when unknown. */
export function normalizeRound(
  value: string | null | undefined,
): string | null {
  const trimmed = value?.trim() ?? "";
  if (trimmed === "") return null;
  const upper = trimmed.toUpperCase();
  if (TOURNAMENT_LABEL[upper] || DUAL_LINES.some((o) => o.value === upper)) {
    return upper;
  }
  return LONG_TO_CODE[trimmed.toLowerCase()] ?? trimmed;
}

type RoundKind = "tournament" | "dual" | null;

/** Which list a match type draws from; Practice and unset have no round. */
export function roundKindFor(matchType: string | null | undefined): RoundKind {
  if (matchType === "Tournament") return "tournament";
  if (matchType === "Dual Match") return "dual";
  return null;
}

export function roundOptionsFor(kind: RoundKind): readonly RoundOption[] {
  if (kind === "tournament") return TOURNAMENT_ROUNDS;
  if (kind === "dual") return DUAL_LINES;
  return [];
}

/** Whether a round belongs to the list its match type shows. */
export function roundFits(round: string | null, kind: RoundKind): boolean {
  if (round === null) return true;
  return roundOptionsFor(kind).some((option) => option.value === round);
}
