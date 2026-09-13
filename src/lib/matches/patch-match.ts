/**
 * The Edit Match dialog's PATCH body, turned into a `matches` update — pure, so
 * every rule below is testable without a request or a database.
 *
 * Three things this deliberately does NOT do, each a bug the endpoint used to
 * have:
 *
 * - **It never writes `result`.** That column is the score's context line
 *   ("Timofey Stepanov Wins", "Retired", "Unfinished") — `matchContext` reads
 *   it verbatim. Rewriting it to "win"/"loss" on every score edit printed those
 *   words under the score.
 * - **It keeps a decided winner the score cannot see.** A retirement stores
 *   `score.winner` from "who retired" (the wizard's `retiredWinner`); a set
 *   count would hand the match to whoever led when play stopped. The stored
 *   winner survives unless the new score decides the match outright.
 * - **It stores the day, not an instant.** The dialog edits a calendar date.
 *   `new Date("2025-01-31").toISOString()` is UTC midnight, which reads as the
 *   30th west of Greenwich. Noon is what `recordResult` writes for the same
 *   reason.
 *
 * And two gates:
 *
 * - A match on a scheduled line takes its event, date, round, type and surface
 *   from the event (E1). Those fields are refused rather than silently ignored,
 *   so a stale dialog learns why.
 * - Format is editable only on a hand-scored match that isn't on a line. An
 *   analyzed match was scored point by point with its format; changing it here
 *   would not re-run anything, and the stats would quietly disagree.
 */

import { setWinner } from "@/components/dashboard/matches/new-match-wizard/score-state";
import { normalizeRound, roundFits, roundKindFor } from "./round-options";

export const HANDS = ["right", "left"] as const;
export const BACKHANDS = ["one-handed", "two-handed"] as const;
export type Hand = (typeof HANDS)[number];
export type Backhand = (typeof BACKHANDS)[number];

export interface MatchScore {
  player1: number[];
  player2: number[];
  player1_tiebreaks?: (number | null)[];
  player2_tiebreaks?: (number | null)[];
  winner?: "player1" | "player2" | null;
}

/** The dialog's score cells: one entry per set, null where nothing is typed. */
export interface ScoreCells {
  player: readonly (number | null)[];
  opponent: readonly (number | null)[];
  playerTiebreaks: readonly (number | null)[];
  opponentTiebreaks: readonly (number | null)[];
}

/**
 * The score a save sends, or why it can't.
 *
 * An empty cell is never a 0: trailing sets with nothing typed are dropped,
 * and a set with only one side's games refuses the save rather than becoming
 * "6-0". A card left entirely empty sends no score — the stored one is left
 * alone — unless the match had sets, in which case clearing them all is
 * refused. (`score: null` means "don't send it".)
 */
export function scoreForSave(
  cells: ScoreCells,
  storedHadSets: boolean,
):
  | { ok: true; score: Omit<MatchScore, "winner"> | null }
  | { ok: false; error: string } {
  let sets = Math.max(cells.player.length, cells.opponent.length);
  while (
    sets > 0 &&
    cells.player[sets - 1] == null &&
    cells.opponent[sets - 1] == null
  ) {
    sets--;
  }
  if (sets === 0) {
    return storedHadSets
      ? { ok: false, error: "Enter the score." }
      : { ok: true, score: null };
  }
  const player1: number[] = [];
  const player2: number[] = [];
  for (let i = 0; i < sets; i++) {
    const p = cells.player[i];
    const o = cells.opponent[i];
    if (p == null || o == null) {
      return { ok: false, error: `Set ${i + 1} needs both players' games.` };
    }
    player1.push(p);
    player2.push(o);
  }
  const tiebreaks = (arr: readonly (number | null)[]) =>
    Array.from({ length: sets }, (_, i) => arr[i] ?? null);
  return {
    ok: true,
    score: {
      player1,
      player2,
      player1_tiebreaks: tiebreaks(cells.playerTiebreaks),
      player2_tiebreaks: tiebreaks(cells.opponentTiebreaks),
    },
  };
}

export interface MatchFormat {
  best_of?: number;
  ad_scoring?: boolean | null;
  play_on_lets?: boolean | null;
}

/** What the stored row contributes to the decision. */
export interface StoredMatchForPatch {
  score: MatchScore | null;
  format: MatchFormat | null;
  /** On a scheduled line. */
  linked: boolean;
  /** Has a processing job (video) or came from a file — not hand-scored. */
  analyzed: boolean;
  /** Filed under a program — a team match, whose player comes from the roster. */
  teamMatch?: boolean;
  /** As stored, for judging a round against its match type. */
  matchType?: string | null;
  round?: string | null;
}

export type PatchResult =
  | { ok: true; update: Record<string, unknown> }
  | { ok: false; error: string; field?: string };

