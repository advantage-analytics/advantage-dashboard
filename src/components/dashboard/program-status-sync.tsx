"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useWorkspace } from "@/components/dashboard/workspace-provider";
import { createClient } from "@/lib/supabase/client";
import {
  holdsUploadFlow,
  watchProgramStatus,
} from "@/lib/workspace/program-status-watch";

/**
 * Refreshes the dashboard when an admin decides this program's claim, so the
 * coach does not have to reload to see it. Runs only while the claim is pending;
 * once the refresh lands, `programStatus` has moved on and this stops.
 *
 * Holds off on the pages that mount the upload flow (`holdsUploadFlow`): a
 * refresh there drops the file selection, and SwingVision imports work during
 * review. Leaving one changes the pathname, which checks again straight away.
 */
export function ProgramStatusSync() {
  const pathname = usePathname();
  const router = useRouter();
  const { active } = useWorkspace();

  const pendingProgram =
    active.kind === "team" && active.programStatus === "claim_pending"
      ? active.id
      : null;
  const inUploadFlow = holdsUploadFlow(pathname);

  useEffect(() => {
    if (!pendingProgram || inUploadFlow) return;
    const supabase = createClient();

    return watchProgramStatus({
      current: "claim_pending",
      read: async () => {
        const { data, error } = await supabase
          .from("programs")
          .select("status")
          .eq("id", pendingProgram)
          .maybeSingle();
        return error || !data ? null : (data.status as string);
      },
      onDecided: () => router.refresh(),
      surface: {
        isHidden: () => document.hidden,
        onReturn: (listener) => {
          window.addEventListener("focus", listener);
          document.addEventListener("visibilitychange", listener);
          return () => {
            window.removeEventListener("focus", listener);
            document.removeEventListener("visibilitychange", listener);
          };
        },
        setInterval: (run, ms) => {
          const id = window.setInterval(run, ms);
          return () => window.clearInterval(id);
        },
      },
    });
  }, [pendingProgram, inUploadFlow, router]);

  return null;
}
