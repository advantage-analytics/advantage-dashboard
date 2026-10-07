"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import posthog from "posthog-js";
import { isPostHogConfigured } from "@/lib/posthog-client";
import {
  CLAIM_BUTTON,
  CLAIM_FIELD,
  CLAIM_LABEL,
  CLAIM_LINK,
  ClaimActions,
} from "@/components/claim/claim-shell";
import { advButton } from "@/lib/ui/adv-button";
import {
  JoinQuotaFooter,
  JoinSharingTerms,
  NotNowLink,
  Problem,
} from "@/components/join/join-terms";
import {
  acceptInvite,
  acceptJoinLink,
  createAccountAndAccept,
  createAccountAndJoinByLink,
  requestFreshInvite,
  signOutForInvite,
} from "@/lib/services/programs/join-actions";
import {
  joinHref,
  notNowHref,
  signInThenHref,
  type JoinLinkMode,
} from "@/lib/services/programs/join-links";
import type { InviterName } from "@/lib/services/programs/invite-acceptance";
import { ROLE_NOUN, type JoinRole } from "@/lib/services/programs/join-role";
import { PASSWORD_RULE } from "@/lib/auth/error-messages";

/**
 * The interactive half of `/join/[token]`.
 *
 * Four components for four situations, rather than one form that branches. The
 * branch is decided server-side by `resolveJoinState` before anything renders,
 * so a component that also had to decide would be asking a question already
 * answered — and asking it from the browser, where the answer cannot be
 * trusted.
 *
 * None of them carries an email field. The invitation is bound to one address
 * and the server reads it from the invitation; a field here would imply the
 * person could change it, and the only thing changing it can do is fail.
 */

/**
 * What the two accepting screens share.
 *
 * The sharing terms and the quota line are the same on both, and the design's
 * whole argument for 8.2 is that nobody reaches a Join button without passing
 * them. Threading the same two props through each form rather than letting
 * each one decide is what keeps that true when a third is added.
 */
interface JoinTermsProps {
  /** The program's real monthly allowance, in hours. See `JoinQuotaNote`. */
  programHours: number;
  /** The personal allowance the same person already has. */
  personalHours: number;
}

/** Signed in as the invited address. One button. */
export function JoinReady({
  token,
  programName,
  role,
  programHours,
  personalHours,
}: {
  token: string;
  programName: string;
  role: JoinRole;
} & JoinTermsProps) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="flex flex-col gap-4">
      <p className="text-body">
        You&apos;ll join {programName} as {ROLE_NOUN[role]}.
      </p>
      <JoinSharingTerms />
      <Problem message={error} />
      <ClaimActions>
        <button
          type="button"
          disabled={pending}
          className={CLAIM_BUTTON}
          onClick={() =>
            start(async () => {
              setError(null);
              // On success the action redirects and this never resolves, so
              // there is no success branch to write. Only a refusal comes back.
              const result = await acceptInvite(token);
              if (result && !result.ok) setError(result.error);
            })
          }
        >
          {pending ? "Joining…" : `Join ${programName}`}
        </button>
        <NotNowLink href={notNowHref(joinHref(token))} />
        <JoinQuotaFooter
          programHours={programHours}
          personalHours={personalHours}
        />
      </ClaimActions>
    </div>
  );
}

