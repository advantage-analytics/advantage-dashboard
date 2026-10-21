import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import {
  loadPersonalOpponents,
  type PersonalOpponentsData,
} from "@/lib/data/opponents-load";
import { getMyPlayerIdsOrThrow } from "@/lib/data/player-identity-server";

export type { PersonalOpponentsData } from "@/lib/data/opponents-load";

/**
 * The personal Opponents page's one read, on the cookie-bound server client.
 * The read itself is `loadPersonalOpponents()` (`opponents-load.ts`), which
 * takes the client so `/api/mcp` can make the same read on a bearer one;
 * this wrapper only supplies the session. Sits BESIDE `opponents-server.ts`,
 * not in it: that file is the team product's — program-keyed, nothing in it
 * takes a user id.
 */
export const getPersonalOpponents = cache(async function getPersonalOpponents(
  userId: string,
): Promise<PersonalOpponentsData> {
  const [supabase, myPlayerIds] = await Promise.all([
    createClient(),
    getMyPlayerIdsOrThrow(),
  ]);
  return loadPersonalOpponents(supabase, userId, myPlayerIds);
});
