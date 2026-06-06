"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import FormHeader from "./form-header";
import FormField from "./form-field";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const checkProfileAndRedirect = async (
    supabase: ReturnType<typeof createClient>,
  ) => {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) throw userError ?? new Error("User not found");

    const { data: profile, error: profileError } = await supabase
      .from("users")
      .select("phone, dob, state, country, role")
      .eq("id", user.id)
      .single();

    if (profileError) throw profileError;

    const isIncomplete =
      !profile.phone ||
      !profile.dob ||
      !profile.state ||
      !profile.country ||
      !profile.role;

    router.push(isIncomplete ? "/dashboard/settings" : "/dashboard");
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = createClient();
    setIsLoading(true);
    setError(null);

    try {
      const { error: signInError } =
        await supabase.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;
      await checkProfileAndRedirect(supabase);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleOAuth = async () => {
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
      setError(oauthError.message);
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
        title="Welcome Back."
        description="Enter your credentials to access your athlete dashboard and performance insights."
        subtitle="Access to Advantage is currently limited to invited players and coaches."
      />

      {/* Fields */}
      <div className="flex flex-col gap-[20px]">
        <FormField
          label="EMAIL"
          id="login-email"
          placeholder="name@university.edu"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          hasError={!!error}
        />
        <FormField
          label="PASSWORD"
          id="login-password"
          type="password"
          placeholder="••••••••••••"
          rightLabel={{ text: "Forgot Password?", href: "/forgot-password" }}
          showPasswordToggle
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
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
      <div className="flex flex-col gap-[18px]">
        <button
          type="submit"
          disabled={isLoading}
          className="flex h-[44px] w-full items-center justify-center rounded-[6px] bg-[var(--color-accent-blue)] text-[13px] font-medium tracking-[1px] text-white transition-all duration-200 hover:bg-[var(--color-accent-blue-hover)] hover:shadow-[0_0_20px_var(--color-accent-blue-glow)] active:scale-[0.97] disabled:pointer-events-none disabled:opacity-60"
        >
          {isLoading ? "Signing In..." : "Sign In"}
        </button>

        {/* Divider */}
        <div className="flex items-center gap-[16px]">
          <div className="h-[1px] flex-1 bg-[var(--color-border-faint)]" />
          <span className="text-[10px] font-medium tracking-[3px] text-[var(--color-text-faint)]">
            OR
          </span>
          <div className="h-[1px] flex-1 bg-[var(--color-border-faint)]" />
        </div>

        {/* Google OAuth */}
        <button
          type="button"
          onClick={handleGoogleOAuth}
          className="flex h-[44px] w-full items-center justify-center gap-3 rounded-[6px] bg-[#f2f2f2] text-[13px] font-medium text-[#3c4043] transition-all duration-200 hover:bg-[#e8e8e8] active:scale-[0.97]"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 18 18"
            xmlns="http://www.w3.org/2000/svg"
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
          Sign in with Google
        </button>

        {/* Footer links */}
        <div className="flex flex-col items-center gap-[8px]">
          <div className="flex items-center gap-[6px]">
            <span className="text-[12px] text-[var(--color-text-muted)]">
              Don&apos;t have an account?
            </span>
            <Link
              href="/sign-up"
              className="text-[12px] text-[var(--color-accent-blue)]"
            >
              Sign up
            </Link>
          </div>
          <div className="flex items-center gap-[6px]">
            <span className="text-[12px] text-[var(--color-text-muted)]">
              Not invited yet?
            </span>
            <Link
              href="/request-access"
              className="text-[12px] text-[var(--color-accent-blue)]"
            >
              Request access.
            </Link>
          </div>
        </div>
      </div>
    </form>
  );
}
