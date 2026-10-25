"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import FormHeader from "./form-header";
import FormField from "./form-field";
import AuthButton from "./auth-button";
import AuthFooter, { AUTH_LINK } from "./auth-footer";
import FormError from "./form-error";
import {
  toAuthError,
  validatePassword,
  PASSWORD_RULE,
  type AuthError,
} from "@/lib/auth/error-messages";

/**
 * Not one of the four pages in the v2 auth set, but it is the page the recovery
 * link lands on and it shares the set's components. Left on the old header
 * ladder and field vocabulary it would have been the one screen in the flow
 * still speaking v1, so it follows the same spec here.
 */
export function UpdatePasswordForm() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<AuthError | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  const router = useRouter();

  // The recovery session names the account. Read in the browser rather than
  // on the server: the link can land with the session still in the URL, and
  // the browser client is what finishes it.
  useEffect(() => {
    let live = true;
    createClient()
      .auth.getUser()
      .then(({ data: { user } }) => {
        if (live) setAccountEmail(user?.email ?? null);
      });
    return () => {
      live = false;
    };
  }, []);

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const passwordProblem = validatePassword(password);
    if (passwordProblem) {
      setError({ field: "password", message: passwordProblem });
      return;
    }
    if (password !== confirm) {
      setError({ field: "confirm", message: "Both passwords have to match." });
      return;
    }

    setIsLoading(true);
    const supabase = createClient();

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });
      if (updateError) throw updateError;
      router.push("/dashboard");
    } catch (err: unknown) {
      setError(toAuthError(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form
      onSubmit={handleUpdatePassword}
      className="flex w-full max-w-[360px] flex-col gap-[24px]"
      style={{ animation: "fadeUp 0.5s ease-out" }}
    >
      <FormHeader
        eyebrow="Account recovery"
        title="Set New Password."
        description="Choose one you haven't used on this account before."
      />

      <div className="flex flex-col gap-[20px]">
        {/* Chrome saves a new password against the username field before it.
            Without one it files the reset as a separate, nameless login and
            keeps offering the old password on /login. */}
        {accountEmail ? (
          <input
            type="email"
            name="email"
            autoComplete="username"
            value={accountEmail}
            readOnly
            hidden
          />
        ) : null}
        <FormField
          label="New password"
          id="new-password"
          name="password"
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
          id="confirm-password"
          name="confirm-password"
          type="password"
          placeholder="••••••••••••"
          showPasswordToggle
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          autoComplete="new-password"
          error={error?.field === "confirm" ? error.message : null}
        />

        <span className="text-body-sm">{PASSWORD_RULE}</span>
      </div>

      <div className="flex flex-col gap-[16px]">
        <FormError error={error} inlineFields={["password", "confirm"]} />

        <AuthButton type="submit" disabled={isLoading}>
          {isLoading ? "Saving..." : "Save New Password"}
        </AuthButton>

        <AuthFooter>
          <Link
            href="/login"
            className={`inline-flex items-center gap-[6px] text-[12px] ${AUTH_LINK}`}
          >
            <ArrowLeft size={14} strokeWidth={1.5} aria-hidden="true" />
            Back to sign in
          </Link>
        </AuthFooter>
      </div>
    </form>
  );
}
