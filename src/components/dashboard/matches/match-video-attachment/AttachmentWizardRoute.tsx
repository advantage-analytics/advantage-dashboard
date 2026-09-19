"use client";

import { useCallback, useRef } from "react";
import { useRouter } from "next/navigation";

import { MatchVideoAttachmentFlow } from "./MatchVideoAttachmentFlow";
import type { AttachmentWizardProps } from "@/lib/data/match-video-attachment-server";

/**
 * The attachment wizard as the route renders it: the flow, plus the one thing
 * only a client may do — go back to the match once the save has landed.
 *
 * The flow itself takes `onSaved` and navigates nowhere on its own ("the
 * caller owns the navigation"), and the route that renders it is a Server
 * Component, which cannot hand a function down. This is that seam and nothing
 * else; it holds no state the flow does not already hold.
 *
 * ── Where it goes, and why it is not spelled here ───────────────────────────
 * `returnTarget.href` — the same value the footer's Cancel uses, built once on
 * the server by `matchFilmHref()`, which writes the EXISTING `?tab=film`
 * selection that `parseReportView()` reads. Nothing in this file constructs a
 * URL: a second spelling of the Film view is exactly how the return target and
 * the Cancel target drift apart.
 *
 * ── `replace`, not `push` ───────────────────────────────────────────────────
 * The wizard is finished. Leaving it on the history stack means Back lands on
 * a completed upload in a mode the route will now refuse — an add whose
 * attachment exists — and bounce forward again, which reads as the button not
 * working. `refresh()` follows so the match page re-runs its loaders and the
 * Video view shows what was just saved rather than the state it was rendered
 * with.
 *
 * Fired once. `save.status === "saved"` already holds the flow inert, but a
 * latch costs one ref and makes a double navigation impossible rather than
 * merely unlikely.
 */
export function AttachmentWizardRoute(props: AttachmentWizardProps) {
  const router = useRouter();
  const href = props.returnTarget.href;
  const returned = useRef(false);

  const onSaved = useCallback(() => {
    if (returned.current) return;
    returned.current = true;
    router.replace(href);
    router.refresh();
  }, [router, href]);

  return <MatchVideoAttachmentFlow {...props} onSaved={onSaved} />;
}
