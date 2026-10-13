import { resolveJoinStateOnce } from "@/lib/services/programs/join-state-server";
import { LINK_CARD_SIZE, linkCard, wordmarkCard } from "@/lib/og/link-card";

/**
 * The card a team's join link unfurls into. A join link is pasted into a
 * group chat, so this is the first thing a player sees: whose team it is and
 * what the link does. Drawn by `linkCard`, the layout every shared link's
 * card uses.
 *
 * It follows the page's own metadata rule (`generateMetadata` in `page.tsx`):
 * only the JOIN-LINK states name the team. An invitation was addressed to one
 * person, and a token that is unknown, spent or expired must read exactly
 * like one that never existed, so every other state draws the bare wordmark —
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

  switch (state.kind) {
    case "link_sign_up":
    case "link_ready":
      return linkCard({
        headline: state.programName,
        line: "Join as a player",
        facts: "Create an account or sign in to join.",
        kicker: "Team invite",
      });
    // A full team's card must not invite people to a join the page will
    // refuse; it says what the page says.
    case "link_full":
      return linkCard({
        headline: state.programName,
        line: "Every player seat is taken",
        lineTone: "quiet",
        facts: "Ask a coach to free one.",
        kicker: "Team invite",
      });
    default:
      return wordmarkCard();
  }
}