/** No account. Name, password, in. */
export function JoinSignUp({
  token,
  programName,
  role,
  email,
  programHours,
  personalHours,
}: {
  token: string;
  programName: string;
  role: JoinRole;
  email: string;
} & JoinTermsProps) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      noValidate
      // Same reason as the sign-in form: the cap belongs on the fields, not on
      // the block of terms above them.
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        start(async () => {
          setError(null);
          const result = await createAccountAndAccept(token, {
            firstName,
            lastName,
            password,
          });
          if (result && !result.ok) setError(result.error);
        });
      }}
    >
      <p className="text-body max-w-[58ch]">
        Set up your account and you&apos;ll join {programName} as{" "}
        {ROLE_NOUN[role]}. Your account uses{" "}
        <span className="text-[var(--ink-900)]">{email}</span>.
      </p>

      <JoinSharingTerms />

      <div className="flex max-w-[380px] gap-3">
        <div className="min-w-0 flex-1">
          <label className={CLAIM_LABEL} htmlFor="join-first">
            First name
          </label>
          <input
            id="join-first"
            autoComplete="given-name"
            className={CLAIM_FIELD}
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
          />
        </div>
        <div className="min-w-0 flex-1">
          <label className={CLAIM_LABEL} htmlFor="join-last">
            Last name
          </label>
          <input
            id="join-last"
            autoComplete="family-name"
            className={CLAIM_FIELD}
            value={lastName}
            onChange={(event) => setLastName(event.target.value)}
          />
        </div>
      </div>

      <div className="max-w-[380px]">
        <label className={CLAIM_LABEL} htmlFor="join-new-password">
          Password
        </label>
        <input
          id="join-new-password"
          type="password"
          autoComplete="new-password"
          aria-describedby="join-password-rule"
          className={CLAIM_FIELD}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        {/* Stated before it can be failed, matching the auth sign-up form.
            The server enforces the same rule either way; showing it only in
            the error means the first submit fails for a reason the person
            could have satisfied had anyone told them. */}
        <p
          id="join-password-rule"
          className="mt-1.5 text-[11px] leading-[16px] text-[var(--ink-500)]"
        >
          {PASSWORD_RULE}
        </p>
      </div>

      <Problem message={error} />

      <ClaimActions>
        <button type="submit" disabled={pending} className={CLAIM_BUTTON}>
          {pending ? "Joining…" : `Join ${programName}`}
        </button>
        <NotNowLink href={notNowHref(joinHref(token))} />
        {/* Some of the people reading this have never chosen a password for
            anything and are not about to start. Google is on `/login`, so the
            way to offer it here is to point at that page and come back — the
            same `?next=` the `sign_in` state redirects through. They return
            holding a session, and this screen becomes the Join button. */}
        <Link href={signInThenHref(joinHref(token))} className={CLAIM_LINK}>
          Sign in with Google instead
        </Link>
        <JoinQuotaFooter
          programHours={programHours}
          personalHours={personalHours}
        />
      </ClaimActions>
    </form>
  );
}

/**
 * Screen 9.2a — the expired link, and the one click that is left on it.
 *
 * The screen this replaces was a dead end wearing a "Go to sign in" button: it
 * told someone their invitation had lapsed and then asked them to go and find a
 * coach themselves, out of band, using contact details it declined to give
 * them. Stage 9's rule is that none of these states may end the conversation,
 * and this is the one where the product knows exactly who to ask.
 *
 * The confirmation replaces the button rather than sitting beside it, because
 * the only thing a second press could add is a second mail, and
 * `requestFreshInvite` refuses to send one. A button that stays live and
 * quietly does nothing teaches people to press it harder.
 */
