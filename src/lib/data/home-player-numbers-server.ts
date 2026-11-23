import { cache } from "react";
import type { ProfileKpi } from "@/lib/data/player-profile";
import { seasonStrip } from "@/lib/data/player-profile";
import {
  getPlayerMatchSides,
  profileResultsFrom,
} from "@/lib/data/player-profile-server";

/**
 * A player's own season figures inside a program, for their Team Home.
 *
 * The same rows and the same arithmetic as their profile page
 * (`getPlayerMatchSides` → `profileResultsFrom` → `seasonStrip`), so a figure
 * here and the same figure on the profile cannot disagree — and `cache()`
 * means a request that draws both reads once. Empty for an id that names
 * nobody on the roster.
 */
export const getPlayerHomeKpis = cache(async function getPlayerHomeKpis(
  programId: string,
  playerId: string,
): Promise<ProfileKpi[]> {
  const sides = await getPlayerMatchSides(programId, playerId);
  if (!sides) return [];
  return seasonStrip(profileResultsFrom(sides.own)).kpis;
});
