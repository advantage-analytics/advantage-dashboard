"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { Header } from "@/app/dashboard/header";
import { AppSidebar } from "@/components/dashboard/app-sidebar";
import { MobileGate } from "@/components/dashboard/mobile-gate";
import { PageTransition } from "@/components/dashboard/page-transition";
import { SidebarStateProvider } from "@/components/dashboard/sidebar/sidebar-state";
import { UnsavedChangesProvider } from "@/components/dashboard/settings/unsaved-changes-context";
import { LogoutProvider } from "@/components/dashboard/logout-dialog";
import { HeaderStatusProvider } from "@/components/dashboard/header-status";
import {
  STORAGE_KEYS,
  clearStorageData,
} from "@/components/dashboard/matches/new-match-wizard/utils";

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
  children,
}: {
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
      {/* Inside UnsavedChangesProvider — the confirmation warns about unsaved
          work, so it has to be able to read it. */}
      <LogoutProvider>
        <SidebarStateProvider>
          {/* Wraps both, because the page sets the status and the header reads it. */}
          <HeaderStatusProvider>
            <div className="flex h-screen w-full overflow-hidden bg-white">
              <AppSidebar />
              <div className="flex min-w-0 flex-1 flex-col overflow-y-auto scroll-smooth motion-reduce:scroll-auto">
                <Header activitySlot={activitySlot} />
                {/* Grows to fill whatever the header leaves, so a page shorter
                    than the viewport can still push its own footer to the
                    bottom edge instead of leaving it hanging under the cards.
                    Content taller than the viewport is unaffected — `flex-1`
                    cannot shrink a flex item below its min-content height, so
                    tall pages keep scrolling in normal flow. */}
                <main className="flex flex-1 flex-col">
                  <PageTransition>{children}</PageTransition>
                </main>
              </div>
            </div>
          </HeaderStatusProvider>
          <MobileGate />
        </SidebarStateProvider>
      </LogoutProvider>
    </UnsavedChangesProvider>
  );
}