/** Fields a scheduled line decides. */
const EVENT_OWNED_FIELDS = [
  "tournament_name",
  "round",
  "date",
  "match_type",
  "court_type",
] as const;

const TEXT_FIELDS = [
  "tournament_name",
  "match_type",
  "court_type",
  "player1_name",
  "player2_name",
] as const;

const HAND_FIELDS = {
  player_hand: HANDS,
  opponent_hand: HANDS,
  player_backhand: BACKHANDS,
  opponent_backhand: BACKHANDS,
} as const;

function trimOrNull(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t === "" ? null : t;
}

function isNonNegInt(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 0;
}

/**
 * Who won, by tennis rules, or null while the match is undecided. A match is
 * decided once one side has won more than half the sets the score holds —
 * best of 3 needs 2, a single-set match needs 1.
 */
export function decidedWinner(
  player1: readonly number[],
  player2: readonly number[],
  bestOf: number,
): "player1" | "player2" | null {
  const toWin = Math.ceil(bestOf / 2);
  let p1 = 0;
  let p2 = 0;
  for (let i = 0; i < player1.length; i++) {
    const w = setWinner(player1[i], player2[i]);
    if (w === "player") p1++;
    else if (w === "opponent") p2++;
  }
  if (p1 >= toWin && p1 > p2) return "player1";
  if (p2 >= toWin && p2 > p1) return "player2";
  return null;
}

function parseScore(
  value: unknown,
  stored: StoredMatchForPatch,
): MatchScore | string {
  if (!value || typeof value !== "object") return "Enter a score.";
  const v = value as Record<string, unknown>;
  if (!Array.isArray(v.player1) || !Array.isArray(v.player2)) {
    return "Enter a score.";
  }
  if (v.player1.length !== v.player2.length) {
    return "Both players need a score for every set.";
  }
  if (v.player1.length === 0) return "Enter at least one set.";
  if (v.player1.length > 5) return "A match has at most five sets.";
  if (!v.player1.every(isNonNegInt) || !v.player2.every(isNonNegInt)) {
    return "Games must be whole numbers.";
  }
  const tiebreaks = (
    arr: unknown,
    sets: number,
  ): (number | null)[] | string => {
    if (arr === undefined || arr === null) return Array(sets).fill(null);
    if (!Array.isArray(arr)) return "Tiebreak points must be numbers.";
    const out: (number | null)[] = [];
    for (let i = 0; i < sets; i++) {
      const x = arr[i];
      if (x === null || x === undefined || x === "") out.push(null);
      else if (isNonNegInt(x)) out.push(x);
      else return "Tiebreak points must be whole numbers.";
    }
    return out;
  };
  const sets = v.player1.length;
  const tb1 = tiebreaks(v.player1_tiebreaks, sets);
  const tb2 = tiebreaks(v.player2_tiebreaks, sets);
  if (typeof tb1 === "string") return tb1;
  if (typeof tb2 === "string") return tb2;

  const player1 = v.player1 as number[];
  const player2 = v.player2 as number[];
  const bestOf = stored.format?.best_of ?? 3;
  const decided = decidedWinner(player1, player2, Math.max(bestOf, 1));
  const unchanged =
    stored.score !== null &&
    sameSets(stored.score.player1, player1) &&
    sameSets(stored.score.player2, player2);

  // The stored winner wins ties with the arithmetic: an unchanged score keeps
  // it outright. A changed score keeps it only when the stored sets never
  // decided the match — a retirement's winner, which no set count can see. A
  // winner the old sets decided is the arithmetic's, and goes with them.
  const storedWinner = stored.score?.winner ?? null;
  const storedDecided = stored.score
    ? decidedWinner(
        stored.score.player1 ?? [],
        stored.score.player2 ?? [],
        Math.max(bestOf, 1),
      )
    : null;
  const retirementWinner = storedDecided === null ? storedWinner : null;
  const winner =
    unchanged && storedWinner
      ? storedWinner
      : (decided ?? retirementWinner ?? null);

  return {
    player1,
    player2,
    player1_tiebreaks: tb1,
    player2_tiebreaks: tb2,
    winner,
  };
}

function sameSets(a: readonly number[] | undefined, b: readonly number[]) {
  return !!a && a.length === b.length && a.every((n, i) => n === b[i]);
}

