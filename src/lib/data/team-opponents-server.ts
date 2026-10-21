import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getMemberAvatarUrls } from "@/lib/data/member-avatars-server";
import {
  loadTeamOpponents,
  type TeamOpponentsData,
} from "@/lib/data/opponents-load";

export type { TeamOpponentsData } from "@/lib/data/opponents-load";

/**
 * The team Opponents page's one read, on the cookie-bound server client. The
 * read itself is `loadTeamOpponents()` (`opponents-load.ts`), which takes
 * the client so `/api/mcp` can make the same read on a bearer one; this
 * wrapper supplies the session and the members' photos. Sits BESIDE
 * `opponents-server.ts`, not in it: that file is the program directory and
 * the pooled public-record views; this is the program's own match history.
 */
export const getTeamOpponents = cache(async function getTeamOpponents(
  programId: string,
  viewerId: string,
): Promise<TeamOpponentsData> {
  const supabase = await createClient();
  const avatarUrls = await getMemberAvatarUrls(supabase, programId);
  return loadTeamOpponents(supabase, programId, viewerId, avatarUrls);
});
