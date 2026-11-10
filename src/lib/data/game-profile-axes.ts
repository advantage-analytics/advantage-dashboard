/**
 * The Game profile radar's six axes (design canvas "Match page refinements",
 * board 10), each a rate of the player's, 0–100%. `rows` are the season Head
 * to head rows the axis pools (`gameProfileValues`, `player-season.ts`) —
 * Return won pools the first- and second-serve return rows' made and
 * attempts, so it is every return point the player played, not a mean of two
 * percentages.
 *
 * No imports on purpose: the client card (`season-game-profile-card.tsx`)
 * reads these, and importing them from `player-season.ts` would carry the
 * whole season fold and the report's calculators into its bundle.
 */
export const GAME_PROFILE_AXES = [
  { label: "1st serve in", rows: ["First serve in"] },
  { label: "1st serve won", rows: ["First serve points won"] },
  { label: "2nd serve won", rows: ["Second serve points won"] },
  {
    label: "Return won",
    rows: ["First serve returns won", "Second serve returns won"],
  },
  { label: "Net won", rows: ["Net points won"] },
  { label: "BP converted", rows: ["Break points converted"] },
] as const;

/** One radar shape: a value per `GAME_PROFILE_AXES` entry, `null` with no attempts. */
export type GameProfileValues = (number | null)[];

/**
 * How many recent matches the swap combines, and the record it needs before
 * it is offered: with five or fewer, the last five would be nearly the whole
 * season, so the card shows the last match only.
 */
export const GAME_PROFILE_RECENT = 5;
