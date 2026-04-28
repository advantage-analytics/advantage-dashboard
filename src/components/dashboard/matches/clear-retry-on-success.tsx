"use client";

import { useEffect } from "react";
import { clearRetryCount } from "./retry-state";

export function ClearRetryOnSuccess({ matchId }: { matchId: string }) {
  useEffect(() => {
    clearRetryCount(matchId);
  }, [matchId]);
  return null;
}
