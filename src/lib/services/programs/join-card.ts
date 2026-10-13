import type { LinkCard } from "@/lib/og/link-card";
import type { JoinState } from "./invite-acceptance";

/**
 * What a join link's preview card says, or null when it must say nothing —
 * pure, so the offline specs can hold the rule.
 *
 * Only the JOIN-LINK states name the team, the same rule `generateMetadata`
 * follows in `app/join/[token]/page.tsx`. An invitation was addressed to one
 * person, and a token that is unknown, spent or expired must read exactly
 * like one that never existed: those answer null, and the route draws the
 * bare wordmark.
 */
export function joinCard(state: JoinState): LinkCard | null {
  switch (state.kind) {
    case "link_sign_up":
    case "link_ready":
      return {
        headline: state.programName,
        line: "Join as a player",
        facts: "Create an account or sign in to join.",
        kicker: "Team invite",
      };
    // A full team's card must not invite people to a join the page will
    // refuse; it says what the page says.
    case "link_full":
      return {
        headline: state.programName,
        line: "Every player seat is taken",
        lineTone: "quiet",
        facts: "Ask a coach to free one.",
        kicker: "Team invite",
      };
    default:
      return null;
  }
}
