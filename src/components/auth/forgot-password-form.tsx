"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import FormHeader from "./form-header";
import FormField from "./form-field";
import AuthButton from "./auth-button";
import AuthFooter, { AUTH_LINK } from "./auth-footer";
import FormError from "./form-error";
import { toAuthError, validateEmail, type AuthError } from "@/lib/auth/error-messages";
import {
  recoveryRedirectTo,
  writeRecoveryHandoff,
} from "@/lib/auth/recovery-handoff";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<AuthError | null>(null);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Caught here rather than at the round trip: Supabase answers `name@host`
    // with generic text, and the specific "missing its domain" nudge is the
    // whole point of putting the message on the field.
    const emailProblem = validateEmail(email);
    if (emailProblem) {
      setError({ field: "email", message: emailProblem });
      return;
    }

    setIsLoading(true);

    try {
      const supabase = createClient();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        email,
        { redirectTo: recoveryRedirectTo(window.location.origin) },
      );
      if (resetError) throw resetError;
      // Hand the address and the send time to /check-email so it can name the
      // address and count down both the link expiry and the resend cooldown.
      writeRecoveryHandoff(email);
      router.push("/check-email");
    } catch (err: unknown) {
      setError(toAuthError(err));
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
        eyebrow="Account recovery"
        title="Reset Password."
        description="We'll send a recovery link to the address on your account."
      />

      <div className="flex flex-col gap-[20px]">
        <FormField
          label="Email"
          id="reset-email"
          placeholder="name@university.edu"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          error={error?.field === "email" ? error.message : null}
        />
      </div>

      <div className="flex flex-col gap-[16px]">
        <FormError error={error} inlineFields={["email"]} />

        <AuthButton type="submit" disabled={isLoading}>
          {isLoading ? "Sending..." : "Send Recovery Link"}
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