export function JoinAskAgain({
  token,
  inviterName,
}: {
  token: string;
  inviterName: string | null;
}) {
  const [asked, setAsked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (asked) {
    return (
      <p className="text-body max-w-[56ch]" role="status">
        Your request is in.{" "}
        {inviterName
          ? `If ${inviterName} sends a new invite`
          : "If a new invite is sent"}
        , it will arrive at the same address this one did.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Problem message={error} />
      <ClaimActions>
        <button
          type="button"
          disabled={pending}
          className={advButton("outline", "sm")}
          onClick={() =>
            start(async () => {
              setError(null);
              const result = await requestFreshInvite(token);
              if (result.ok) setAsked(true);
              else setError(result.error);
            })
          }
        >
          {pending ? "Asking…" : "Ask for a new invite"}
        </button>
        <Link href="/login" className={CLAIM_LINK}>
          Go to sign in
        </Link>
      </ClaimActions>
    </div>
  );
}

/**
 * Signed in, but as somebody else.
 *
 * The commonest real case is a shared laptop or a personal account left open,
 * so the screen names both addresses rather than saying "wrong account" — the
 * fix is obvious the moment a person can see which one they are currently in.
 *
 * One button, and it does the whole fix. Signing out used to drop them back
 * here signed in as nobody, holding an invitation and a screen that had just
 * told them to open the link again — the link they were already on.
 * `signOutForInvite` now decides where the next step is: `/login?next=` when
 * the invited address already has an account, and straight back to this link
 * when it does not, where the page offers the sign-up form. Either way the
 * invitation is waiting on the other side, which is why the copy says
 * "continue" rather than "sign in".
 */
export function JoinWrongAccount({
  token,
  invitedEmail,
  signedInAs,
}: {
  token: string;
  invitedEmail: string;
  signedInAs: string;
}) {
  const [pending, start] = useTransition();

  return (
    <div className="flex flex-col gap-4">
      <p className="text-body max-w-[56ch]">
        This invitation was sent to{" "}
        <span className="text-[var(--ink-900)]">{invitedEmail}</span>, but
        you&apos;re signed in as{" "}
        <span className="text-[var(--ink-900)]">{signedInAs}</span>. Sign out,
        continue as {invitedEmail}, and you&apos;ll come straight back here.
      </p>
      <ClaimActions>
        <button
          type="button"
          disabled={pending}
          className={CLAIM_BUTTON}
          onClick={() =>
            start(() => {
              // This path exists to hand the browser to another account, and
              // the server action ends in a redirect — reset PostHog here, or
              // the next person inherits this one's identity and workspace.
              if (isPostHogConfigured) posthog.reset();
              return signOutForInvite(token);
            })
          }
        >
          {pending ? "Signing out…" : "Sign out and continue"}
        </button>
      </ClaimActions>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Join links — the reusable, un-addressed door (`program_join_links`)
// ---------------------------------------------------------------------------

/**
 * Signed in, holding a live join link. One button.
 *
 * A form action rather than a click handler, so the join is a POST by
 * construction: nothing the page renders on a GET can reach `acceptJoinLink`.
 * On success the action redirects (into the program, or back here as
 * `link_requested` in approve mode), so only a refusal ever comes back.
 */
export function JoinLinkReady({
  token,
  programName,
  mode,
  inviterName,
  rosterMatchName,
  programHours,
  personalHours,
}: {
  token: string;
  programName: string;
  mode: JoinLinkMode;
  inviterName: InviterName;
  rosterMatchName: string | null;
} & JoinTermsProps) {
  const [result, submit, pending] = useActionState(
    () => acceptJoinLink(token),
    null,
  );
  const error = result && !result.ok ? result.error : null;
  const approve = mode === "approve";

  return (
    <form action={submit} className="flex flex-col gap-4">
      <p className="text-body max-w-[58ch]">
        {approve
          ? `${programName}’s coaches approve each person who joins by this link. You’ll join as a player once they do.`
          : "You’ll join as a player."}{" "}
        {inviterName
          ? `${inviterName} shared this link.`
          : "A coach shared this link."}
        {rosterMatchName && (
          <>
            {" "}
            Your coach already has you on the roster as{" "}
            <span className="text-[var(--ink-900)]">{rosterMatchName}</span> —
            your matches will be waiting.
          </>
        )}
      </p>
      <JoinSharingTerms />
      <Problem message={error} />
      <ClaimActions>
        <button type="submit" disabled={pending} className={CLAIM_BUTTON}>
          {approve
            ? pending
              ? "Sending…"
              : "Request to join"
            : pending
              ? "Joining…"
              : `Join ${programName}`}
        </button>
        <NotNowLink href={notNowHref(joinHref(token))} />
        <JoinQuotaFooter
          programHours={programHours}
          personalHours={personalHours}
        />
      </ClaimActions>
    </form>
  );
}

/**
 * Nobody signed in, holding a live join link.
 *
 * Unlike `JoinSignUp` this one asks for the address: the link was pasted into
 * a group chat, not mailed to anyone, so there is no address to read off it.
 * That is also why the account is not confirmed on the spot — see
 * `createAccountAndJoinByLink` — and why, in production, the form gives way to
 * a "check your email" note instead of landing inside the program.
 */
export function JoinLinkSignUp({
  token,
  programName,
  mode,
  programHours,
  personalHours,
}: {
  token: string;
  programName: string;
  mode: JoinLinkMode;
} & JoinTermsProps) {
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const approve = mode === "approve";

  // Confirmations on (the deployed configuration): the account exists but
  // cannot join until its address is proven. The mail's link comes back to
  // this token signed in, where the page answers `link_ready`.
  if (sentTo) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-body max-w-[58ch]" role="status">
          Check your email. We sent a confirmation to{" "}
          <span className="text-[var(--ink-900)]">{sentTo}</span> — open it and
          you&apos;ll land back here to finish joining.
        </p>
        <ClaimActions>
          <Link href="/claim/exit" className={advButton("ghost")}>
            Close
          </Link>
        </ClaimActions>
      </div>
    );
  }

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        start(async () => {
          setError(null);
          // A session at sign-up (confirmations off) ends in a redirect, so
          // only a refusal or the confirmation note ever comes back.
          const result = await createAccountAndJoinByLink(token, {
            email,
            firstName,
            lastName,
            password,
          });
          if (!result.ok) setError(result.error);
          else setSentTo(result.email);
        });
      }}
    >
      <p className="text-body max-w-[58ch]">
        {approve
          ? `Set up your account to ask to join ${programName}. Its coaches approve each person who joins by this link.`
          : `Set up your account and you’ll join ${programName} as a player.`}{" "}
        Use the address your coach has for you, if you have one — it puts you on
        your own roster row.
      </p>

      <JoinSharingTerms />

      <div className="flex max-w-[380px] flex-col gap-3.5">
        <div>
          <label className={CLAIM_LABEL} htmlFor="join-link-email">
            Email
          </label>
          <input
            id="join-link-email"
            type="email"
            autoComplete="email"
            placeholder="you@school.edu"
            className={CLAIM_FIELD}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        <div className="flex gap-3">
          <div className="min-w-0 flex-1">
            <label className={CLAIM_LABEL} htmlFor="join-link-first">
              First name
            </label>
            <input
              id="join-link-first"
              autoComplete="given-name"
              className={CLAIM_FIELD}
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
            />
          </div>
          <div className="min-w-0 flex-1">
            <label className={CLAIM_LABEL} htmlFor="join-link-last">
              Last name
            </label>
            <input
              id="join-link-last"
              autoComplete="family-name"
              className={CLAIM_FIELD}
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
            />
          </div>
        </div>
        <div>
          <label className={CLAIM_LABEL} htmlFor="join-link-password">
            Password
          </label>
          <input
            id="join-link-password"
            type="password"
            autoComplete="new-password"
            aria-describedby="join-link-password-rule"
            className={CLAIM_FIELD}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <p
            id="join-link-password-rule"
            className="mt-1.5 text-[11px] leading-[16px] text-[var(--ink-500)]"
          >
            {PASSWORD_RULE}
          </p>
        </div>
      </div>

      <Problem message={error} />

      <div className="border-t border-[var(--border-hairline)] pt-[18px]">
        <ClaimActions>
          <button type="submit" disabled={pending} className={CLAIM_BUTTON}>
            {pending
              ? approve
                ? "Sending…"
                : "Joining…"
              : approve
                ? "Request to join"
                : `Join ${programName}`}
          </button>
          <NotNowLink href={notNowHref(joinHref(token))} />
          {/* Google lives on `/login`; `?next=` brings them back here holding
              a session, where this screen becomes the Join button. */}
          <Link href={signInThenHref(joinHref(token))} className={CLAIM_LINK}>
            Sign in with Google instead
          </Link>
          <Link href={signInThenHref(joinHref(token))} className={CLAIM_LINK}>
            Already have an account? Sign in
          </Link>
          <JoinQuotaFooter
            programHours={programHours}
            personalHours={personalHours}
          />
        </ClaimActions>
      </div>
    </form>
  );
}

