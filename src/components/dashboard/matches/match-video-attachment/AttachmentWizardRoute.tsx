"use client";

import {
  MatchVideoAttachmentFlow,
  type MatchVideoAttachmentFlowProps,
} from "./MatchVideoAttachmentFlow";
import type { AttachmentWizardProps } from "@/lib/data/match-video-attachment-server";

/**
 * The attachment wizard as the route renders it.
 *
 * ── It does not navigate on save ────────────────────────────────────────────
 * It used to: `router.replace(returnTarget.href)` the moment the attachment
 * was published, so the person never saw the upload finish. Now the flow
 * settles on its own "Video saved" screen (`AttachmentUploadStatus`), whose
 * "Watch the film" goes to `returnTarget.href` — the same value the footer's
 * Cancel uses, built once on the server by `matchFilmHref()` — and whose links
 * `replace` the finished wizard in history, for the reason this file used to
 * give: Back onto it would land on an add whose attachment now exists.
 *
 * No `router.refresh()` either. The Film view is another route, fetched fresh
 * when the link is followed; refreshing THIS route re-runs its server check,
 * which redirects an add whose attachment now exists — away from the saved
 * screen before anyone reads it.
 *
 * What is left is the client boundary the Server Component page renders, and
 * the flow's test seams, which production never passes.
 */
export function AttachmentWizardRoute(
  props: AttachmentWizardProps &
    Pick<MatchVideoAttachmentFlowProps, "onSaved" | "deps">,
) {
  return <MatchVideoAttachmentFlow {...props} />;
}
