"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { seedLabelSessionAction } from "@/app/admin/labels/actions";

/**
 * Start (or continue) labelling a job: seed its session through the server
 * action, then open it. The Labels list's rows call this on a click.
 */
export function useStartLabelling(jobId: string) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const start = () => {
    setError(null);
    startTransition(async () => {
      const result = await seedLabelSessionAction(jobId);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.push(`/admin/labels/${result.sessionId}`);
    });
  };
  return { start, isPending, error };
}
