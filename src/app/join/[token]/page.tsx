import Link from "next/link";
import {
  ClaimShell,
  ClaimColumn,
  ClaimHeading,
  ClaimActions,
  CLAIM_BUTTON,
  CLAIM_LINK,
} from "@/components/claim/claim-shell";
import {
  JoinAskAgain,
  JoinReady,
  JoinSignIn,
  JoinSignUp,
  JoinWrongAccount,
} from "@/components/join/join-forms";
import { resolveJoinState } from "@/lib/services/programs/invite-acceptance";
import { getMonthlyCapSeconds } from "@/lib/services/splitstep/config";
import { monthlyCapSecondsFor } from "@/lib/services/splitstep/quota";
import type { ProgramOrgType } from "@/lib/workspace/types";

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
 * a defensive branch. Three carry a form; four are ends with a way out, and
 * those are the ones worth designing, because an invitation that fails is the
 * moment somebody decides whether this product is worth the trouble. Two of
 * them are no longer dead: an expired link can ask the coach who sent it for
 * another (9.2a), and the three form states can be declined without spending
 * anything (8.3a) — `?not-now=1`, an eighth render of the same seven states.
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

/**
 * The two allowances 8.2's footer compares, in hours.
 *
 * Read here, on the server, from the function `reserveQuota()` asks when it
 * decides whether a submission is refused — so the number a player is shown at
 * the moment they agree to join is the number that will actually be enforced.
 * Which is why it takes the program's org type: a custom org's allowance is
 * the reduced tier (`quotaTierFor()`), and quoting a club's invitee the
 * collegiate 75 hours would break exactly the promise this comment makes.
 * The page hands the forms two plain numbers rather than letting them import
 * this: `splitstep/config` also carries the vendor's internal name, and none of
 * that belongs in a client bundle.
 */
function quotaHours(orgType: ProgramOrgType): {
  programHours: number;
  personalHours: number;
} {
  return {
    programHours: monthlyCapSecondsFor({ kind: "team", orgType }) / 3600,
    personalHours: getMonthlyCapSeconds("individual") / 3600,
  };
}

/**
 * 8.3a — declined, and kept open.
 *
 * Reached by a link, so there is nothing to undo: no row was written, the token
 * is unspent, and the coach who sent it has not been told. That last one is the
 * promise the screen makes out loud, and it is only worth making because the
 * route that renders it cannot write anything.
 */
function NothingSent({
  token,
  programName,
  inviterName,
}: {
  token: string;
  programName: string;
  inviterName: string | null;
}) {
  return (
    <JoinPane
      width={440}
      eyebrow={programName}
      title="Nothing was sent"
      body={
        <>
          {inviterName ? `${inviterName} wasn't` : "Nobody was"} notified. The
          invitation stays open until you use it or it expires.
        </>
      }
    >
      <div className="flex items-center gap-3 border-t border-[var(--border-hairline)] pt-4">
        <span
          aria-hidden="true"
          className="flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-element)] bg-[var(--surface-subtle)] text-[12px] font-medium text-[var(--ink-700)]"
        >
          {programName.trim().charAt(0).toUpperCase()}
        </span>
        <span className="text-body-sm min-w-0 flex-1 truncate">
          Join {programName}
        </span>
        <Link href={`/join/${encodeURIComponent(token)}`} className={CLAIM_LINK}>
          Review
        </Link>
      </div>
    </JoinPane>
  );
}

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
  const declined = query["not-now"] === "1";

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
            token={token}
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

    case "sign_in":
      if (declined) {
        return (
          <NothingSent
            token={token}
            programName={state.programName}
            inviterName={state.inviterName}
          />
        );
      }
      return (
        <JoinPane eyebrow={state.programName} title="Sign in to join">
          <JoinSignIn
            token={token}
            programName={state.programName}
            role={state.role}
            email={state.email}
            programHours={programHours}
            personalHours={personalHours}
          />
        </JoinPane>
      );

    case "sign_up":
      if (declined) {
        return (
          <NothingSent
            token={token}
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
