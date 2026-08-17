"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { Header } from "@/app/dashboard/header";
import { AppSidebar } from "@/components/dashboard/app-sidebar";
import { MobileGate } from "@/components/dashboard/mobile-gate";
import { PageTransition } from "@/components/dashboard/page-transition";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { UnsavedChangesProvider } from "@/components/dashboard/settings/unsaved-changes-context";
import { LogoutProvider } from "@/components/dashboard/logout-dialog";
import type { ActivityFeed } from "@/lib/data/activity-server";

/**
 * The client half of the dashboard layout.
 *
 * Split out when workspaces arrived: the layout has to resolve the viewer's
 * workspaces on the server, and a `"use client"` layout cannot. Everything
 * here is unchanged from when this lived in `layout.tsx` — the providers, the
 * shell, and the upload-storage cleanup below.
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
        <SidebarProvider
          defaultOpen={false}
          style={{ "--sidebar-width": "240px" } as React.CSSProperties}
        >
          <AppSidebar />
          <SidebarInset className="bg-white h-screen overflow-y-auto scroll-smooth motion-reduce:scroll-auto">
            <Header activitySlot={activitySlot} />
            <main>
              <PageTransition>{children}</PageTransition>
            </main>
          </SidebarInset>
          <MobileGate />
        </SidebarProvider>
      </LogoutProvider>
    </UnsavedChangesProvider>
  );
}
