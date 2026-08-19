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
      localStorage.removeItem("selectedProvider");
      localStorage.removeItem("uploadFormData");
      localStorage.removeItem("uploadedFile");
    }
  }, [pathname]);

  return (
    <UnsavedChangesProvider>
      {/* Inside UnsavedChangesProvider — the confirmation warns about unsaved
          work, so it has to be able to read it. */}
      <LogoutProvider>
        <SidebarStateProvider>
          <div className="flex h-screen w-full overflow-hidden bg-white">
            <AppSidebar />
            <div className="flex min-w-0 flex-1 flex-col overflow-y-auto scroll-smooth motion-reduce:scroll-auto">
              <Header activitySlot={activitySlot} />
              <main>
                <PageTransition>{children}</PageTransition>
              </main>
            </div>
          </div>
          <MobileGate />
        </SidebarStateProvider>
      </LogoutProvider>
    </UnsavedChangesProvider>
  );
}
