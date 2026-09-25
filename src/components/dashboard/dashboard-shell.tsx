"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import posthog from "posthog-js";
import { Header } from "@/app/dashboard/header";
import { AppSidebar } from "@/components/dashboard/app-sidebar";
import { MobileGate } from "@/components/dashboard/mobile-gate";
import { PageTransition } from "@/components/dashboard/page-transition";
import { SidebarStateProvider } from "@/components/dashboard/sidebar/sidebar-state";
import { UnsavedChangesProvider } from "@/components/dashboard/settings/unsaved-changes-context";
import { LogoutProvider } from "@/components/dashboard/logout-dialog";
import { LeaveGuardProvider } from "@/components/dashboard/leave-guard-context";
import { HeaderStatusProvider } from "@/components/dashboard/header-status";
import { HeaderSlotProvider } from "@/components/dashboard/header-slot";
import { WorkspaceSync } from "@/components/dashboard/workspace-sync";
import { BetaWelcome } from "@/components/dashboard/beta-welcome-dialog";
import { useWorkspace } from "@/components/dashboard/workspace-provider";
import {
  STORAGE_KEYS,
  clearStorageData,
} from "@/components/dashboard/matches/new-match-wizard/utils";

const isPostHogConfigured = Boolean(
  process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN &&
  process.env.NEXT_PUBLIC_POSTHOG_HOST,
);

/**
 * The client half of the dashboard layout.
 *
 * Split out when workspaces arrived: the layout resolves the viewer's
 * workspaces on the server, and a `"use client"` layout cannot.
 *
 * A plain flex row rather than the shadcn `SidebarProvider`. Its cookie, its
 * mobile sheet and its own trigger are all things this sidebar owns itself —
 * the collapse spec puts the toggle in the rail's bottom group and remembers
 * the width per device — so the provider was scaffolding around a state this
 * layout already keeps.
 */
export function DashboardShell({
  activitySlot,
  greeting,
  children,
}: {
  /**
   * "Good morning" / "Good afternoon" / "Good evening", chosen by the layout
   * on the server. The header shows it on the personal Home's leading slot.
   */
  greeting: string;
  /**
   * The activity tray, already wrapped in its Suspense boundary by the layout.
   * Passed as a node rather than as data so the server component inside it can
   * stream — a client component cannot await, but it can render what it is
   * handed.
   */
  activitySlot: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { viewer, active } = useWorkspace();

  // The layout only renders with an authenticated workspace context. Identifying
  // here persists the Supabase UUID across dashboard page loads and attributes
  // automatic exception capture and future events to the signed-in person.
  // The id only: an email would be a second copy of personal data in PostHog,
  // and the id resolves to it in Supabase whenever it is needed.
  useEffect(() => {
    if (isPostHogConfigured && posthog.get_distinct_id() !== viewer.id) {
      posthog.identify(viewer.id);
    }
  }, [viewer.id]);

  // Stamp the active workspace on every event that follows, so any insight can
  // be broken down by team — "which programs uploaded video this month" — and
  // personal use told apart from team use. Super properties rather than
  // posthog.group(): group analytics is a paid PostHog add-on and this project
  // is on the free plan. Re-registered on every switch; logout's
  // posthog.reset() clears them.
  useEffect(() => {
    if (!isPostHogConfigured) return;
    posthog.register({
      workspace_id: active.id,
      workspace_kind: active.kind,
      workspace_name: active.name,
      workspace_role: active.role,
      workspace_org_type: active.orgType,
      workspace_team: active.team,
    });
  }, [
    active.id,
    active.kind,
    active.name,
    active.role,
    active.orgType,
    active.team,
  ]);

  /**
   * Clear upload data when leaving the upload flow, so returning to the wizard
   * starts clean. The path is the wizard's own route — this used to name
   * `/dashboard/upload`, which no route has ever matched, so the guard never
   * held and storage was cleared everywhere.
   */
  useEffect(() => {
    if (!pathname.startsWith("/dashboard/matches/new")) {
      // "Save draft" in the wizard's footer sets this flag, and it is the one
      // departure that must NOT wipe the draft — that is the whole point of
      // the button. The wizard removes the flag when it next mounts.
      if (localStorage.getItem(STORAGE_KEYS.DRAFT_KEPT)) return;
      clearStorageData();
    }
  }, [pathname]);

  return (
    <UnsavedChangesProvider>
      {/* Asks before the chrome's links leave an upload in progress. A
          sibling of the unsaved-changes guard, not a use of it: the chrome
          consults only this one. */}
      <LeaveGuardProvider>
        {/* Inside UnsavedChangesProvider — the confirmation warns about unsaved
          work, so it has to be able to read it. */}
        <LogoutProvider>
          <SidebarStateProvider>
            {/* Wraps both, because the page sets the status and the header reads it. */}
            <HeaderStatusProvider>
              {/* Same reason, other end of the bar: the page publishes a leading
              slot and the header reads it. */}
              <HeaderSlotProvider>
                {/* Keeps this chrome on the workspace the cookie names — see
                  WorkspaceSync for why a navigation can leave it behind. */}
                <WorkspaceSync />
                <div className="flex h-screen w-full overflow-hidden bg-white">
                  <AppSidebar />
                  {/* The gutter is reserved even when nothing overflows: with
                    always-visible scrollbars, a page whose height changes (a
                    skeleton swapping for its rows) would otherwise gain and
                    lose 15px of width and slide every fluid table column. */}
                  <div className="flex min-w-0 flex-1 flex-col overflow-y-auto scroll-smooth [scrollbar-gutter:stable] motion-reduce:scroll-auto">
                    <Header activitySlot={activitySlot} greeting={greeting} />
                    {/* Grows to fill whatever the header leaves, so a page shorter
                    than the viewport can still push its own footer to the
                    bottom edge instead of leaving it hanging under the cards.
                    Content taller than the viewport is unaffected — `flex-1`
                    cannot shrink a flex item below its min-content height, so
                    tall pages keep scrolling in normal flow. */}
                    <main className="flex flex-1 flex-col">
                      {/* Once per browser, and never over the upload wizard:
                        a task you're inside is not interrupted by news about
                        the account. */}
                      {!pathname.startsWith("/dashboard/matches/new") && (
                        <BetaWelcome />
                      )}
                      <PageTransition>{children}</PageTransition>
                    </main>
                  </div>
                </div>
              </HeaderSlotProvider>
            </HeaderStatusProvider>
            <MobileGate />
          </SidebarStateProvider>
        </LogoutProvider>
      </LeaveGuardProvider>
    </UnsavedChangesProvider>
  );
}
