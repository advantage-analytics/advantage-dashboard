import { cache } from "react";
import { resolveJoinState, type JoinState } from "./invite-acceptance";
import { joinTokenFromPath } from "./join-links";

/**
 * `resolveJoinState`, once per request.
 *
 * `/join/[token]` reads the state twice — `generateMetadata` for the tab title
 * and link preview, then the page — and React `cache()` makes those one read.
 * Here rather than in `invite-acceptance.ts` so that module stays free of a
 * React import its offline specs would have to load.
 */
export const resolveJoinStateOnce = cache((token: string): Promise<JoinState> =>
  resolveJoinState(token),
);

/**
 * The team a sign-in is for, when `next` is a join link — otherwise null.
 *
 * `/login` and `/sign-up` receive only a path. When that path is
 * `/join/<token>` the header can say "Sign in to join <team>" instead of the
 * generic welcome, which is the difference between a detour that explains
 * itself and one that looks like the link broke.
 *
 * Only the states that still lead to a Join button name the team. A spent,
 * expired or unknown token answers null, so these pages never confirm more
 * about a token than the join page itself would on the way back.
 */
export async function joinProgramNameForNext(
  next: string,
): Promise<string | null> {
  const token = joinTokenFromPath(next);
  if (!token) return null;

  const state = await resolveJoinStateOnce(token);
  switch (state.kind) {
    case "ready":
    case "sign_up":
    case "link_ready":
    case "link_sign_up":
      return state.programName;
    default:
      return null;
  }
}
