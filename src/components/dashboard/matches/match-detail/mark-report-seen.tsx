"use client";

import { useEffect } from "react";
import { markReportSeen } from "@/lib/ui/seen-reports";

/** No UI — records that this report has been opened, so "New" clears. */
export function MarkReportSeen({ matchId }: { matchId: string }) {
  useEffect(() => {
    markReportSeen(matchId);
  }, [matchId]);
  return null;
}
