"use client";

import { JoinPane } from "@/components/join/join-pane";
import { ClaimActions, CLAIM_BUTTON } from "@/components/claim/claim-shell";

/**
 * A shared match report that failed to load — a database or configuration
 * error, not a bad token (that is the page's own "That link isn't valid"
 * pane). Same frame as the not-found pane, so a reader who hits either sees
 * one product, and a retry rather than Next's generic error screen.
 *
 * No digest or support address here: the reader is a stranger to the app
 * and cannot act on either. The sharer can, from their own report.
 */
export default function SharedMatchError({ reset }: { reset: () => void }) {
  return (
    <JoinPane
      width={440}
      eyebrow="Match report"
      title="This report didn't load"
      body="Something went wrong on our side. Try again in a moment."
    >
      <ClaimActions>
        <button type="button" onClick={reset} className={CLAIM_BUTTON}>
          Try again
        </button>
      </ClaimActions>
    </JoinPane>
  );
}
