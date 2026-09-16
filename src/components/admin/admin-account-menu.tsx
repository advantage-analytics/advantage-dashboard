"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronLeft, LogOut, Monitor } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  FloatMenu,
  FloatMenuDivider,
  FloatMenuItem,
} from "@/components/ui/float-menu";
import { PersonAvatar } from "@/components/ui/person-avatar";
import { createClient } from "@/lib/supabase/client";

/**
 * The admin shell's account control — the chrome's one circle, and the only
 * way out of the admin area.
 *
 * It is a second implementation of the dashboard's account menu rather than a
 * reuse of `LogoutProvider`, and deliberately: that provider reads
 * `useWorkspace()` and `useUnsavedChanges()`, two contexts the admin tree does
 * not mount and should not — admin is not scoped to a workspace, and nothing
 * here holds an unsaved draft. What it does reuse is everything that carries
 * the design: `FloatMenu` for the surface, `ConfirmDialog` for the question,
 * and the same `signOut({ scope: "local" })` call, so "sign out" means the same
 * thing on both sides of the app and never revokes a phone's session by
 * accident (auth-js defaults the scope to "global").
 *
 * Two rows only. Admin has no preferences, no usage and no plan, so the
 * dashboard profile menu's capsules and workspace list have nothing to say
 * here; inventing them would be chrome imitating chrome.
 */
export function AdminAccountMenu({
  name,
  email,
  initials,
  avatarUrl,
}: {
  name: string;
  email: string;
  initials: string;
  avatarUrl?: string | null;
}) {
  const router = useRouter();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [hasError, setHasError] = useState(false);

  const handleSignOut = async () => {
    setIsSigningOut(true);
    setHasError(false);
    try {
      const { error } = await createClient().auth.signOut({ scope: "local" });
      if (error) throw error;
      router.push("/login");
    } catch {
      setIsSigningOut(false);
      setHasError(true);
    }
  };

  return (
    <>
      <FloatMenu
        open={isMenuOpen}
        onOpenChange={setIsMenuOpen}
        label="Account"
        width={232}
        trigger={
          <button
            type="button"
            aria-label={name}
            aria-expanded={isMenuOpen}
            className="flex cursor-pointer items-center gap-1.5 rounded-[var(--radius-pill)] py-1 pr-1.5 pl-1 transition-colors duration-200 hover:bg-[var(--surface-subtle)]"
          >
            <PersonAvatar
              initials={initials}
              photoUrl={avatarUrl}
              className="size-[26px] text-[9px]"
            />
            <ChevronDown
              className={`size-3 text-[var(--ink-500)] transition-transform duration-200 ${
                isMenuOpen ? "rotate-180" : ""
              }`}
              strokeWidth={1.5}
              aria-hidden="true"
            />
          </button>
        }
      >
        <FloatMenuItem
          label="Back to the dashboard"
          icon={
            <ChevronLeft
              className="size-[13px] text-[var(--ink-400)]"
              strokeWidth={1.5}
            />
          }
          onSelect={() => {
            setIsMenuOpen(false);
            router.push("/dashboard");
          }}
        />
        <FloatMenuDivider />
        <FloatMenuItem
          label="Sign out"
          icon={
            <LogOut
              className="size-[13px] text-[var(--ink-400)]"
              strokeWidth={1.5}
            />
          }
          onSelect={() => {
            setIsMenuOpen(false);
            setHasError(false);
            setIsDialogOpen(true);
          }}
        />
      </FloatMenu>

      <ConfirmDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        title="Sign out of Advantage?"
        description="You'll sign in again on this device to see the review queue."
        // Signing out loses nothing, so it stays the blue primary.
        tone="primary"
        confirmLabel={hasError ? "Try again" : "Sign out"}
        pendingLabel="Signing out…"
        pending={isSigningOut}
        error={
          hasError
            ? "Couldn't sign out. Check your connection and try again."
            : null
        }
        onConfirm={handleSignOut}
      >
        <div className="flex items-center gap-3 rounded-[var(--radius-element)] bg-[var(--surface-subtle)] px-3.5 py-2.5">
          <PersonAvatar
            initials={initials}
            photoUrl={avatarUrl}
            className="size-7 bg-[var(--surface-card)] text-[10px]"
          />
          <div className="flex min-w-0 flex-1 flex-col gap-px">
            <span className="truncate text-[12px] font-medium text-[var(--ink-900)]">
              {name}
            </span>
            <span className="truncate text-[11px] text-[var(--ink-500)]">
              {email}
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
      </ConfirmDialog>
    </>
  );
}
