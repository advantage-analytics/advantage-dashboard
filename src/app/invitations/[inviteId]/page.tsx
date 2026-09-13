import Link from "next/link";
import { redirect } from "next/navigation";
import {
  CLAIM_BUTTON,
  CLAIM_LINK,
  ClaimActions,
} from "@/components/claim/claim-shell";
import { InviteOffer } from "@/components/join/invite-offer";
import { JoinPane } from "@/components/join/join-pane";
import { NothingSent } from "@/components/join/nothing-sent";
import { loadPendingInvites } from "@/lib/data/pending-invites-server";
import {
  invitationHref,
  isNotNow,
  notNowHref,
  signInThenHref,
} from "@/lib/services/programs/join-links";
import { inviteSentence } from "@/lib/services/programs/join-role";
import { quotaHours } from "@/lib/services/programs/join-quota";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Your invitation" };

/**
 * One invitation, opened by the person it was sent to.
 *
 * The other door into Stage 8. `/join/[token]` is reached by holding the
 * mailed link; this is reached by someone already signed in — from the header's
 * activity tray, or from a link they kept — and there is no token to hold up.
 * So the proof is the session, and the id in the URL is not a secret and is not
 * treated as one: the list is read AS THE CALLER through
 * `pending_program_invites()`, and an id outside that list is simply not here.
 *
 * ── One sentence for every absence ──────────────────────────────────────────
 * Accepted, withdrawn, expired, and addressed to somebody else all render the
 * same pane, with the same body. Telling them apart would answer questions
 * about other people's invitations for anyone who pastes an id, and none of the
 * four readings is worth that. A database that did not answer is not a fifth
 * reading of the row — it says nothing about any row — so it gets its own
 * pane, with a way to try again, rather than a verdict the reader will believe.
 *
 * ── Deliberately not a route handler ────────────────────────────────────────
 * The same reason `/join/[token]` is a page rather than a GET that accepts on
 * sight: mail clients and security scanners fetch links before a person ever
 * sees them, so the invitation would be spent by a machine. Acceptance is a
 * POST behind a button — `acceptPendingInvite()`, from `InviteOffer` — which is
 * also why this renders under `dynamic = 'force-dynamic'`: its answer depends
 * on a session and on a row that changes underneath it.
 *
 * The dashboard's onboarding gate does not reach here, because this route sits
 * outside `/dashboard`. That is deliberate rather than an oversight: an account
 * that has not answered the persona question can still accept from a tray link,
 * and the action stamps `onboarded_at` either way. Every pane's ✕ is
 * `JoinPane`'s, which resolves against the session and lands a signed-in
 * reader on the dashboard.
 */
export const dynamic = "force-dynamic";

export default async function InvitationPage({
  params,
  searchParams,
}: {
  params: Promise<{ inviteId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { inviteId } = await params;
  const query = await searchParams;

  // This page's own URL, composed once. The sign-in round trip, the decline
  // flag, the way back from it and the retry are all the same address, and
  // only the id ever travels in it — never the address it was sent to.
  const here = invitationHref(inviteId);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(signInThenHref(here));

  const invites = await loadPendingInvites(supabase);

  if (invites === null) {
    return (
      <JoinPane
        width={440}
        eyebrow="Invitation"
        title="We couldn't load this invitation"
        body="Nothing has changed on your side. Try again in a moment."
      >
        <ClaimActions>
          <Link href={here} className={CLAIM_BUTTON}>
            Try again
          </Link>
          <Link href="/dashboard" className={CLAIM_LINK}>
            Go to dashboard
          </Link>
        </ClaimActions>
      </JoinPane>
    );
  }

  const invite = invites.find((row) => row.id === inviteId);

  if (!invite) {
    return (
      <JoinPane
        width={440}
        eyebrow="Invitation"
        title="That invitation isn't available"
        body="It may have been accepted, withdrawn, or sent to a different address."
      >
        <ClaimActions>
          <Link href="/dashboard" className={CLAIM_BUTTON}>
            Go to dashboard
          </Link>
        </ClaimActions>
      </JoinPane>
    );
  }

  // 8.3a. A flag on a GET and nothing else: declining must leave the row
  // exactly as it found it, and `reviewHref` is the way back to the offer.
  if (isNotNow(query)) {
    return (
      <NothingSent
        reviewHref={here}
        programName={invite.programName}
        inviterName={invite.inviterName}
      />
    );
  }

  return (
    <JoinPane
      eyebrow={invite.programName}
      title="You've been invited"
      body={inviteSentence(invite)}
    >
      <InviteOffer
        invites={[{ ...invite, ...quotaHours(invite.programOrgType) }]}
        notNowHref={notNowHref(here)}
      />
    </JoinPane>
  );
}
