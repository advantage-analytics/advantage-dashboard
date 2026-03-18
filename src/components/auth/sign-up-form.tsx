"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { Checkbox } from "@/components/ui/checkbox";
import FormHeader from "./form-header";
import FormField from "./form-field";

const PASSWORD_REGEX = /^(?=.*\d)(?=.*[!@#$%^&*]).{8,}$/;

export function SignUpForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!agree) {
      setError("Please agree to the Terms and Privacy Policy.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords must match.");
      return;
    }
    if (!PASSWORD_REGEX.test(password)) {
      setError(
        "Password must be at least 8 characters, include a number and a special character.",
      );
      return;
    }

    setIsLoading(true);
    const supabase = createClient();

    try {
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/confirm?next=/dashboard`,
        },
      });
      if (signUpError) throw signUpError;
      router.push("/sign-up-success");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form
      onSubmit={handleSignUp}
      className="flex w-[360px] flex-col gap-[24px]"
      style={{ animation: "fadeUp 0.5s ease-out" }}
    >
      <FormHeader
        title="Create Account."
        description="Unlock data-driven insights and performance tracking for your game."
        subtitle="Sign up to get started with Advantage analytics."
      />

      {/* Fields */}
      <div className="flex flex-col gap-[20px]">
        <FormField
          label="EMAIL"
          id="signup-email"
          placeholder="name@university.edu"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
        />
        <FormField
          label="PASSWORD"
          id="signup-password"
          type="password"
          placeholder="••••••••••••"
          showPasswordToggle
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="new-password"
        />
        <FormField
          label="CONFIRM PASSWORD"
          id="signup-confirm"
          type="password"
          placeholder="••••••••••••"
          showPasswordToggle
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          autoComplete="new-password"
        />

        <p className="text-[11px] leading-[1.5] text-[var(--color-text-dim)]">
          Password must be 8+ characters, include a number and a special
          character.
        </p>

        {/* Consent checkbox */}
        <div className="flex items-start gap-2">
          <Checkbox
            id="consent"
            checked={agree}
            onCheckedChange={(v) => setAgree(Boolean(v))}
            className="mt-0.5"
          />
          <label htmlFor="consent" className="text-[11px] leading-[1.5] text-[var(--color-text-secondary)]">
            By signing up, you agree to our{" "}
            <Link
              href="/legal/terms-and-conditions"
              className="text-[var(--color-accent-blue)]"
            >
              Terms
            </Link>{" "}
            and{" "}
            <Link
              href="/legal/privacy-policy"
              className="text-[var(--color-accent-blue)]"
            >
              Privacy Policy.
            </Link>
          </label>
        </div>

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
          className="flex h-[44px] w-full items-center justify-center rounded-[6px] bg-[var(--color-accent-blue)] text-[13px] font-medium tracking-[1px] text-white transition-all duration-200 hover:bg-[var(--color-accent-blue-hover)] hover:shadow-[0_0_20px_var(--color-accent-blue-glow)] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60"
        >
          {isLoading ? "Creating Account..." : "Create Account"}
        </button>

        <div className="flex items-center gap-[6px]">
          <span className="text-[12px] text-[var(--color-text-muted)]">
            Already have an account?
          </span>
          <Link
            href="/login"
            className="text-[12px] text-[var(--color-accent-blue)]"
          >
            Sign in
          </Link>
        </div>
      </div>
    </form>
  );
}
