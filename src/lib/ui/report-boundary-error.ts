import posthog from "posthog-js";
import { useEffect } from "react";
import { isPostHogConfigured } from "@/lib/posthog-client";
import { isClosedResponse } from "@/lib/ui/action-rejected";

/**
 * Reports what a segment's `error.tsx` caught, when nothing else will have.
 *
 * `capture_exceptions` only sees what nobody caught, and an error boundary
 * catches: a render crash in the browser shows the error screen and reaches no
 * one. Two kinds stay out:
 *
 * - **A `digest` means the server threw.** `onRequestError` in
 *   `instrumentation.ts` has already captured it, with the route, and this would
 *   be the same failure counted twice.
 * - **A response that died part-way through** is the reader's connection, and
 *   nothing we can fix.
 */
export function useReportBoundaryError(error: Error & { digest?: string }) {
  useEffect(() => {
    if (!isPostHogConfigured || error.digest || isClosedResponse(error)) return;
    posthog.captureException(error, { source: "error_boundary" });
  }, [error]);
}
