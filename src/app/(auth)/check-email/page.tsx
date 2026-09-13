"use client";

import Link from "next/link";
import AccentLine from "@/components/auth/accent-line";

export default function Page() {
  return (
    <div
      className="flex w-full max-w-[360px] flex-col items-center gap-[24px]"
      style={{ animation: "fadeUp 0.5s ease-out" }}
    >
      {/* Accent line */}
      <div className="w-full">
        <AccentLine />
      </div>

      {/* Email icon */}
      <div className="flex h-[52px] w-[52px] items-center justify-center rounded-full bg-[rgba(0,0,0,0.03)]">
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--color-accent-blue)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="2" y="4" width="20" height="16" rx="2" />
          <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
        </svg>
      </div>

      {/* Header */}
      <div className="flex w-full flex-col gap-[12px]">
        <h2 className="text-[28px] font-light leading-[1.1] tracking-[-0.5px] text-[var(--color-text-primary)]">
          Check Your Email.
        </h2>
        <p className="text-[12px] leading-[1.5] text-[var(--color-text-muted)]">
          A recovery link has been sent to help you reset your password.
        </p>
        <p className="text-[13px] leading-[1.6] text-[var(--color-text-secondary)]">
          We&apos;ve sent a password recovery link to your email address. Please
          check your inbox and follow the instructions to reset your password.
        </p>
      </div>

      {/* Actions */}
      <div className="flex w-full flex-col items-center gap-[18px]">
        <button
          type="button"
          onClick={() => window.open("mailto:", "_blank")}
          className="flex h-[44px] w-full items-center justify-center rounded-[6px] border border-[rgba(59,130,246,0.25)] bg-[rgba(59,130,246,0.08)] text-[13px] font-medium tracking-[1px] text-[var(--color-accent-blue)] transition-all duration-200 hover:border-[var(--color-accent-blue)] active:scale-[0.97]"
        >
          Open Email App
        </button>

        <Link href="/login" className="flex items-center gap-[6px]">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--color-text-dim)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          <span className="text-[12px] text-[var(--color-text-secondary)]">
            Back to Sign In
          </span>
        </Link>

        <p className="text-center text-[11px] leading-[1.6] text-[var(--color-text-dim)]">
          Didn&apos;t receive the email? Check your spam folder or request a new
          link.
        </p>
      </div>
    </div>
  );
}
