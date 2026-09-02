import Link from "next/link";
import { redirect } from "next/navigation";
import { ClaimActions, CLAIM_BUTTON } from "@/components/claim/claim-shell";
import {
  JoinAskAgain,
  JoinReady,
  JoinSignUp,
  JoinWrongAccount,
} from "@/components/join/join-forms";
import { JoinPane } from "@/components/join/join-pane";
import { NothingSent } from "@/components/join/nothing-sent";
import { resolveJoinState } from "@/lib/services/programs/invite-acceptance";
import {
  isNotNow,
  joinHref,
  signInThenHref,
} from "@/lib/services/programs/join-links";
import { quotaHours } from "@/lib/services/programs/join-quota";

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
 * a defensive branch. Two carry a form; one carries no screen at all, because
 * `sign_in` means the account exists and signing into an account that exists
 * belongs to `/login?next=`, not to a password box grown on an invitation link;
 * four are ends with a way out, and those are the ones worth designing, because
 * an invitation that fails is the moment somebody decides whether this product
 * is worth the trouble. Two of them are no longer dead: an expired link can ask
 * the coach who sent it for another (9.2a), and the two form states can be
 * declined without spending anything (8.3a) — `?not-now=1`, an eighth render of
 * the same seven states.
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

export default async function JoinPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { token } = await params;
  const query = await searchParams;
  const state = await resolveJoinState(decodeURIComponent(token));
  // 'college' where the state carries no org type — those branches (not_found,
  // expired, already_used, wrong_account) never render an allowance figure.
  const { programHours, personalHours } = quotaHours(
    "programOrgType" in state ? state.programOrgType : "college"
  );

  // "Not now" is a query flag and nothing else — see `NotNowLink`. It only
  // means anything on the three screens that were offering a Join button;
  // everywhere else the state itself is the answer.
  const declined = isNotNow(query);

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

    // 9.2a. Not a dead end: the product knows exactly who sent this and can
    // ask them, which is more than the person reading it can do with the
    // information this page is willing to give them.
    case "expired":
      return (
        <JoinPane
          width={440}
          eyebrow={state.programName}
          title="That invitation has expired"
          body={
            state.inviterName
              ? `Invitations last two weeks. Ask ${state.inviterName} for another, or we can nudge them for you.`
              : "Invitations last two weeks. Ask a coach on the program for another, or we can nudge them for you."
          }
        >
          <JoinAskAgain token={token} inviterName={state.inviterName} />
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
      if (declined) {
        return (
          <NothingSent
            reviewHref={joinHref(token)}
            programName={state.programName}
            inviterName={state.inviterName}
          />
        );
      }
      return (
        <JoinPane eyebrow={state.programName} title="Join your program">
          <JoinReady
            token={token}
            programName={state.programName}
            role={state.role}
            programHours={programHours}
            personalHours={personalHours}
          />
        </JoinPane>
      );

    // The account already exists, so signing in is auth's job and never this
    // page's. `/login` is the one form that knows every way into a session —
    // password today, Google beside it, whatever it grows next — and `?next=`
    // brings them back to this token, by then answering `ready`. No "not now"
    // branch: there is no Join button on this state to decline, and the
    // invitation is untouched either way.
    case "sign_in":
      redirect(signInThenHref(joinHref(token)));

    case "sign_up":
      if (declined) {
        return (
          <NothingSent
            reviewHref={joinHref(token)}
            programName={state.programName}
            inviterName={state.inviterName}
          />
        );
      }
      return (
        <JoinPane eyebrow={state.programName} title="Set up your account">
          <JoinSignUp
            token={token}
            programName={state.programName}
            role={state.role}
            email={state.email}
            programHours={programHours}
            personalHours={personalHours}
          />
        </JoinPane>
      );
  }
}