/** Approve mode, and the request is already in the queue. */
export function JoinLinkRequested() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2.5 rounded-[var(--radius-element)] bg-[var(--surface-subtle)] px-3.5 py-3">
        <span
          aria-hidden="true"
          className="size-[22px] shrink-0 rounded-full border border-dashed border-[var(--blue)]"
        />
        <span className="text-body-sm">
          Nothing else to do. Opening this link again won&apos;t send a second
          request.
        </span>
      </div>
      <ClaimActions>
        <Link href="/dashboard" className={CLAIM_BUTTON}>
          Go to your dashboard
        </Link>
        <span className="text-micro">
          Your personal matches are there in the meantime.
        </span>
      </ClaimActions>
    </div>
  );
}

/** Every seat taken. The link still works once a coach frees one. */
export function JoinLinkFull({ signedIn }: { signedIn: boolean }) {
  return (
    <ClaimActions>
      {signedIn ? (
        <>
          <Link href="/dashboard" className={CLAIM_BUTTON}>
            Go to your dashboard
          </Link>
          <span className="text-micro">
            Your personal matches are there in the meantime.
          </span>
        </>
      ) : (
        <Link href="/login" className={CLAIM_BUTTON}>
          Go to sign in
        </Link>
      )}
    </ClaimActions>
  );
}
