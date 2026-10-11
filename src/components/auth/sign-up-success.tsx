"use client";

import Link from "next/link";
import FormHeader from "@/components/auth/form-header";
import AuthButton from "@/components/auth/auth-button";
import AuthFooter, { AUTH_LINK } from "@/components/auth/auth-footer";
import { authHref } from "@/lib/auth/safe-next";

/** What happens next, in the order it happens. */
const STEPS = [
  "Open the link from your inbox",
  "Confirm your email address",
  "Land on your dashboard",
];

/** The same three, when the sign-up began on a join link. */
const JOIN_STEPS = [
  ...STEPS.slice(0, 2),
  "Come back to the invitation and join",
];

/**
 * The screen after `SignUpForm` succeeds.
 *
 * A client component only for the "Open Email App" button; the page reads the
 * query and hands the answers down.
 *
 * @param next Where the confirmation mail lands; kept on the links back into
 *   auth so a second attempt still returns to the same place.
 * @param joining `next` is a join link.
 * @param joinProgram The team it is for, when the link still resolves.
 */
export function SignUpSuccess({
  next,
  joining,
  joinProgram,
}: {
  next: string;
  joining: boolean;
  joinProgram: string | null;
}) {
  const steps = joining ? JOIN_STEPS : STEPS;

  return (
    <div
      className="flex w-full max-w-[360px] flex-col gap-[24px]"
      style={{ animation: "fadeUp 0.5s ease-out" }}
    >
      {joining ? (
        <FormHeader
          eyebrow="Account created"
          title="Check your email."
          // True for a new address and for one that already has an account:
          // sign-up answers both the same way and mails only the first, and
          // this screen must not be what tells them apart.
          description={`If this address is new, we sent a confirmation link. Open it to activate your account and return to ${
            joinProgram ? `${joinProgram}'s invitation` : "the invitation"
          }. Already have an account? Sign in below.`}
        />
      ) : (
        <FormHeader
          eyebrow="Account created"
          title="You've Joined the Team."
          description="We sent a confirmation link to your email. Open it to activate your account."
        />
      )}

      <ol className="flex flex-col">
        {steps.map((step, index) => (
          <li
            key={step}
            className="flex items-baseline gap-[12px] border-t border-[var(--border-hairline)] py-[10px]"
          >
            <span className="mono tabular text-[11px] text-[var(--ink-500)]">
              {String(index + 1).padStart(2, "0")}
            </span>
            <span className="text-body-sm">{step}</span>
          </li>
        ))}
      </ol>

      <div className="flex flex-col gap-[16px]">
        <AuthButton onClick={() => window.open("mailto:", "_blank")}>
          Open Email App
        </AuthButton>

        <AuthFooter>
          <span className="text-body-sm">
            Already confirmed?{" "}
            <Link href={authHref("/login", next)} className={AUTH_LINK}>
              Sign in
            </Link>
          </span>
          <span className="text-micro">
            Nothing after a minute? Check your spam folder or{" "}
            <Link href={authHref("/sign-up", next)} className={AUTH_LINK}>
              sign up again
            </Link>
            .
          </span>
        </AuthFooter>
      </div>
    </div>
  );
}
