import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
import {
  ActivityTrayLoader,
  ActivityTrayFallback,
} from "@/components/dashboard/activity/activity-tray-loader";
import { WorkspaceProvider } from "@/components/dashboard/workspace-provider";
import { PresenceProvider } from "@/components/dashboard/presence-provider";
import { getWorkspacePresence } from "@/lib/workspace/presence-server";
import { cookies } from "next/headers";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { SIDEBAR_COOKIE } from "@/components/dashboard/sidebar/sidebar-cookie";
import { ToastProvider } from "@/components/dashboard/toast/toast-provider";
import { UploadFailureListener } from "@/components/dashboard/toast/upload-failure-listener";
import { readMissingLegalDocuments } from "@/lib/legal/acceptance-server";
import { createClient } from "@/lib/supabase/server";
import { loginRedirectPath } from "@/lib/auth/request-path";

/**
 * Dashboard layout.
 *
 * A Server Component so the viewer's workspaces resolve once per request,
 * before the shell renders — the sidebar's navigation depends on which kind of
 * workspace is active, so resolving it client-side would flash the wrong nav.
 * The interactive shell lives in `DashboardShell`.
 *
 * The workspace is the only thing awaited here. The presence read that depends
 * on it is started, not awaited, and handed down as a promise; the activity
 * feed streams in behind a Suspense boundary: it is chrome for a closed
 * popover, and awaiting it held up the sidebar, the header and the page
 * content alike.
 */
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const workspace = await getWorkspaceContext();
  // The sidebar's last width in this browser, so the shell renders it as the
  // reader left it rather than opening it after hydration.
  const sidebarExpanded = (await cookies()).get(SIDEBAR_COOKIE)?.value === "1";

  // Middleware refreshes the session; this covers the case where it has already
  // expired by the time the layout renders. Checked before anything else is
  // started, so a logged-out request pays for nothing it will discard.
  if (!workspace) redirect(await loginRedirectPath("/dashboard"));

  // First run: the three-question onboarding owns the first dashboard visit.
  // Here rather than in `src/proxy.ts` for the same reason the login gate is —
  // route protection lives beside the workspace lookup it depends on, and the
  // proxy deliberately does session refresh only. Rides the users-row select
  // `getWorkspaceContext()` already makes, so the gate costs no extra query.
  // Accounts created by invite acceptance or a program claim are stamped by
  // those flows' own server actions before any redirect that could land here,
  // so they never bounce.
  if (!workspace.viewer.onboardedAt) redirect("/onboarding");

  // Then the terms: an account with no current-version acceptance of a
  // document it needs (Terms, Privacy, and for a guardian the Guardian Terms)
  // agrees once on `/terms-update` before the dashboard opens. One indexed
  // read of the viewer's own rows; a failed read lets them through
  // (`readMissingLegalDocuments`).
  const missingLegal = await readMissingLegalDocuments(
    await createClient(),
    workspace.viewer.id,
    workspace.viewer.role,
  );
  if (missingLegal.length > 0) redirect("/terms-update");

  // Whether the workspace holds anything yet, so a route's loading fallback
  // can draw that page's day zero instead of skeleton rows nobody has. A
  // handful of `limit(1)` reads in parallel, and never fatal (it never
  // rejects) — see `getWorkspacePresence`. Not awaited: awaiting it held the
  // shell and every loading fallback behind one more round trip. The
  // fallbacks that need it wait on it themselves (`PresenceGate`), drawing
  // their skeleton meanwhile, and `cache()` hands a page that asks too (Home)
  // this same in-flight read.
  const presence = getWorkspacePresence(workspace);

  return (
    <WorkspaceProvider value={workspace}>
      <PresenceProvider value={presence}>
        {/* Wraps the shell rather than sitting inside a page, because the thing
          it most needs to report — a background upload dying — happens after
          the wizard has unmounted and the person has navigated away. A toast
          host scoped to any one page would miss every one of those. */}
        <ToastProvider>
          <UploadFailureListener />
          <DashboardShell
            sidebarExpanded={sidebarExpanded}
            activitySlot={
              <Suspense fallback={<ActivityTrayFallback />}>
                <ActivityTrayLoader />
              </Suspense>
            }
          >
            {children}
          </DashboardShell>
        </ToastProvider>
      </PresenceProvider>
    </WorkspaceProvider>
  );
}