export function normalizeMatchPatch(
  body: Record<string, unknown>,
  stored: StoredMatchForPatch,
): PatchResult {
  const update: Record<string, unknown> = {};

  if (stored.linked) {
    const locked = EVENT_OWNED_FIELDS.find((key) => key in body);
    if (locked) {
      return {
        ok: false,
        error:
          "This match is on a scheduled event, so that comes from the event. Change it in Schedule.",
        field: locked,
      };
    }
  }

  for (const key of TEXT_FIELDS) {
    if (!(key in body)) continue;
    const v = trimOrNull(body[key]);
    if (v !== undefined) update[key] = v;
  }
  if ("player1_name" in update && update.player1_name === null) {
    return {
      ok: false,
      error: "Enter your player's name.",
      field: "player1_name",
    };
  }
  // A team match's player is a roster player, chosen by id. The route checks
  // the id against the program's roster and writes the name from that row;
  // here it is only refused where the dialog never offers it — a personal
  // match, one whose line decides its player, or an analyzed one. `match_stats`
  // is keyed on `is_player1`, not on a player id, so moving an analyzed
  // match's player would silently hand every computed stat to someone else
  // (`docs/ui-revamp-guardrails.md` §2).
  if ("player1_id" in body) {
    if (!stored.teamMatch || stored.linked || stored.analyzed) {
      return {
        ok: false,
        error: !stored.teamMatch
          ? "Only a team match picks its player from the roster."
          : stored.linked
            ? "This match's player comes from the lineup. Change it in Schedule."
            : "This match was analyzed for its player, so the player can't change.",
        field: "player1_id",
      };
    }
    if (typeof body.player1_id !== "string" || body.player1_id === "") {
      return { ok: false, error: "Choose a player.", field: "player1_id" };
    }
    update.player1_id = body.player1_id;
  }

  if ("round" in body) {
    const kind = roundKindFor(
      typeof update.match_type === "string" || update.match_type === null
        ? (update.match_type as string | null)
        : (stored.matchType ?? null),
    );
    const next = normalizeRound(
      typeof body.round === "string" ? body.round : null,
    );
    const legacy = normalizeRound(stored.round ?? null);
    if (kind === null) {
      update.round = null;
    } else if (next === null || roundFits(next, kind) || next === legacy) {
      update.round = next;
    } else {
      return {
        ok: false,
        error: "Choose a round from the list.",
        field: "round",
      };
    }
  }

  if ("player2_name" in update && update.player2_name === null) {
    return {
      ok: false,
      error: "Enter the opponent's name.",
      field: "player2_name",
    };
  }

  if ("date" in body) {
    const raw = typeof body.date === "string" ? body.date.trim() : "";
    const day = /^(\d{4}-\d{2}-\d{2})/.exec(raw)?.[1];
    if (!day) return { ok: false, error: "Enter the date.", field: "date" };
    const probe = new Date(`${day}T12:00:00Z`);
    if (
      Number.isNaN(probe.getTime()) ||
      probe.toISOString().slice(0, 10) !== day
    ) {
      return { ok: false, error: "That date doesn't exist.", field: "date" };
    }
    update.date = `${day}T12:00:00`;
  }

  for (const [key, allowed] of Object.entries(HAND_FIELDS)) {
    if (!(key in body)) continue;
    const v = body[key];
    if (v === null || v === "") {
      update[key] = null;
    } else if (
      typeof v === "string" &&
      (allowed as readonly string[]).includes(v)
    ) {
      update[key] = v;
    } else {
      return {
        ok: false,
        error: "Choose one of the listed options.",
        field: key,
      };
    }
  }

  if ("format" in body) {
    if (stored.analyzed || stored.linked) {
      return {
        ok: false,
        error: stored.linked
          ? "The format comes from the scheduled event."
          : "This match was analyzed with its format, so it can't change.",
        field: "format",
      };
    }
    const f = body.format as Record<string, unknown> | null;
    if (!f || typeof f !== "object") {
      return { ok: false, error: "Choose a format.", field: "format" };
    }
    const next: MatchFormat = { ...(stored.format ?? {}) };
    if ("best_of" in f) {
      if (![1, 3, 5].includes(f.best_of as number)) {
        return {
          ok: false,
          error: "Choose best of 1, 3 or 5.",
          field: "format",
        };
      }
      next.best_of = f.best_of as number;
    }
    for (const flag of ["ad_scoring", "play_on_lets"] as const) {
      if (!(flag in f)) continue;
      if (f[flag] !== null && typeof f[flag] !== "boolean") {
        return {
          ok: false,
          error: "Choose one of the listed options.",
          field: "format",
        };
      }
      next[flag] = f[flag] as boolean | null;
    }
    update.format = next;
  }

  if ("score" in body) {
    const scoreStored: StoredMatchForPatch =
      update.format !== undefined
        ? { ...stored, format: update.format as MatchFormat }
        : stored;
    const parsed = parseScore(body.score, scoreStored);
    if (typeof parsed === "string")
      return { ok: false, error: parsed, field: "score" };
    update.score = parsed;
  }

  if (Object.keys(update).length === 0) {
    return { ok: false, error: "Nothing to save." };
  }
  return { ok: true, update };
}
