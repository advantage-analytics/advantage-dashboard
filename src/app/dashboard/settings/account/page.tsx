"use client";

import { useCallback, useEffect, useState } from "react";
import { Mail } from "lucide-react";
import { SettingsSection } from "@/components/dashboard/settings/settings-section";
import { SettingsButton } from "@/components/dashboard/settings/settings-button";
import { SettingsAlert } from "@/components/dashboard/settings/settings-alert";
import { SettingsInput } from "@/components/dashboard/settings/settings-input";
import {
  deleteAccount,
  requestPasswordReset,
} from "@/components/dashboard/settings/actions";
import { createClient } from "@/lib/supabase/client";

const SUPPORT_EMAIL = "support@advantageanalytics.app";

export default function AccountPage() {
  const [email, setEmail] = useState<string | null>(null);
  const [resetLoading, setResetLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!cancelled) setEmail(user?.email ?? "");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const cancelDelete = useCallback(() => {
    setShowDeleteConfirm(false);
    setConfirmText("");
    setDeleteError(null);
  }, []);

  useEffect(() => {
    if (!showDeleteConfirm) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancelDelete();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [showDeleteConfirm, cancelDelete]);

  const handlePasswordReset = async () => {
    setResetLoading(true);
    try {
      const result = await requestPasswordReset();
      if (result.ok) {
        setMessage({
          type: "success",
          text: "Reset link sent. Check your inbox.",
        });
      } else {
        setMessage({
          type: "error",
          text: result.error || "Couldn't send the reset link.",
        });
      }
    } catch {
      setMessage({
        type: "error",
        text: "Couldn't send the reset link. Try again in a moment.",
      });
    } finally {
      setResetLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      const result = await deleteAccount();
      if (!result.ok) {
        setDeleteError(result.error);
        setDeleteLoading(false);
      }
    } catch {
      setDeleteError(
        "Couldn't reach the server. Check your connection and try again."
      );
      setDeleteLoading(false);
    }
  };

  const canDelete = !!email && confirmText === email;

  return (
    <div className="max-w-xl flex flex-col gap-10">
      {/* Message */}
      {message && (
        <SettingsAlert
          type={message.type}
          message={message.text}
          onDismiss={() => setMessage(null)}
        />
      )}

      {/* Identity strip — three-line stack: meta · value · hint.
          Each line owns one job, eyebrow no longer carries help text. */}
      <section className="flex items-start gap-3.5 pb-6 border-b border-[var(--color-ink-100)]">
        <div className="size-9 rounded-full flex items-center justify-center flex-shrink-0 bg-[var(--color-blue-tint-04)] mt-0.5">
          <Mail
            className="size-4 text-[var(--color-blue)]"
            strokeWidth={1.5}
            aria-hidden="true"
          />
        </div>
        <div className="min-w-0 flex-1 flex flex-col gap-1">
          <p className="text-[10px] font-medium text-[var(--color-ink-400)] uppercase tracking-[2.5px]">
            Account email
          </p>
          {email === null ? (
            <div
              role="status"
              aria-busy="true"
              aria-label="Loading email"
              className="h-[14px] w-48 rounded-[2px] settings-skeleton-bar"
            />
          ) : (
            <p className="text-[14px] leading-[20px] text-[var(--color-ink-900)] truncate">
              {email}
            </p>
          )}
          <p className="text-[11px] text-[var(--color-ink-400)] leading-[1.45]">
            <a
              href={`mailto:${SUPPORT_EMAIL}?subject=Change%20account%20email`}
              className="underline decoration-[var(--color-ink-200)] underline-offset-2 transition-colors hover:text-[var(--color-ink-700)] hover:decoration-[var(--color-ink-400)]"
            >
              Contact support
            </a>{" "}
            to change.
          </p>
        </div>
      </section>

      {/* Security — explanation reads first, action sits at the bottom right */}
      <SettingsSection number="01" title="Security">
        <p className="text-[12px] text-[var(--color-ink-500)] leading-[1.55]">
          We&apos;ll email you a one-time link to set a new password. The link
          expires in one hour.
        </p>
        <div className="flex justify-start pt-2">
          <SettingsButton
            variant="outline"
            onClick={handlePasswordReset}
            loading={resetLoading}
          >
            Reset password
          </SettingsButton>
        </div>
      </SettingsSection>

      {/* Delete Account — danger zone. Pulled away from Security with mt-12
          so the page reads: routine account info → routine action → big gap →
          destructive action. Generous separation marks the boundary. */}
      <SettingsSection
        number="02"
        title="Danger Zone"
        description="Permanently remove your account and all data."
        tone="danger"
        className="mt-12"
      >
        {!showDeleteConfirm ? (
          <>
            <p className="text-[12px] text-[var(--color-ink-500)] leading-[1.55]">
              Removes match data, statistics, reports, and your account
              record. This action cannot be undone.
            </p>
            <div className="flex justify-start pt-2">
              <SettingsButton
                variant="danger"
                onClick={() => setShowDeleteConfirm(true)}
              >
                Delete account
              </SettingsButton>
            </div>
          </>
        ) : (
          <form
            className="flex flex-col"
            onSubmit={(e) => {
              e.preventDefault();
              if (canDelete && !deleteLoading) handleDeleteAccount();
            }}
          >
            <p className="text-[12px] font-medium text-[var(--color-error-strong)] leading-[1.55] mb-6">
              Type your email below to confirm. All match data and reports will
              be removed permanently.
            </p>
            <SettingsInput
              id="confirm-delete"
              label="Confirm with your email"
              tone="danger"
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={email || "your email"}
              autoFocus
              autoComplete="off"
              spellCheck={false}
              hint={
                <>
                  Press{" "}
                  <kbd className="rounded-[3px] border border-[var(--color-ink-200)] px-[5px] py-[1px] text-[10px] font-medium text-[var(--color-ink-700)]">
                    Enter
                  </kbd>{" "}
                  to confirm,{" "}
                  <kbd className="rounded-[3px] border border-[var(--color-ink-200)] px-[5px] py-[1px] text-[10px] font-medium text-[var(--color-ink-700)]">
                    Esc
                  </kbd>{" "}
                  to cancel.
                </>
              }
            />
            {deleteError && (
              <div
                role="alert"
                className="mt-4 flex flex-col gap-1 text-[12px] leading-[1.55]"
              >
                <p className="text-[var(--color-error-strong)]">{deleteError}</p>
                <p className="text-[var(--color-ink-400)]">
                  Still stuck?{" "}
                  <a
                    href={`mailto:${SUPPORT_EMAIL}?subject=Account%20deletion%20failed`}
                    className="underline decoration-[var(--color-ink-200)] underline-offset-2 transition-colors hover:text-[var(--color-ink-700)] hover:decoration-[var(--color-ink-400)]"
                  >
                    Contact support
                  </a>
                  .
                </p>
              </div>
            )}
            <div className="flex items-center gap-2 mt-6">
              <SettingsButton
                variant="danger"
                type="submit"
                loading={deleteLoading}
                disabled={!canDelete}
                className={
                  canDelete
                    ? "bg-[var(--color-error-strong)] text-white border-transparent hover:bg-[var(--color-danger-hover)] hover:text-white"
                    : ""
                }
              >
                {deleteError ? "Try again" : "Yes, delete my account"}
              </SettingsButton>
              <SettingsButton
                variant="secondary"
                type="button"
                onClick={cancelDelete}
              >
                Cancel
              </SettingsButton>
            </div>
          </form>
        )}
      </SettingsSection>
    </div>
  );
}
