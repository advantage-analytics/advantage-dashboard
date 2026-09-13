"use client";

import { useState, useTransition } from "react";
import { CLAIM_BUTTON, ClaimActions } from "@/components/claim/claim-shell";
import { advButton } from "@/lib/ui/adv-button";
import {
  JoinQuotaFooter,
  JoinQuotaNote,
  JoinSharingTerms,
  NotNowLink,
  Problem,
} from "@/components/join/join-terms";
import { inviteSubtitle } from "@/lib/services/programs/join-role";
import { acceptPendingInvite } from "@/lib/services/programs/join-actions";
import type { PendingInvite } from "@/lib/data/pending-invites-server";

/**
 * An invitation with the two allowance figures its footer quotes.
 *
 * The figures ride on each invitation rather than on the pane, because a list
 * can mix a collegiate program and a club: one draws the program tier, the
 * other the individual one, and a single footer under both would promise one
 * of them a number that will not be enforced. The page computes them server
 * side with `quotaHours()` — the same function the spend asks — so the number
 * shown is the number enforced, per row.
 */
export type OfferedInvite = PendingInvite & {
  /** The program's real monthly allowance, in hours. See `JoinQuotaNote`. */
  programHours: number;
  /** The personal allowance the same person already has. */
  personalHours: number;
};

/**
 * The invitations waiting for someone who is already signed in.
 *
 * The same offer as `/join/[token]`, reached without a token: the person made
 * an account first and opened the mail second, or never. So the accept takes an
 * invitation id, and the server binds it to the session's confirmed address —
 * nothing here proves anything, and nothing here may try to.
 *
 * The one rule: `JoinSharingTerms` renders once, above every button, on both
 * shapes. Stage 8's whole argument is that nobody reaches a Join button without
 * passing what the program will be able to see, and this is the surface where
 * it would be easiest to quietly drop — a list of two rows with an outline
 * button on each looks like a settings screen, not like a decision.
 *
 * Two shapes, because one invitation and several are different questions. One
 * is "will you join this program", and gets the primary button and the
 * program's name on it. Several is "which of these", and a primary button on
 * any single row would answer it on the reader's behalf; so every row gets the
 * same quiet outline button and its own allowance line, and the screen keeps
 * its hands off the choice.
 *
 * `ClaimHeading` is not rendered here. The pane and its title belong to the
 * page hosting this, which is the only thing that knows whether the person
 * arrived at a dedicated screen or an intercept.
 */
export function InviteOffer({
  invites,
  notNowHref,
}: {
  invites: OfferedInvite[];
  /** Where declining goes. Composed by the caller — see `NotNowLink`. */
  notNowHref: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      <JoinSharingTerms />
      {invites.length === 1 ? (
        <SingleInvite invite={invites[0]} notNowHref={notNowHref} />
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {invites.map((invite) => (
              <InviteRow key={invite.id} invite={invite} />
            ))}
          </ul>
          <ClaimActions>
            <NotNowLink href={notNowHref} />
          </ClaimActions>
        </>
      )}
    </div>
  );
}

/**
 * The accept, once, for both shapes.
 *
 * Each button owns its own pending and error state, because two rows can be
 * pressed in either order and a shared spinner would put the second person's
 * failure under the first person's button. On success the action redirects
 * and the transition never settles, so there is no success branch to write —
 * only a refusal comes back.
 */
function useAccept(inviteId: string) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = () =>
    start(async () => {
      setError(null);
      const result = await acceptPendingInvite(inviteId);
      if (result && !result.ok) setError(result.error);
    });

  return { pending, error, run };
}

/** One invitation: the primary button, named after the program it joins. */
function SingleInvite({
  invite,
  notNowHref,
}: {
  invite: OfferedInvite;
  notNowHref: string;
}) {
  const { pending, error, run } = useAccept(invite.id);

  return (
    <>
      <ClaimActions>
        <button
          type="button"
          disabled={pending}
          className={CLAIM_BUTTON}
          onClick={run}
        >
          {pending ? "Joining…" : `Join ${invite.programName}`}
        </button>
        <NotNowLink href={notNowHref} />
        <JoinQuotaFooter
          programHours={invite.programHours}
          personalHours={invite.personalHours}
        />
      </ClaimActions>
      <Problem message={error} />
    </>
  );
}

/** One row of several: the program, the role, who asked, its allowance, and a quiet Join. */
function InviteRow({ invite }: { invite: OfferedInvite }) {
  const { pending, error, run } = useAccept(invite.id);

  return (
    <li className="flex flex-col gap-2 border-t border-[var(--border-hairline)] pt-3 first:border-t-0 first:pt-0">
      <div className="flex items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-body-sm truncate">{invite.programName}</span>
          <span className="text-micro truncate">{inviteSubtitle(invite)}</span>
          <JoinQuotaNote
            programHours={invite.programHours}
            personalHours={invite.personalHours}
          />
        </div>
        <button
          type="button"
          disabled={pending}
          className={advButton("outline", "sm")}
          onClick={run}
        >
          {pending ? "Joining…" : "Join"}
        </button>
      </div>
      <Problem message={error} />
    </li>
  );
}
