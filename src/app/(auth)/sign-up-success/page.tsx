"use client";

import Link from "next/link";
import FormHeader from "@/components/auth/form-header";
import AuthButton from "@/components/auth/auth-button";
import AuthFooter, { AUTH_LINK } from "@/components/auth/auth-footer";

/** What happens next, in the order it happens. */
const STEPS = [
  "Open the link from your inbox",
  "Confirm your email address",
  "Land on your dashboard",
];

export default function Page() {
  return (
    <div
      className="flex w-full max-w-[360px] flex-col gap-[24px]"
      style={{ animation: "fadeUp 0.5s ease-out" }}
    >
      <FormHeader
        eyebrow="Account created"
        title="You've Joined the Team."
        description="We sent a confirmation link to your email. Open it to activate your account."
      />

      <ol className="flex flex-col">
        {STEPS.map((step, index) => (
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
            <Link href="/login" className={AUTH_LINK}>
              Sign in
            </Link>
          </span>
          <span className="text-micro">
            Nothing after a minute? Check your spam folder or{" "}
            <Link href="/sign-up" className={AUTH_LINK}>
              sign up again
            </Link>
            .
          </span>
        </AuthFooter>
      </div>
    </div>
  );
}
