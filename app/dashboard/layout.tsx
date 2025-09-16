import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { AppSidebar } from "./components/app-sidebar"
import { DashboardHeader } from "./components/dashboard-header"

export default function Layout({ children }: { children: React.ReactNode }) {
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