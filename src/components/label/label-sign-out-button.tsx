"use client";

import { useState } from "react";
import posthog from "posthog-js";
import { createClient } from "@/lib/supabase/client";
import { isPostHogConfigured } from "@/lib/posthog-client";

/**
 * The `/label` header's way out. The same call the admin account menu makes —
 * `signOut({ scope: "local" })`, so signing out here never revokes the
 * labeller's session on another device (auth-js defaults to "global") — then
 * a full load of `/login`, because every cached route belonged to the session
 * that just ended.
 *
 * A plain text action rather than the admin's account menu: a labeller has
 * nowhere else to go from here (no dashboard link, no workspaces), so a menu
 * with one row would be chrome imitating chrome.
 */
export function LabelSignOutButton() {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const signOut = async () => {
    setBusy(true);
    setFailed(false);
    try {
      const { error } = await createClient().auth.signOut({ scope: "local" });
      if (error) throw error;
      if (isPostHogConfigured) posthog.reset();
      window.location.assign("/login");
    } catch {
      setBusy(false);
      setFailed(true);
    }
  };

  return (
    <button
      type="button"
      onClick={signOut}
      disabled={busy}
      aria-busy={busy}
      className="flex h-[30px] cursor-pointer items-center rounded-[var(--radius-button)] px-2.5 text-[12px] whitespace-nowrap text-[var(--ink-600)] transition-colors duration-200 hover:bg-[var(--surface-subtle)] hover:text-[var(--ink-900)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none disabled:cursor-progress disabled:opacity-50"
    >
      {busy
        ? "Signing out…"
        : failed
          ? "Couldn't sign out. Try again"
          : "Sign out"}
    </button>
  );
}
