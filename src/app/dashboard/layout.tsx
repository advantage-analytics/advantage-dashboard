import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
import {
  ActivityTrayLoader,
  ActivityTrayFallback,
} from "@/components/dashboard/activity/activity-tray-loader";
import { WorkspaceProvider } from "@/components/dashboard/workspace-provider";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { ToastProvider } from "@/components/dashboard/toast/toast-provider";
import { UploadFailureListener } from "@/components/dashboard/toast/upload-failure-listener";
import { timeOfDayGreeting } from "@/lib/ui/greeting";

/**
 * Dashboard layout.
 *
 * A Server Component so the viewer's workspaces resolve once per request,
 * before the shell renders — the sidebar's navigation depends on which kind of
 * workspace is active, so resolving it client-side would flash the wrong nav.
 * The interactive shell lives in `DashboardShell`.
 *
 * The workspace is the ONLY thing awaited here. The activity feed streams in
 * behind a Suspense boundary: it is chrome for a closed popover, and awaiting
 * it held up the sidebar, the header and the page content alike.
 */
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const workspace = await getWorkspaceContext();

  // Middleware refreshes the session; this covers the case where it has already
  // expired by the time the layout renders. Checked before anything else is
  // started, so a logged-out request pays for nothing it will discard.
  if (!workspace) redirect("/login");

  // First run: the three-question onboarding owns the first dashboard visit.
  // Here rather than in `src/proxy.ts` for the same reason the login gate is —
  // route protection lives beside the workspace lookup it depends on, and the
  // proxy deliberately does session refresh only. Rides the users-row select
  // `getWorkspaceContext()` already makes, so the gate costs no extra query.
  // Accounts created by invite acceptance or a program claim are stamped by
  // those flows' own server actions before any redirect that could land here,
  // so they never bounce.
  if (!workspace.viewer.onboardedAt) redirect("/onboarding");

  // The header greets by name on the personal Home (Platform Audit Pa2). The
  // word is chosen here, on the server, for the reason the page's own greeting
  // always was: rendered into the HTML, it cannot flash in or mismatch on
  // hydration. The server's clock is UTC on Vercel — the same compromise the
  // page made before the greeting moved up.
  const greeting = timeOfDayGreeting(new Date().getHours());

  return (
    <WorkspaceProvider value={workspace}>
      {/* Wraps the shell rather than sitting inside a page, because the thing
          it most needs to report — a background upload dying — happens after
          the wizard has unmounted and the person has navigated away. A toast
          host scoped to any one page would miss every one of those. */}
      <ToastProvider>
        <UploadFailureListener />
        <DashboardShell
          greeting={greeting}
          activitySlot={
            <Suspense fallback={<ActivityTrayFallback />}>
              <ActivityTrayLoader />
            </Suspense>
          }
        >
          {children}
        </DashboardShell>
      </ToastProvider>
    </WorkspaceProvider>
  );
}
