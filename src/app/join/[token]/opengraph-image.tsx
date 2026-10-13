import { resolveJoinStateOnce } from "@/lib/services/programs/join-state-server";
import { joinCard } from "@/lib/services/programs/join-card";
import { LINK_CARD_SIZE, linkCard, wordmarkCard } from "@/lib/og/link-card";

/**
 * The card a team's join link unfurls into. A join link is pasted into a
 * group chat, so this is the first thing a player sees: whose team it is and
 * what the link does. Drawn by `linkCard`, the layout every shared link's
 * card uses.
 *
 * `joinCard` decides what it says, by the page's own metadata rule: only the
 * JOIN-LINK states name the team. Every other state draws the bare wordmark —
 * the site's default card — and answers 200 like any other.
 */
export const alt = "Join your team on Advantage";
export const size = LINK_CARD_SIZE;
export const contentType = "image/png";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** `page.tsx`'s `readToken`: a broken escape resolves to `not_found`. */
function readToken(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export default async function Image({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const state = await resolveJoinStateOnce(readToken(token));

  const card = joinCard(state);
  return card ? linkCard(card) : wordmarkCard();
}
