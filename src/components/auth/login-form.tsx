"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import FormHeader from "./form-header";
import FormField from "./form-field";
import AuthButton from "./auth-button";
import AuthFooter, { AUTH_LINK } from "./auth-footer";
import FormError from "./form-error";
import { toAuthError, validateEmail, type AuthError } from "@/lib/auth/error-messages";

/**
 * Google's brand mark. Hoisted out of the component because it is static and
 * LoginForm re-renders on every keystroke — no reason to rebuild four paths
 * each time someone types a character of their email.
 */
const GOOGLE_MARK = (
  <svg
    width="18"
    height="18"
    viewBox="0 0 18 18"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <g fill="none" fillRule="evenodd">
      <path
        d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
        fill="#4285F4"
      />
      <path
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
        fill="#34A853"
      />
      <path
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
        fill="#EA4335"
      />
    </g>
  </svg>
);

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<AuthError | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const emailProblem = validateEmail(email);
    if (emailProblem) {
      setError({ field: "email", message: emailProblem });
      return;
    }

    const supabase = createClient();
    setIsLoading(true);

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) throw signInError;
      // Always land on the home dashboard, even if the profile is incomplete.
      router.push("/dashboard");
    } catch (err: unknown) {
      setError(toAuthError(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleOAuth = async () => {
    setError(null);
    const supabase = createClient();
    const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/callback?next=/dashboard`,
        // Drive the redirect ourselves (below) so supabase-js does not ALSO
        // navigate the browser. Two navigations to the same authorize URL race
        // and abort each other (ERR_ABORTED) — mobile Safari is strict about it,
        // which left the Google button doing nothing on phones.
        skipBrowserRedirect: true,
      },
    });
    if (oauthError) {
      setError(toAuthError(oauthError));
      return;
    }
    if (data?.url) {
      window.location.href = data.url;
    }
  };

  return (
    <form
      onSubmit={handleLogin}
      className="flex w-full max-w-[360px] flex-col gap-[24px]"
      style={{ animation: "fadeUp 0.5s ease-out" }}
    >
      <FormHeader
        eyebrow="Sign in"
        title="Welcome Back."
        description="Your matches, your numbers, and whatever your program has sent for you."
      />

      <div className="flex flex-col gap-[20px]">
        <FormField
          label="Email"
          id="login-email"
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
          id="login-password"
          type="password"
          placeholder="••••••••••••"
          showPasswordToggle
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
          error={error?.field === "password" ? error.message : null}
        />

        {/* Below the field it belongs to, not competing with its label. */}
        <div className="flex">
          <Link href="/forgot-password" className={`text-[11px] ${AUTH_LINK}`}>
            Forgot your password?
          </Link>
        </div>
      </div>

      <div className="flex flex-col gap-[16px]">
        <FormError error={error} inlineFields={["email", "password"]} />

        <AuthButton type="submit" disabled={isLoading}>
          {isLoading ? "Signing In..." : "Sign In"}
        </AuthButton>

        <div className="flex items-center gap-[12px]">
          <div className="h-[1px] flex-1 bg-[var(--border-hairline)]" />
          <span className="text-micro">or</span>
          <div className="h-[1px] flex-1 bg-[var(--border-hairline)]" />
        </div>

        {/* Google's own button, kept at its branded treatment — a peer option. */}
        <button
          type="button"
          onClick={handleGoogleOAuth}
          className="flex h-[44px] w-full items-center justify-center gap-[12px] rounded-[var(--radius-button)] bg-[#f2f2f2] text-[13px] font-medium text-[#3c4043] transition-colors duration-[var(--duration-hover)] hover:bg-[#e8e8e8] active:scale-[0.97] motion-reduce:active:scale-100"
        >
          {GOOGLE_MARK}
          Continue with Google
        </button>

        <AuthFooter>
          <span className="text-body-sm">
            New here?{" "}
            <Link href="/sign-up" className={AUTH_LINK}>
              Create an account
            </Link>
          </span>
        </AuthFooter>
      </div>
    </form>
  );
}
