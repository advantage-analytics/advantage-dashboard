/**
 * The wizard, opened to add a video to `matchId` — or a fresh wizard for null.
 *
 * `/dashboard/matches/new?match=` is the one entry point: its page decides
 * whether this match can take a video there (`getAddVideoTarget()`) and sends
 * every other match somewhere that can. Client-safe, so a link can import it.
 */
export function addVideoHref(matchId: string | null): string {
  return matchId
    ? `/dashboard/matches/new?match=${encodeURIComponent(matchId)}`
    : "/dashboard/matches/new";
}
