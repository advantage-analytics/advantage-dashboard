import Link from "next/link";
import {
  ClaimShell,
  ClaimColumn,
  ClaimHeading,
  ClaimActions,
  CLAIM_BUTTON,
} from "@/components/claim/claim-shell";
import {
  JoinReady,
  JoinSignIn,
  JoinSignUp,
  JoinWrongAccount,
} from "@/components/join/join-forms";
import { resolveJoinState } from "@/lib/services/programs/invite-acceptance";

export const metadata = { title: "Join your program" };

/**
 * Where an invitation link lands.
 *
 * The last missing piece of the invite flow: `inviteMember()` writes the row
 * and mails the token, and this is what the token opens. Before both, a coach
 * could press Invite, watch it say "outstanding" forever, and the person named
 * would never hear anything — and could not have accepted if they had.
 *
 * Seven states, and every one of them is a real thing that happens rather than
 * a defensive branch. Three carry a form; four are dead ends with a way out,
 * and those are the ones worth designing, because an invitation that fails is
 * the moment somebody decides whether this product is worth the trouble.
 *
 * ── Deliberately not a route handler ────────────────────────────────────────
 * A GET that accepted the invitation on sight would be simpler, and wrong:
 * mail clients and security scanners fetch links before a person ever sees
 * them, so the invitation would be consumed — sometimes joining the wrong
 * account, always by a machine. Acceptance is a POST behind a button, which is
 * also why the page renders under `dynamic = 'force-dynamic'`: its answer
 * depends on a session and on a row that changes underneath it.
 */
export const dynamic = "force-dynamic";

/** The chrome every state on this page shares. */
function JoinPane({
  width = 720,
  eyebrow,
  title,
  body,
  children,
}: {
  width?: 440 | 720;
  eyebrow?: string;
  title: string;
  body?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <ClaimShell width={width} gap={20} exitHref="/" exitLabel="Leave">
      <ClaimColumn gap={20}>
        <ClaimHeading
          gap={2}
          eyebrow={eyebrow}
          title={title}
          titlePadTop={8}
          body={body}
          bodyMax="58ch"
        />
        {children}
      </ClaimColumn>
    </ClaimShell>
  );
}

export default async function JoinPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const state = await resolveJoinState(decodeURIComponent(token));

  switch (state.kind) {
    // Revoked, mistyped, or never real. One message for all three, because
    // distinguishing them would confirm to whoever is holding a bad token
    // whether it was ever a good one.
    case "not_found":
      return (
        <JoinPane
          width={440}
          eyebrow="Invitation"
          title="That link isn't valid"
          body="It may have been withdrawn, or already replaced by a newer one. Ask whoever invited you to send another."
        >
          <ClaimActions>
            <Link href="/login" className={CLAIM_BUTTON}>
              Go to sign in
            </Link>
          </ClaimActions>
        </JoinPane>
      );

    case "expired":
      return (
        <JoinPane
          width={440}
          eyebrow={state.programName}
          title="That invitation has expired"
          body="Invitations last two weeks. Ask a coach on the program to send you a new one — it takes them a click."
        >
          <ClaimActions>
            <Link href="/login" className={CLAIM_BUTTON}>
              Go to sign in
            </Link>
          </ClaimActions>
        </JoinPane>
      );

    // Not an error worth apologising for. The overwhelmingly likely reader is
    // someone who already joined and clicked the old mail again, so the screen
    // points at the door rather than explaining itself.
    case "already_used":
      return (
        <JoinPane
          width={440}
          eyebrow={state.programName}
          title="You've already used this invitation"
          body="If that was you, sign in and you'll find the program waiting. If it wasn't, tell a coach on the program."
        >
          <ClaimActions>
            <Link href="/login" className={CLAIM_BUTTON}>
              Go to sign in
            </Link>
          </ClaimActions>
        </JoinPane>
      );

    case "wrong_account":
      return (
        <JoinPane
          eyebrow={state.programName}
          title="You're signed in as someone else"
        >
          <JoinWrongAccount
            token={token}
            invitedEmail={state.invitedEmail}
            signedInAs={state.signedInAs}
          />
        </JoinPane>
      );

    case "ready":
      return (
        <JoinPane eyebrow={state.programName} title="Join your program">
          <JoinReady
            token={token}
            programName={state.programName}
            role={state.role}
          />
        </JoinPane>
      );

    case "sign_in":
      return (
        <JoinPane eyebrow={state.programName} title="Sign in to join">
          <JoinSignIn
            token={token}
            programName={state.programName}
            role={state.role}
            email={state.email}
          />
        </JoinPane>
      );

    case "sign_up":
      return (
        <JoinPane eyebrow={state.programName} title="Set up your account">
          <JoinSignUp
            token={token}
            programName={state.programName}
            role={state.role}
            email={state.email}
          />
        </JoinPane>
      );
  }
}
