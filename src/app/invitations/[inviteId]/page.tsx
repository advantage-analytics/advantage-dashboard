import Link from "next/link";
import { redirect } from "next/navigation";
import {
  CLAIM_BUTTON,
  ClaimActions,
  ClaimHeading,
  ClaimShell,
} from "@/components/claim/claim-shell";
import { InviteOffer } from "@/components/join/invite-offer";
import { ROLE_NOUN } from "@/components/join/join-terms";
import { NothingSent } from "@/components/join/nothing-sent";
import { getPendingInvites } from "@/lib/data/pending-invites-server";
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
 * treated as one: `getPendingInvites()` reads AS THE CALLER through
 * `pending_program_invites()`, and an id outside that list is simply not here.
 *
 * ── One sentence for every absence ──────────────────────────────────────────
 * Accepted, withdrawn, expired, and addressed to somebody else all render the
 * same pane, with the same body. Telling them apart would answer questions
 * about other people's invitations for anyone who pastes an id, and none of the
 * four readings is worth that.
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
 * and the action stamps `onboarded_at` either way.
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
  // flag and the way back from it are all the same address, and only the id
  // ever travels in it — never the address it was sent to.
  const here = `/invitations/${encodeURIComponent(inviteId)}`;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // `/login` is the one form that knows every way into a session, and `?next=`
  // brings them back here — clamped by `safeNext`, which a same-origin path
  // passes unchanged.
  if (!user) redirect(`/login?next=${encodeURIComponent(here)}`);

  const invite = (await getPendingInvites(supabase)).find(
    (row) => row.id === inviteId
  );

  if (!invite) {
    return (
      // 440 is the width of a screen with nothing to do on it. Composed from
      // `ClaimShell` rather than `JoinPane` for the one thing that differs:
      // everyone reading this is signed in, so the ✕ belongs on the dashboard
      // and not on the marketing home.
      <ClaimShell
        width={440}
        gap={20}
        exitHref="/dashboard"
        exitLabel="Back to dashboard"
      >
        <ClaimHeading
          gap={2}
          eyebrow="Invitation"
          title="That invitation isn't available"
          titlePadTop={8}
          body="It may have been accepted, withdrawn, or sent to a different address."
          bodyMax="58ch"
        />
        <ClaimActions>
          {/* CLAIM_BUTTON is `advButton("primary")` — the same primary the
              rest of this flow wears. */}
          <Link href="/dashboard" className={CLAIM_BUTTON}>
            Go to dashboard
          </Link>
        </ClaimActions>
      </ClaimShell>
    );
  }

  // 8.3a. A flag on a GET and nothing else: declining must leave the row
  // exactly as it found it, and `reviewHref` is the way back to the offer.
  if (query["not-now"] === "1") {
    return (
      <NothingSent
        reviewHref={here}
        programName={invite.programName}
        inviterName={invite.inviterName}
      />
    );
  }

  const { programHours, personalHours } = quotaHours(invite.programOrgType);

  return (
    // `ClaimShell` supplies the centre column itself, so there is no second
    // `ClaimColumn` here.
    <ClaimShell
      width={720}
      gap={20}
      exitHref="/dashboard"
      exitLabel="Back to dashboard"
    >
      <ClaimHeading
        gap={2}
        eyebrow={invite.programName}
        title="You've been invited"
        titlePadTop={8}
        // `inviterName` is however much of a person this flow is allowed to
        // name, and it is printed whole or not at all.
        body={
          invite.inviterName
            ? `${invite.inviterName} invited you to join ${invite.programName} as ${ROLE_NOUN[invite.role]}.`
            : `You've been invited to join ${invite.programName} as ${ROLE_NOUN[invite.role]}.`
        }
        bodyMax="58ch"
      />
      <InviteOffer
        invites={[invite]}
        programHours={programHours}
        personalHours={personalHours}
        notNowHref={`${here}?not-now=1`}
      />
    </ClaimShell>
  );
}
