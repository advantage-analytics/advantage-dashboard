"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import FormHeader from "./form-header";
import FormField from "./form-field";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const supabase = createClient();
      const { error: resetError } =
        await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/update-password`,
        });
      if (resetError) throw resetError;
      router.push("/check-email");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex w-full max-w-[360px] flex-col gap-[24px]"
      style={{ animation: "fadeUp 0.5s ease-out" }}
    >
      <FormHeader
        title="Reset Password."
        description="We'll help you regain access to your account securely."
        subtitle="Enter the email address associated with your account and we'll send you a recovery link."
      />

      {/* Fields */}
      <div className="flex flex-col gap-[20px]">
        <FormField
          label="EMAIL ADDRESS"
          id="reset-email"
          placeholder="name@university.edu"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          hasError={!!error}
        />

        {/* Error message */}
        {error ? (
          <div
            className="flex w-full items-center gap-[8px] rounded-[6px] bg-[var(--color-error-bg)] px-[12px] py-[10px]"
            style={{ animation: "shake 0.4s ease-in-out" }}
            role="alert"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--color-error)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="shrink-0"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span className="text-[12px] leading-[1.4] text-[var(--color-error)]">
              {error}
            </span>
          </div>
        ) : null}
      </div>

      {/* Actions */}
      <div className="flex flex-col items-center gap-[18px]">
        <button
          type="submit"
          disabled={isLoading}
          className="flex h-[44px] w-full items-center justify-center rounded-[6px] bg-[var(--color-accent-blue)] text-[13px] font-medium tracking-[1px] text-white transition-all duration-200 hover:bg-[var(--color-accent-blue-hover)] hover:shadow-[0_0_20px_var(--color-accent-blue-glow)] active:scale-[0.97] disabled:pointer-events-none disabled:opacity-60"
        >
          {isLoading ? "Sending..." : "Send Recovery Link"}
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
      </div>
    </form>
  );
}
