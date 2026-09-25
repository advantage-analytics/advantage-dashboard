"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { useRouter } from "next/navigation";
import { Monitor, PenLine } from "lucide-react";
import { ConfirmDialog, ConfirmNote } from "@/components/ui/confirm-dialog";
import { PersonAvatar } from "@/components/ui/person-avatar";
import { createClient } from "@/lib/supabase/client";
import { useUnsavedChanges } from "@/components/dashboard/settings/unsaved-changes-context";
import { useWorkspace } from "@/components/dashboard/workspace-provider";
import posthog from "posthog-js";

const isPostHogConfigured = Boolean(
  process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN &&
  process.env.NEXT_PUBLIC_POSTHOG_HOST,
);

/**
 * The single sign-out confirmation for the dashboard.
 *
 * Sign out is reachable from the header profile menu and Settings › Account's
 * two session rows, and all of them must land on the same confirmation. Two
 * dialogs would mean two places to keep the unsaved-changes warning correct,
 * and one of them would eventually drift.
 *
 * Two scopes, one dialog. "This device" is the default; "Sign out everywhere"
 * is the quiet footer link, and swaps the same dialog to the global question
 * rather than stacking a second one. Settings › Account's "Sign out
 * everywhere" button opens it at that step directly — it used to end every
 * session on one click, with no confirmation at all.
 *
 * The word is "Sign out", as on every entry point; this dialog alone said
 * "Log out". The account row answers the question a sign-out confirm exists
 * for — which account, on which device — and red appears only when unsaved
 * edits would go with it.
 */
type Scope = "local" | "global";

const LogoutContext = createContext<((scope: Scope) => void) | null>(null);

function useLogoutRequest() {
  const request = useContext(LogoutContext);
  if (!request) {
    throw new Error("Sign-out requests must be made within a LogoutProvider.");
  }
  return request;
}

export function useRequestLogout(): () => void {
  const request = useLogoutRequest();
  return useCallback(() => request("local"), [request]);
}

export function useRequestSignOutEverywhere(): () => void {
  const request = useLogoutRequest();
  return useCallback(() => request("global"), [request]);
}

export function LogoutProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { viewer } = useWorkspace();
  const { hasUnsavedChanges, setHasUnsavedChanges } = useUnsavedChanges();
  const [isOpen, setIsOpen] = useState(false);
  const [scope, setScope] = useState<Scope>("local");
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [hasError, setHasError] = useState(false);

  const request = useCallback((next: Scope) => {
    setScope(next);
    setHasError(false);
    setIsOpen(true);
  }, []);

  const handleSignOut = async () => {
    setIsSigningOut(true);
    setHasError(false);
    try {
      // Explicit, both ways: auth-js defaults signOut() to "global", which
      // revokes every device's refresh token. "This device" must never do
      // that; only the step that says "every device" in its title does.
      const { error } = await createClient().auth.signOut({ scope });
      if (error) throw error;
      if (isPostHogConfigured) posthog.reset();
      if (scope === "global") {
        // A full load, as Settings › Account did: every cached route belongs
        // to a session that no longer exists anywhere. The discard was
        // confirmed here, so clear the flag first — otherwise `beforeunload`
        // asks again, and "Stay" strands a signed-out user on the page.
        setHasUnsavedChanges(false);
        window.location.href = "/login";
      } else {
        router.push("/login");
      }
    } catch {
      setIsSigningOut(false);
      setHasError(true);
    }
  };

  const everywhere = scope === "global";
  const action = everywhere ? "sign out everywhere" : "sign out";

  return (
    <LogoutContext.Provider value={request}>
      {children}

      <ConfirmDialog
        open={isOpen}
        onOpenChange={setIsOpen}
        title={
          everywhere ? "Sign out of every device?" : "Sign out of Advantage?"
        }
        description={
          everywhere
            ? "Ends every session, this one included — phones too. You'll sign in again on each."
            : "You'll sign in again on this device to see your matches and reports."
        }
        tone={hasUnsavedChanges ? "danger" : "primary"}
        confirmLabel={
          hasError
            ? "Try again"
            : hasUnsavedChanges
              ? `Discard and ${action}`
              : everywhere
                ? "Sign out everywhere"
                : "Sign out"
        }
        pendingLabel="Signing out…"
        pending={isSigningOut}
        error={
          hasError
            ? "Couldn't sign out. Check your connection and try again."
            : null
        }
        onConfirm={handleSignOut}
        footerLeft={
          everywhere ? null : (
            <button
              type="button"
              disabled={isSigningOut}
              onClick={() => request("global")}
              className="cursor-pointer rounded-[var(--radius-cell)] text-[12px] font-medium whitespace-nowrap text-[var(--blue)] transition-colors hover:text-[var(--blue-hover)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
            >
              Sign out everywhere
            </button>
          )
        }
      >
        {everywhere ? null : (
          <div className="flex items-center gap-3 rounded-[var(--radius-element)] bg-[var(--surface-subtle)] px-3.5 py-2.5">
            <PersonAvatar
              initials={viewer.initials}
              photoUrl={viewer.avatarUrl}
              className="size-7 bg-[var(--surface-card)] text-[10px]"
            />
            <div className="flex min-w-0 flex-1 flex-col gap-px">
              <span className="truncate text-[12px] font-medium text-[var(--ink-900)]">
                {viewer.name}
              </span>
              <span className="truncate text-[11px] text-[var(--ink-500)]">
                {viewer.email}
              </span>
            </div>
            <span className="flex shrink-0 items-center gap-1.5 text-[11px] whitespace-nowrap text-[var(--ink-500)]">
              <Monitor
                className="size-[13px] text-[var(--ink-400)]"
                strokeWidth={1.5}
                aria-hidden="true"
              />
              This device
            </span>
          </div>
        )}
        {hasUnsavedChanges ? (
          <ConfirmNote icon={<PenLine />}>
            Your unsaved settings changes will be discarded.
          </ConfirmNote>
        ) : null}
      </ConfirmDialog>
    </LogoutContext.Provider>
  );
}
