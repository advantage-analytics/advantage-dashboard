"use client";

import { useState, useTransition } from "react";
import {
  CLAIM_BUTTON,
  CLAIM_FIELD,
  CLAIM_LABEL,
  ClaimActions,
} from "@/components/claim/claim-shell";
import {
  acceptInvite,
  createAccountAndAccept,
  signInAndAccept,
  signOutForInvite,
} from "@/lib/services/programs/join-actions";
import { PASSWORD_RULE } from "@/lib/auth/error-messages";
import type { JoinRole } from "@/lib/services/programs/invite-acceptance";

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

const ROLE_NOUN: Record<JoinRole, string> = {
  coach: "a coach",
  staff: "staff",
  player: "a player",
};

function Problem({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="text-[12px] leading-[18px] text-[var(--danger)]"
    >
      {message}
    </p>
  );
}

/** Signed in as the invited address. One button. */
export function JoinReady({
  token,
  programName,
  role,
}: {
  token: string;
  programName: string;
  role: JoinRole;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="flex flex-col gap-4">
      <p className="text-body">
        You&apos;ll join {programName} as {ROLE_NOUN[role]}.
      </p>
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
      </ClaimActions>
    </div>
  );
}

/** The account exists. Their existing password, and nothing else. */
export function JoinSignIn({
  token,
  programName,
  role,
  email,
}: {
  token: string;
  programName: string;
  role: JoinRole;
  email: string;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      noValidate
      className="flex max-w-[380px] flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        start(async () => {
          setError(null);
          const result = await signInAndAccept(token, password);
          if (result && !result.ok) setError(result.error);
        });
      }}
    >
      <p className="text-body">
        You already have an Advantage account for{" "}
        <span className="text-[var(--ink-900)]">{email}</span>. Sign in and
        you&apos;ll join {programName} as {ROLE_NOUN[role]}.
      </p>

      <div>
        <label className={CLAIM_LABEL} htmlFor="join-password">
          Password
        </label>
        <input
          id="join-password"
          type="password"
          autoComplete="current-password"
          className={CLAIM_FIELD}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>

      <Problem message={error} />

      <ClaimActions>
        <button type="submit" disabled={pending} className={CLAIM_BUTTON}>
          {pending ? "Joining…" : "Sign in and join"}
        </button>
        {/* The way out for someone who has forgotten it. Resetting a password
            is a different proof of the same mailbox, and it is the only path
            that may change an existing account's password — never this one. */}
        <a
          href="/forgot-password"
          className="text-[12px] text-[var(--blue)] hover:underline"
        >
          Forgot your password?
        </a>
      </ClaimActions>
    </form>
  );
}

/** No account. Name, password, in. */
export function JoinSignUp({
  token,
  programName,
  role,
  email,
}: {
  token: string;
  programName: string;
  role: JoinRole;
  email: string;
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      noValidate
      className="flex max-w-[380px] flex-col gap-4"
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
      <p className="text-body">
        Set up your account and you&apos;ll join {programName} as{" "}
        {ROLE_NOUN[role]}. Your account uses{" "}
        <span className="text-[var(--ink-900)]">{email}</span>.
      </p>

      <div className="flex gap-3">
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

      <div>
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
      </ClaimActions>
    </form>
  );
}

/**
 * Signed in, but as somebody else.
 *
 * The commonest real case is a shared laptop or a personal account left open,
 * so the screen names both addresses rather than saying "wrong account" — the
 * fix is obvious the moment a person can see which one they are currently in.
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
        <span className="text-[var(--ink-900)]">{signedInAs}</span>. Sign out
        and open the link again to accept it.
      </p>
      <ClaimActions>
        <button
          type="button"
          disabled={pending}
          className={CLAIM_BUTTON}
          onClick={() => start(() => signOutForInvite(token))}
        >
          {pending ? "Signing out…" : "Sign out and continue"}
        </button>
      </ClaimActions>
    </div>
  );
}
