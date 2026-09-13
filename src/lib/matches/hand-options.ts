import type { Backhand, Hand } from "./patch-match";

/**
 * Hand and backhand, as the Edit Match dialog offers them. Stored raw
 * ("right", "two-handed") in `matches.player_hand` and friends — the same
 * values the upload wizard and the profile form write.
 */
export const HAND_OPTIONS: readonly { value: Hand; label: string }[] = [
  { value: "right", label: "Right" },
  { value: "left", label: "Left" },
];

export const BACKHAND_OPTIONS: readonly { value: Backhand; label: string }[] = [
  { value: "two-handed", label: "Two-handed" },
  { value: "one-handed", label: "One-handed" },
];
