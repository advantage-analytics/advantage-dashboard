import {
  DEFAULT_FORM_DATA,
  STEP_ORDER_BY_KIND,
  type FormData,
  type MatchDraft,
} from "@/components/dashboard/matches/new-match-wizard/types";
import type { ProviderId, ProviderKind } from "@/lib/services/upload/types";

/**
 * A wizard draft built from a few typed facts — the Ask MCP connector's
 * `prepare_video_upload` (docs/ask-mcp-connector.md §3).
 *
 * A connector call cannot carry a video, and the three answers the vendor
 * refuses a job without (who was at the top of the frame, ad scoring, a
 * fixed camera) are asked in the wizard on purpose — `docs/ui-revamp-
 * guardrails.md` §4: when they are wrong every statistic lands on the wrong
 * player with nothing looking broken. So the connector seeds a DRAFT and
 * hands the person a `?draft=` link: the wizard resumes it as it resumes a
 * "Save draft" row (`useUploadMatchWizard`, the `draft` branch), lands on the
 * file step (`draftResumeStep`), and asks the rest itself. Nothing here is a
 * match, a job or a score.
 *
 * The form is `DEFAULT_FORM_DATA` plus what was said. The score is a HINT:
 * `playerScores` / `opponentScores` pre-fill the cells, the score step still
 * parses and confirms them, and `matches.score` is written by the wizard's
 * save alone (never by this helper, never on inference — feedback
 * `never-edit-user-scores`). Tiebreak points are not taken: a set given as
 * "7-6" lands as 7-6 with the tiebreak cells empty, and the wizard asks.
 *
 * Pure. Imports only types and two constants from the wizard's `types.ts`,
 * which has no runtime dependency on React or Next.
 */

/** The providers a draft may name, by the ids `providerRegistry` knows. */
export const PREFILL_PROVIDERS = {
  advantage_intelligence: { id: "splitstep", kind: "processing" },
  swingvision: { id: "swing-vision", kind: "import" },
} as const satisfies Record<string, { id: ProviderId; kind: ProviderKind }>;

export type PrefillProvider = keyof typeof PREFILL_PROVIDERS;

export interface DraftPrefill {
  id: string;
  provider: PrefillProvider;
  opponentName: string;
  /** `YYYY-MM-DD`, already validated by the caller. */
  date: string;
  /** Sets as typed, "6-4 3-6 7-5"; parsed by `parseScoreHint`. */
  score?: string | null;
  tournamentName?: string | null;
  round?: string | null;
  matchType?: string | null;
  courtType?: string | null;
  /** The roster player's name in a program scope; the uploader in a personal one. */
  playerName?: string | null;
}

export type ScoreHint =
  | { ok: true; player: number[]; opponent: number[] }
  | { ok: false; reason: string };

/** The most sets a score may carry — `parseScore`'s cap in `patch-match.ts`. */
const MAX_SETS = 5;

/**
 * "6-4 3-6 7-5" → two game arrays, the player's first. Separators are
 * spaces or commas; a set is two non-negative integers joined by "-" (or
 * "–"). Tiebreak points in parentheses, "7-6(5)", are accepted and dropped.
 * Anything else is refused with the sentence the tool shows.
 */
export function parseScoreHint(text: string): ScoreHint {
  const sets = text
    .trim()
    .split(/[\s,]+/)
    .filter((part) => part !== "");
  if (sets.length === 0) {
    return { ok: false, reason: "Give the score as sets, like 6-4 3-6 7-5." };
  }
  if (sets.length > MAX_SETS) {
    return { ok: false, reason: `A match has at most ${MAX_SETS} sets.` };
  }
  const player: number[] = [];
  const opponent: number[] = [];
  for (const set of sets) {
    const match = /^(\d{1,2})[-–](\d{1,2})(?:\(\d{1,2}\))?$/.exec(set);
    if (!match) {
      return {
        ok: false,
        reason: `"${set}" is not a set. Give the score as sets, like 6-4 3-6 7-5.`,
      };
    }
    player.push(Number(match[1]));
    opponent.push(Number(match[2]));
  }
  return { ok: true, player, opponent };
}

/**
 * The draft, as `saveMatchDraft` would store one from the wizard's own
 * state — the whole `MatchDraft` minus `updatedAt`, which the row stamps.
 * `score` must already have passed `parseScoreHint`; a hint that did not is
 * the caller's refusal, not a silent empty card.
 */
export function matchDraftFromPrefill(
  input: DraftPrefill,
  score: { player: number[]; opponent: number[] } | null,
): Omit<MatchDraft, "updatedAt"> {
  const provider = PREFILL_PROVIDERS[input.provider];
  const steps = STEP_ORDER_BY_KIND[provider.kind];
  const sets = Math.max(score?.player.length ?? 0, 3);
  const pad = (values: number[] | undefined): (number | null)[] =>
    Array.from({ length: sets }, (_, i) => values?.[i] ?? null);
  const formData: FormData = {
    ...DEFAULT_FORM_DATA,
    date: input.date,
    // No time: `buildMatchData` stores the bare day, which is what
    // `matches.date` means (match-day.ts).
    time: "",
    opponentName: input.opponentName.trim(),
    opponentSource: "new",
    playerName: input.playerName?.trim() ?? "",
    eventName: input.tournamentName?.trim() ?? "",
    round: input.round?.trim() ?? "",
    matchType: input.matchType?.trim() ?? "",
    courtType: input.courtType?.trim() ?? "",
    playerScores: pad(score?.player),
    opponentScores: pad(score?.opponent),
    playerTiebreaks: pad(undefined),
    opponentTiebreaks: pad(undefined),
    numberOfSets: sets,
    dateSource: "new",
  };
  return {
    id: input.id,
    // The file step: where the wizard lands a resumed draft anyway, since
    // the file never survives one.
    step: "file",
    stepIndex: steps.indexOf("file"),
    stepCount: steps.length,
    provider: provider.id,
    formData,
    fileName: null,
    preset: null,
    attachedLine: null,
  };
}

/** The flat columns `match_drafts` lists a row by, beside the payload. */
export function draftRowSummary(draft: Omit<MatchDraft, "updatedAt">): {
  playerName: string | null;
  eventLabel: string | null;
} {
  return {
    playerName: draft.formData.playerName || null,
    eventLabel: draft.formData.eventName || null,
  };
}
