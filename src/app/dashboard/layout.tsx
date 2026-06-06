"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { Header } from "@/app/dashboard/header";
import { AppSidebar } from "@/components/dashboard/app-sidebar";
import { MobileGate } from "@/components/dashboard/mobile-gate";
import { PageTransition } from "@/components/dashboard/page-transition";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { UnsavedChangesProvider } from "@/components/dashboard/settings/unsaved-changes-context";

/**
 * Dashboard Layout Component
 *
 * MODIFICATIONS MADE IN THIS SESSION:
 * 1. Added upload data cleanup when leaving the upload flow
 * 2. Clears localStorage data (selectedProvider, uploadFormData, uploadedFile) when navigating away from upload pages
 * 3. Ensures fresh start when returning to upload flow later
 */
export default function Layout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  /**
   * Clear upload data when leaving the upload flow
   * MODIFICATION: Added to prevent upload data from persisting when browsing other parts of the site
   * This ensures a clean slate when returning to the upload flow
   */
  useEffect(() => {
    // Check if we're leaving the upload flow
    if (!pathname.startsWith('/dashboard/upload')) {
      localStorage.removeItem("selectedProvider");
      localStorage.removeItem("uploadFormData");
      localStorage.removeItem("uploadedFile");
    }
  }, [pathname]);

  return (
    <UnsavedChangesProvider>
      <SidebarProvider defaultOpen={false} style={{ "--sidebar-width": "240px" } as React.CSSProperties}>
        <AppSidebar />
        <SidebarInset className="bg-white h-screen overflow-y-auto scroll-smooth motion-reduce:scroll-auto">
          <Header />
          <main>
            <PageTransition>
              {children}
            </PageTransition>
          </main>
        </SidebarInset>
        <MobileGate />
      </SidebarProvider>
    </UnsavedChangesProvider>
  );
}