"use client";

import { useCallback, useState, useTransition } from "react";
import Link from "next/link";
import { Monitor, Users } from "lucide-react";
import { SettingsAlert } from "@/components/dashboard/settings/settings-alert";
import { SettingsButton } from "@/components/dashboard/settings/settings-button";
import { SettingsSectionHeading } from "@/components/dashboard/settings/settings-card";
import {
  deleteAccount,
  requestPasswordReset,
} from "@/components/dashboard/settings/actions";
import { useWorkspace } from "@/components/dashboard/workspace-provider";
import { createClient } from "@/lib/supabase/client";
import { SUPPORT_EMAIL } from "@/lib/constants";
import { cn } from "@/lib/utils";

/**
 * Settings › Account.
 *
 * Facts as rows rather than paragraphs: label, value, and the one action that
 * changes it, on the same line. Deletion is bounded inside its own frame and
 * gated on typing the address — it used to be a loose red button under a
 * paragraph, in the same rhythm as "Reset password".
 *
 * The email comes from the workspace context. Fetching it again after hydration
 * bought a skeleton bar and an extra auth round trip for a string the server had
 * already resolved.
 */
export default function AccountPage() {
  const { available, viewer } = useWorkspace();

  const [confirmText, setConfirmText] = useState("");
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isResetting, startReset] = useTransition();
  const [isSigningOut, startSignOut] = useTransition();
  const [isDeleting, startDelete] = useTransition();

  const handlePasswordReset = useCallback(() => {
    startReset(async () => {
      const result = await requestPasswordReset();
      setMessage(
        result.ok
          ? { type: "success", text: "Reset link sent. Check your inbox." }
          : { type: "error", text: result.error }
      );
    });
  }, []);

  /**
   * Global sign-out. Supabase revokes every refresh token on the account, so
   * the phone that uploaded courtside goes with it — which is the whole reason
   * somebody presses this.
   */
  const handleSignOutEverywhere = useCallback(() => {
    startSignOut(async () => {
      const { error } = await createClient().auth.signOut({ scope: "global" });
      if (error) {
        setMessage({ type: "error", text: error.message });
        return;
      }
      window.location.href = "/login";
    });
  }, []);

  const handleDelete = useCallback(() => {
    setDeleteError(null);
    startDelete(async () => {
      const result = await deleteAccount();
      // Success redirects out of the app; only a failure ever returns here.
      if (!result.ok) setDeleteError(result.error);
    });
  }, []);

  const canDelete = confirmText === viewer.email;
  // Every workspace, not the active one: the guard in the database refuses
  // deletion while this account owns ANY program, and the box has to warn
  // about the same set or someone reading their personal workspace is
  // refused without ever having been told why.
  const ownedPrograms = available.filter(
    (workspace) => workspace.kind === "team" && workspace.role === "owner"
  );
  const ownsProgram = ownedPrograms.length > 0;
  const ownedNames = ownedPrograms.map((workspace) => workspace.name).join(", ");

  return (
    <div className="flex max-w-[660px] flex-col gap-10">
      {message && (
        <SettingsAlert
          type={message.type}
          message={message.text}
          onDismiss={() => setMessage(null)}
        />
      )}

      {/* 01 · Sign-in */}
      <section className="flex flex-col gap-[18px]">
        <SettingsSectionHeading number="01" title="Sign-in" />
        <div className="flex flex-col">
          <FactRow label="Account email">
            <span className="truncate text-[13px] text-[var(--ink-900)]">
              {viewer.email}
            </span>
            <a
              href={`mailto:${SUPPORT_EMAIL}?subject=Change%20account%20email`}
              className="ml-auto shrink-0 text-[11px] font-medium text-[var(--blue)] hover:text-[var(--blue-hover)]"
            >
              Contact support
            </a>
          </FactRow>

          <FactRow label="Method">
            <span className="text-[13px] text-[var(--ink-900)]">
              Email &amp; password
            </span>
            <span className="ml-auto shrink-0 text-[11px] text-[var(--ink-500)]">
              Magic link also enabled
            </span>
          </FactRow>

          <FactRow label="Password" className="border-b">
            <div className="flex flex-col gap-0.5">
              <span className="text-[13px] text-[var(--ink-900)]">
                Reset by email
              </span>
              <span className="text-[11px] text-[var(--ink-500)]">
                We email a one-time link; it expires in an hour.
              </span>
            </div>
            <SettingsButton
              variant="outline"
              size="sm"
              className="ml-auto"
              onClick={handlePasswordReset}
              loading={isResetting}
            >
              Reset password
            </SettingsButton>
          </FactRow>
        </div>
      </section>

      {/* 02 · Sessions.

          One row, not a device list: nothing in the app records where an
          account has been signed in, and a list assembled from the current
          session would show one device while implying it was all of them. The
          action below is genuinely global. */}
      <section className="flex flex-col gap-[18px]">
        <SettingsSectionHeading number="02" title="Where you're signed in" />
        <div className="flex items-center gap-3.5 border-y border-[var(--border-hairline)] py-3">
          <Monitor
            className="size-3.5 shrink-0 text-[var(--ink-600)]"
            strokeWidth={1.5}
            aria-hidden="true"
          />
          <div className="min-w-0">
            <div className="text-[12px] text-[var(--ink-900)]">This device</div>
            <div className="mt-0.5 text-[11px] text-[var(--ink-500)]">
              Signing out everywhere ends every other session too — phones
              included.
            </div>
          </div>
          <SettingsButton
            variant="outline"
            size="sm"
            className="ml-auto"
            onClick={handleSignOutEverywhere}
            loading={isSigningOut}
          >
            Sign out everywhere
          </SettingsButton>
        </div>
      </section>

      {/* 03 · Delete account — bounded, and the only thing in its own frame. */}
      <section className="mt-2 flex flex-col overflow-hidden rounded-[14px] border border-[var(--border-card)]">
        <div className="px-5 pb-3 pt-4">
          <SettingsSectionHeading number="03" title="Delete account" />
        </div>

        <div className="flex flex-col gap-3 px-5 pb-4">
          <span className="text-[12px] leading-[1.55] text-[var(--ink-600)]">
            Removes your personal matches, statistics, reports, and your
            account record. Matches you filed under a team stay with that
            team, as a profile its coaches manage. This cannot be undone.
          </span>

          {ownsProgram && (
            <div className="flex items-start gap-3 rounded-[8px] bg-[var(--surface-muted)] px-3.5 py-3">
              <Users
                className="mt-0.5 size-[13px] shrink-0 text-[var(--ink-600)]"
                strokeWidth={1.5}
                aria-hidden="true"
              />
              <div>
                <div className="text-[12px] text-[var(--ink-900)]">
                  You own {ownedNames}
                </div>
                <div className="mt-0.5 text-[11px] leading-[1.5] text-[var(--ink-600)]">
                  Deletion is blocked until you transfer ownership.{" "}
                  <Link
                    href="/dashboard/settings/team"
                    className="text-[var(--blue)] hover:text-[var(--blue-hover)]"
                  >
                    Team settings
                  </Link>
                </div>
              </div>
            </div>
          )}

          {deleteError && (
            <p role="alert" className="text-[12px] text-[var(--danger)]">
              {deleteError}
            </p>
          )}
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (canDelete && !isDeleting) handleDelete();
          }}
          className="flex flex-wrap items-center gap-3 border-t border-[var(--border-hairline)] bg-[var(--surface-muted)] px-5 py-3.5"
        >
          <label
            htmlFor="confirm-delete"
            className="text-[11px] text-[var(--ink-600)]"
          >
            Type your email to confirm
          </label>
          <input
            id="confirm-delete"
            type="text"
            autoComplete="off"
            spellCheck={false}
            value={confirmText}
            onChange={(event) => setConfirmText(event.target.value)}
            placeholder={viewer.email}
            className="h-[30px] w-[220px] rounded-[6px] border border-[var(--border-field)] bg-[var(--surface-card)] px-3 text-[12px] text-[var(--ink-900)] outline-none placeholder:text-[var(--ink-400)] focus:border-[var(--danger)]"
          />
          <SettingsButton
            type="submit"
            variant="danger"
            className="ml-auto"
            disabled={!canDelete}
            loading={isDeleting}
          >
            Delete account
          </SettingsButton>
        </form>
      </section>
    </div>
  );
}

function FactRow({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-4 border-t border-[var(--border-hairline)] py-3.5",
        className
      )}
    >
      <span className="w-[130px] shrink-0 text-[11px] text-[var(--ink-600)]">
        {label}
      </span>
      {children}
    </div>
  );
}
