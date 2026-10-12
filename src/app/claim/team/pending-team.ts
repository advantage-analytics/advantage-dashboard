import { isSquadAllowed, toSquad, type Squad } from "@/lib/data/squad";
import { cookies } from "next/headers";
import {
  isCustomOrgType,
  type CustomOrgType,
} from "@/lib/services/programs/custom-org";

export { isCustomOrgType };

/**
 * The custom-team setup values, parked between `/claim/team/setup` and the
 * pilot terms screen.
 *
 * The team does not exist until the coach accepts the terms, so what they
 * typed has to survive one navigation without a row to live in. An httpOnly
 * cookie scoped to `/claim/team` rather than search params: a team name in a
 * URL lands in history, logs and referrers, and a URL can be handed to someone
 * else. The cookie is only a carrier, never an authority. Whatever it holds
 * is re-read through `readPendingTeam()`'s shape checks here and validated
 * again by `createCustomProgram()` and its RPC before anything is written, so
 * editing it is no different from typing different values into the form.
 *
 * Kept after a refused create (e.g. `limit-reached`) so Back to setup comes up
 * with the name still typed; cleared once the team exists.
 */
export const PENDING_TEAM_COOKIE = "adv_pending_team";

/** Thirty minutes: long enough to read the terms, short enough to go stale. */
export const PENDING_TEAM_MAX_AGE = 60 * 30;

export const PENDING_TEAM_COOKIE_OPTIONS = {
  path: "/claim/team",
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  maxAge: PENDING_TEAM_MAX_AGE,
};

export interface PendingTeam {
  name: string;
  orgType: CustomOrgType;
  ownerName: string;
  /** Men's, women's or co-ed — the setup form's required Team answer. */
  team: Squad;
}

/** Longest value either text field may carry through the cookie. */
const MAX_TEXT = 200;

/** Shape-check an untrusted value into a `PendingTeam`, or null. */
export function toPendingTeam(value: unknown): PendingTeam | null {
  if (!value || typeof value !== "object") return null;
  const { name, orgType, ownerName, team } = value as Record<string, unknown>;
  if (typeof name !== "string" || typeof ownerName !== "string") return null;
  if (!isCustomOrgType(orgType)) return null;
  if (name.length > MAX_TEXT || ownerName.length > MAX_TEXT) return null;
  // A cookie parked before the form asked carries no squad. It reads as no
  // pending team at all, so the coach lands back on setup and answers.
  const squad = toSquad(team);
  if (!squad || !isSquadAllowed(orgType, squad)) return null;
  return { name, orgType, ownerName, team: squad };
}

export async function readPendingTeam(): Promise<PendingTeam | null> {
  const raw = (await cookies()).get(PENDING_TEAM_COOKIE)?.value;
  if (!raw) return null;
  try {
    return toPendingTeam(JSON.parse(raw));
  } catch {
    return null;
  }
}
