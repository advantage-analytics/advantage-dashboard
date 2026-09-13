"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import FormHeader from "@/components/auth/form-header";
import AuthButton from "@/components/auth/auth-button";
import AuthFooter, { AUTH_LINK } from "@/components/auth/auth-footer";
import { ErrorText } from "@/components/auth/form-error";
import { toAuthError } from "@/lib/auth/error-messages";
import {
  formatCountdown,
  readRecoveryHandoff,
  recoveryRedirectTo,
  writeRecoveryHandoff,
  LINK_TTL_SECONDS,
  RESEND_COOLDOWN_SECONDS,
  type RecoveryHandoff,
} from "@/lib/auth/recovery-handoff";

/** What happens next, which the shipped screen never said. */
const STEPS = [
  "Open the link from your inbox",
  "Choose a new password",
  "Sign in and pick up where you left off",
];

export default function Page() {
  const [handoff, setHandoff] = useState<RecoveryHandoff | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [isResending, setIsResending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Both the address and the clock are client-only. Reading them in an effect
  // keeps the server and first client render identical — a countdown rendered
  // during SSR is a guaranteed hydration mismatch.
  useEffect(() => {
    setHandoff(readRecoveryHandoff());
    setNow(Date.now());
  }, []);

  // Depend on the timestamp, not the handoff object, so a re-read that returns
  // an equal-valued object doesn't restart the timer.
  const sentAt = handoff?.sentAt ?? null;

  // Only tick while there is something left to count. With no handoff both
  // countdown branches render fixed copy, and past the TTL they do again — a
  // 1s re-render for the rest of the tab's life that cannot change a pixel.
  // Resend rewrites sentAt, which re-runs this effect and restarts the timer.
  useEffect(() => {
    if (sentAt === null) return;
    const expiresAt = sentAt + LINK_TTL_SECONDS * 1000;
    if (Date.now() >= expiresAt) return;
    const id = setInterval(() => {
      const tick = Date.now();
      setNow(tick);
      if (tick >= expiresAt) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [sentAt]);

  const elapsed = handoff ? Math.floor((now - handoff.sentAt) / 1000) : null;
  const expiresIn = elapsed === null ? null : LINK_TTL_SECONDS - elapsed;
  const resendIn = elapsed === null ? null : RESEND_COOLDOWN_SECONDS - elapsed;
  const canResend = resendIn !== null && resendIn <= 0 && !isResending;

  const handleResend = async () => {
    if (!handoff || !canResend) return;
    setError(null);
    setIsResending(true);
    try {
      const supabase = createClient();
      const { error: resendError } = await supabase.auth.resetPasswordForEmail(
        handoff.email,
        { redirectTo: recoveryRedirectTo(window.location.origin) },
      );
      if (resendError) throw resendError;
      setHandoff(writeRecoveryHandoff(handoff.email));
      setNow(Date.now());
    } catch (err: unknown) {
      setError(toAuthError(err).message);
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div
      className="flex w-full max-w-[360px] flex-col gap-[24px]"
      style={{ animation: "fadeUp 0.5s ease-out" }}
    >
      <FormHeader
        eyebrow="Account recovery"
        title="Check Your Email."
        description={
          <>
            We sent a single-use recovery link.{" "}
            {expiresIn !== null && expiresIn > 0 ? (
              <>
                It expires in{" "}
                <span className="mono tabular text-[12px] text-[var(--ink-900)]">
                  {formatCountdown(expiresIn)}
                </span>
                .
              </>
            ) : expiresIn !== null ? (
              "That one has expired — send yourself a new one."
            ) : (
              "It expires an hour after it was sent."
            )}
          </>
        }
      />

      {handoff ? (
        <div className="flex items-center gap-[10px] rounded-[var(--radius-element)] bg-[var(--surface-subtle)] px-[16px] py-[12px]">
          <Mail
            size={14}
            strokeWidth={1.5}
            className="shrink-0 text-[var(--ink-600)]"
            aria-hidden="true"
          />
          <span className="mono truncate text-[12px] text-[var(--ink-900)]">
            {handoff.email}
          </span>
        </div>
      ) : null}

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
        {error ? <ErrorText>{error}</ErrorText> : null}

        <AuthButton onClick={() => window.open("mailto:", "_blank")}>
          Open Email App
        </AuthButton>

        <AuthFooter>
          <span className="text-body-sm">
            Wrong address?{" "}
            <Link href="/forgot-password" className={AUTH_LINK}>
              Use a different one
            </Link>
          </span>
          <span className="text-micro">
            {resendIn !== null && resendIn > 0 ? (
              <>
                Resend in{" "}
                <span className="mono tabular text-[var(--ink-900)]">
                  {formatCountdown(resendIn)}
                </span>{" "}
                · nothing after a minute, check spam.
              </>
            ) : handoff ? (
              <>
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={!canResend}
                  className={`${AUTH_LINK} disabled:pointer-events-none disabled:opacity-50`}
                >
                  {isResending ? "Resending..." : "Resend the link"}
                </button>{" "}
                · nothing after a minute, check spam.
              </>
            ) : (
              "Nothing after a minute? Check your spam folder."
            )}
          </span>
        </AuthFooter>
      </div>
    </div>
  );
}
