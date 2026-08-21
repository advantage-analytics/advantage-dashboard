"use client";

import { useEffect } from "react";
import { useToast } from "./toast-provider";

/**
 * The listener `match-upload-failed` never had.
 *
 * `useUploadMatchWizard` dispatches that event from three places — the job
 * insert failing, the submit failing, and the transfer itself throwing — and
 * until now nothing subscribed. The upload runs in the background and outlives
 * the wizard by design, so by the time it dies the person is usually somewhere
 * else in the dashboard with no idea anything went wrong.
 *
 * Mounted in the dashboard shell rather than beside the wizard for exactly that
 * reason: the wizard has already unmounted when most of these fire.
 *
 * This deliberately does NOT touch `useUploadMatchWizard`. That file is under
 * active change on the events/lineups branch, and it already dispatches
 * everything needed — the defect was only ever the missing ear.
 */
export function UploadFailureListener() {
  const { push } = useToast();

  useEffect(() => {
    function onFailure(event: Event) {
      const detail = (event as CustomEvent).detail as
        | { matchId?: string; error?: string }
        | undefined;

      push({
        tone: "error",
        title: "That upload didn't finish",
        // The wizard's message is written for a person and names the real
        // cause — an expired write URL, a refused block, a failed submit.
        // Replacing it with something friendlier would drop the one detail
        // worth quoting back to support.
        body: detail?.error || "The transfer stopped before it completed.",
        action: detail?.matchId
          ? { label: "Open the match", href: `/dashboard/matches/${detail.matchId}` }
          : undefined,
      });
    }

    window.addEventListener("match-upload-failed", onFailure);
    return () => window.removeEventListener("match-upload-failed", onFailure);
  }, [push]);

  return null;
}
