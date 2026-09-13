"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import AccentLine from "@/components/auth/accent-line";

function ErrorContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error")?.trim();

  return (
    <div
      className="flex w-full max-w-[360px] flex-col gap-[24px]"
      style={{ animation: "fadeUp 0.5s ease-out" }}
    >
      <AccentLine />

      {/* Error icon */}
      <div className="flex h-[52px] w-[52px] items-center justify-center rounded-full bg-[var(--color-error-bg)]">
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--color-error)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>

      {/* Header */}
      <div className="flex flex-col gap-[8px]">
        <h2 className="text-[28px] font-light leading-[1.1] tracking-[-0.5px] text-[var(--color-text-primary)]">
          Something Went Wrong.
        </h2>
        {error ? (
          <p className="text-[13px] leading-[1.6] text-[var(--color-text-secondary)]">
            Error:{" "}
            <span className="font-medium text-[var(--color-text-primary)]">
              {error}
            </span>
          </p>
        ) : (
          <p className="text-[13px] leading-[1.6] text-[var(--color-text-secondary)]">
            An unspecified error occurred. Please try again or contact support if
            the problem persists.
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-col items-center gap-[18px]">
        <Link
          href="/login"
          className="flex h-[44px] w-full items-center justify-center rounded-[6px] bg-[var(--color-accent-blue)] text-[13px] font-medium tracking-[1px] text-white transition-all duration-200 hover:bg-[var(--color-accent-blue-hover)] hover:shadow-[0_0_20px_var(--color-accent-blue-glow)] active:scale-[0.97]"
        >
          Back to Sign In
        </Link>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense>
      <ErrorContent />
    </Suspense>
  );
}
