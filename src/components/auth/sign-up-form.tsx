"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import FormHeader from "./form-header";
import FormField from "./form-field";
import AuthButton from "./auth-button";
import AuthFooter, { AUTH_LINK } from "./auth-footer";
import FormError, { ErrorText } from "./form-error";
import AuthCheckbox from "./auth-checkbox";
import {
  toAuthError,
  validateEmail,
  validatePassword,
  PASSWORD_RULE,
  type AuthError,
} from "@/lib/auth/error-messages";

export function SignUpForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState<AuthError | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Each check names the field it failed on, so the message lands on that
    // field's rule rather than in one banner below the whole group.
    const emailProblem = validateEmail(email);
    if (emailProblem) {
      setError({ field: "email", message: emailProblem });
      return;
    }
    const passwordProblem = validatePassword(password);
    if (passwordProblem) {
      setError({ field: "password", message: passwordProblem });
      return;
    }
    if (password !== confirm) {
      setError({ field: "confirm", message: "Both passwords have to match." });
      return;
    }
    if (!agree) {
      setError({
        field: "consent",
        message: "Agree to the Terms and Privacy Policy to continue.",
      });
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
      setError(toAuthError(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form
      onSubmit={handleSignUp}
      className="flex w-full max-w-[360px] flex-col gap-[24px]"
      style={{ animation: "fadeUp 0.5s ease-out" }}
    >
      <FormHeader
        eyebrow="Sign up"
        title="Create Account."
        description="Unlock data-driven insights and performance tracking for your game."
      />

      <div className="flex flex-col gap-[20px]">
        <FormField
          label="Email"
          id="signup-email"
          placeholder="name@university.edu"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          error={error?.field === "email" ? error.message : null}
        />
        <FormField
          label="Password"
          id="signup-password"
          type="password"
          placeholder="••••••••••••"
          showPasswordToggle
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="new-password"
          error={error?.field === "password" ? error.message : null}
        />
        <FormField
          label="Confirm password"
          id="signup-confirm"
          type="password"
          placeholder="••••••••••••"
          showPasswordToggle
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          autoComplete="new-password"
          error={error?.field === "confirm" ? error.message : null}
        />

        {/* The rule the account has to satisfy — readable ink, not the old #AAA. */}
        <span className="text-body-sm">{PASSWORD_RULE}</span>

        <div className="flex flex-col gap-[6px]">
          <div className="flex items-start gap-[10px]">
            <AuthCheckbox
              id="consent"
              checked={agree}
              onChange={setAgree}
              aria-label="Agree to the Terms and Privacy Policy"
              aria-describedby="consent-copy"
              aria-invalid={error?.field === "consent" ? true : undefined}
            />
            <span
              id="consent-copy"
              className="text-micro max-w-[44ch]"
              style={{ color: "var(--ink-700)" }}
            >
              By signing up, you agree to our{" "}
              <Link href="/legal/terms-and-conditions" className={AUTH_LINK}>
                Terms
              </Link>{" "}
              and{" "}
              <Link href="/legal/privacy-policy" className={AUTH_LINK}>
                Privacy Policy.
              </Link>
            </span>
          </div>
          {error?.field === "consent" ? (
            <ErrorText>{error.message}</ErrorText>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-[16px]">
        <FormError
          error={error}
          inlineFields={["email", "password", "confirm", "consent"]}
        />

        <AuthButton type="submit" disabled={isLoading}>
          {isLoading ? "Creating Account..." : "Create Account"}
        </AuthButton>

        <AuthFooter>
          <span className="text-body-sm">
            Already have an account?{" "}
            <Link href="/login" className={AUTH_LINK}>
              Sign in
            </Link>
          </span>
        </AuthFooter>
      </div>
    </form>
  );
}
