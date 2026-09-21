"use client";

/**
 * The Film room's point filter model (artboard 46c, lines 853–999). The
 * panel that edits it is `film-advanced-panel.tsx`; this file keeps the
 * documented field mapping and the re-exports the rest of the room imports.
 *
 * ── Which fields back which control ─────────────────────────────────────────
 * Every option below reads a `MatchPoint` field that already exists; nothing
 * here needs a new query, a new column, or a derivation the page cannot check.
 * The mapping, once, so it is arguable rather than magic:
 *
 *   Pressure       `isBreakPoint` · `isSetPoint || isMatchPoint`
 *   Deuce / game   `pointScore`, which the parser writes SERVER-FIRST
 *                  ("40-40", "AD-40") — see `process-match/index.ts`, which is
 *                  also why nothing in this file flips it by side
 *   Ball           `firstShotType`, the serve picked by ROLE via `pickServeShot`
 *   Aces / DFs     `resultType`
 *   T/body/wide    `firstShotZone` ("T" | "Body" | "Wide" in the live data)
 *   Wing           `secondShotType`, the return picked by `pickReturnShot`
 *   Return in play `secondShotResult` ("In" | "Out" | "Net")
 *   Result         `resultType` + `rallyLength`
 *   Point went to  `wonByPlayer1` vs `sides.you.isPlayer1` — the ONLY you/opp
 *                  test in this subtree (guardrails §4)
 *
 * ── How the groups combine ──────────────────────────────────────────────────
 * The four segmented rows are single-choice AND constraints. Each checkbox
 * list is one OR group — the artboard draws them as one list apiece, so
 * "Aces" plus "To the T" means aces OR T serves, not the empty set that ANDing
 * them would produce. Groups AND together.
 *
 * ── Apply, not live ─────────────────────────────────────────────────────────
 * The artboard carries both an Apply button and per-option counts. Counts
 * preview against the DRAFT (so a count answers "what would this give me"),
 * and the list only narrows when Apply is pressed. Clear all is the exception:
 * it resets the draft AND commits, because there is nothing to preview about
 * an empty filter.
 */

export type {
  PressureCut,
  BallCut,
  WingCut,
  OutcomeCut,
  ScoreKey,
  ServeKey,
  ReturnKey,
  ResultKey,
  ServerCut,
  CourtCut,
  EndedKey,
  ShotKey,
  FilmFilters,
} from "./filters/types";
export {
  DEFAULT_FILM_FILTERS,
  hasActiveFilmFilters,
  courtSideOf,
  applyFilmFilters,
  lastNameOf,
  describeFilmCut,
  cutName,
  countFilmOption,
  parseCut,
  serializeCut,
} from "./filters/types";
