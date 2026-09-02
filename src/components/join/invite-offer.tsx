"use client";

import { useState, useTransition, type TransitionStartFunction } from "react";
import { CLAIM_BUTTON, ClaimActions } from "@/components/claim/claim-shell";
import { advButton } from "@/lib/ui/adv-button";
import {
  JoinQuotaFooter,
  JoinSharingTerms,
  NotNowLink,
  Problem,
  ROLE_NOUN,
} from "@/components/join/join-terms";
import { acceptPendingInvite } from "@/lib/services/programs/join-actions";
import type { PendingInvite } from "@/lib/data/pending-invites-server";

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
 * same quiet outline button and the screen keeps its hands off the choice.
 *
 * `ClaimHeading` is not rendered here. The pane and its title belong to the
 * page hosting this, which is the only thing that knows whether the person
 * arrived at a dedicated screen or an intercept.
 */
export function InviteOffer({
  invites,
  programHours,
  personalHours,
  notNowHref,
}: {
  invites: PendingInvite[];
  /** The program's real monthly allowance, in hours. See `JoinQuotaNote`. */
  programHours: number;
  /** The personal allowance the same person already has. */
  personalHours: number;
  /** Where declining goes. Composed by the caller — see `NotNowLink`. */
  notNowHref: string;
}) {
  const single = invites.length === 1 ? invites[0] : null;

  return (
    <div className="flex flex-col gap-4">
      <JoinSharingTerms />
      {single ? (
        <SingleInvite invite={single} notNowHref={notNowHref}>
          <JoinQuotaFooter
            programHours={programHours}
            personalHours={personalHours}
          />
        </SingleInvite>
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {invites.map((invite) => (
              <InviteRow key={invite.id} invite={invite} />
            ))}
          </ul>
          <ClaimActions>
            <NotNowLink href={notNowHref} />
            <JoinQuotaFooter
              programHours={programHours}
              personalHours={personalHours}
            />
          </ClaimActions>
        </>
      )}
    </div>
  );
}

/** One invitation: the primary button, named after the program it joins. */
function SingleInvite({
  invite,
  notNowHref,
  children,
}: {
  invite: PendingInvite;
  notNowHref: string;
  /** The quota footer, composed by the caller for the same reason the forms do. */
  children: React.ReactNode;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <>
      <ClaimActions>
        {/* CLAIM_BUTTON is `advButton("primary")` — the same primary every
            other screen in this flow wears. */}
        <button
          type="button"
          disabled={pending}
          className={CLAIM_BUTTON}
          onClick={() => accept(invite.id, start, setError)}
        >
          {pending ? "Joining…" : `Join ${invite.programName}`}
        </button>
        <NotNowLink href={notNowHref} />
        {children}
      </ClaimActions>
      <Problem message={error} />
    </>
  );
}

/**
 * One row of several. Its own pending and error state, because two rows can be
 * pressed in either order and a shared spinner would put the second person's
 * failure under the first person's button.
 */
function InviteRow({ invite }: { invite: PendingInvite }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <li className="flex flex-col gap-2 border-t border-[var(--border-hairline)] pt-3 first:border-t-0 first:pt-0">
      <div className="flex items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-body-sm truncate">{invite.programName}</span>
          {/* One string, printed whole. `inviterName` is however much of a
              person this flow is allowed to name — never split for effect. */}
          <span className="text-micro truncate">
            as {ROLE_NOUN[invite.role]}
            {invite.inviterName ? ` · from ${invite.inviterName}` : ""}
          </span>
        </div>
        <button
          type="button"
          disabled={pending}
          className={advButton("outline", "sm")}
          onClick={() => accept(invite.id, start, setError)}
        >
          {pending ? "Joining…" : "Join"}
        </button>
      </div>
      <Problem message={error} />
    </li>
  );
}

/**
 * The accept, once, for both shapes.
 *
 * On success the action redirects and this never resolves, so there is no
 * success branch to write. Only a refusal comes back.
 */
function accept(
  inviteId: string,
  start: TransitionStartFunction,
  setError: (message: string | null) => void
) {
  start(async () => {
    setError(null);
    const result = await acceptPendingInvite(inviteId);
    if (result && !result.ok) setError(result.error);
  });
}
