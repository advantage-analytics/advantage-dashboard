"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/dashboard/app-sidebar"
import { DashboardHeader } from "@/components/dashboard/dashboard-header"

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
    <SidebarProvider>
      <AppSidebar />
      <main className="flex-1 w-full">
        <SidebarTrigger />
        <DashboardHeader />
        {children}
      </main>
    </SidebarProvider>
  )
}